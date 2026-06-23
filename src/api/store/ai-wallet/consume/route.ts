import {
  AuthenticatedMedusaRequest,
  MedusaResponse,
} from "@medusajs/framework/http"
import { Modules } from "@medusajs/framework/utils"
import { Client } from "pg"

import {
  AI_WALLET_MODULE,
  createAiCreditLedgerId,
  createAiWalletId,
  formatAiWallet,
  isAiWalletStorageMissing,
  sanitizeText,
} from "../../../../lib/ai-wallet"

type ConsumeBody = {
  tool?: unknown
  usage_id?: unknown
  note?: unknown
  units?: unknown
}

const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000

const normalizeUnits = (value: unknown, fallback = 1) => {
  const parsed = Number(value)

  if (!Number.isFinite(parsed) || parsed <= 0) {
    return fallback
  }

  return Math.min(Math.max(1, Math.ceil(parsed)), 10)
}

const getIstDayWindow = (now = new Date()) => {
  const istNow = new Date(now.getTime() + IST_OFFSET_MS)
  const startIst = Date.UTC(
    istNow.getUTCFullYear(),
    istNow.getUTCMonth(),
    istNow.getUTCDate(),
    0,
    0,
    0,
    0
  )
  const start = new Date(startIst - IST_OFFSET_MS)
  const end = new Date(start.getTime() + 24 * 60 * 60 * 1000)

  return { start, end }
}

const getLedgerUnits = (ledger: any) => {
  const metadataUnits = Number(ledger?.metadata_json?.units)

  if (Number.isFinite(metadataUnits) && metadataUnits > 0) {
    return Math.ceil(metadataUnits)
  }

  return Math.max(1, Math.abs(Number(ledger?.credits || 0)) || 1)
}

const isWalletProActive = (wallet?: any) => {
  if (!wallet || !wallet.plan || wallet.plan === "free") {
    return false
  }

  if (!wallet.plan_expires_at) {
    return true
  }

  return new Date(wallet.plan_expires_at).getTime() > Date.now()
}

const chargeWalletWithLock = async ({
  walletId,
  customerId,
  customerEmail,
  tool,
  usageId,
  note,
  units,
}: {
  walletId: string
  customerId: string
  customerEmail?: string | null
  tool: string
  usageId?: string | null
  note?: string | null
  units: number
}) => {
  if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL is required for AI wallet charging")
  }

  const client = new Client({ connectionString: process.env.DATABASE_URL })
  await client.connect()

  try {
    await client.query("begin")

    const existingLedgerResult = usageId
      ? await client.query(
          `
            select *
            from ai_credit_ledger
            where customer_id = $1
              and usage_id = $2
              and deleted_at is null
            limit 1
          `,
          [customerId, usageId]
        )
      : { rows: [] as any[] }
    const existingLedger = existingLedgerResult.rows[0]

    const walletResult = await client.query(
      `
        select *
        from ai_wallet
        where id = $1
          and customer_id = $2
          and deleted_at is null
        for update
      `,
      [walletId, customerId]
    )
    const lockedWallet = walletResult.rows[0]

    if (!lockedWallet) {
      throw new Error("AI wallet not found during locked charge")
    }

    if (existingLedger) {
      await client.query("commit")

      return {
        allowed: true,
        charged: existingLedger.type === "consume",
        charged_units:
          existingLedger.type === "consume" ? getLedgerUnits(existingLedger) : 0,
        units: getLedgerUnits(existingLedger),
        ledger: existingLedger,
        wallet: lockedWallet,
        idempotent: true,
      }
    }

    if (isWalletProActive(lockedWallet)) {
      const { start, end } = getIstDayWindow()
      const proLimit = Math.max(0, Number(lockedWallet.pro_question_limit || 0))

      if (proLimit > 0) {
        const usageResult = await client.query(
          `
            select coalesce(sum(
              greatest(
                1,
                coalesce(
                  case
                    when coalesce(metadata_json->>'units', '') ~ '^[0-9]+$'
                    then (metadata_json->>'units')::integer
                    else null
                  end,
                  abs(credits),
                  1
                )
              )
            ), 0)::integer as used_today
            from ai_credit_ledger
            where customer_id = $1
              and type = 'premium_usage'
              and deleted_at is null
              and created_at >= $2
              and created_at < $3
          `,
          [customerId, start, end]
        )
        const usedToday = Number(usageResult.rows[0]?.used_today || 0)

        if (usedToday + units > proLimit) {
          await client.query("rollback")

          return {
            allowed: false,
            status: 402,
            message: `Premium daily AI limit reached. You can use ${proLimit} calls per day.`,
            premium_daily_limit: proLimit,
            premium_used_today: usedToday,
            requested_units: units,
            wallet: lockedWallet,
          }
        }
      }

      const ledgerId = createAiCreditLedgerId()
      const ledgerResult = await client.query(
        `
          insert into ai_credit_ledger (
            id, wallet_id, customer_id, customer_email, type, source, credits,
            balance_after, order_id, usage_id, note, metadata_json, created_at, updated_at
          )
          values ($1, $2, $3, $4, 'premium_usage', $5, 0, $6, null, $7, $8, $9::jsonb, now(), now())
          returning *
        `,
        [
          ledgerId,
          lockedWallet.id,
          customerId,
          customerEmail,
          tool,
          Math.max(0, Number(lockedWallet.credit_balance || 0)),
          usageId,
          note,
          JSON.stringify({
            units,
            billing_mode: "premium",
            plan: lockedWallet.plan || "premium",
            plan_expires_at: lockedWallet.plan_expires_at || null,
            pro_question_limit: lockedWallet.pro_question_limit || 0,
          }),
        ]
      )

      await client.query("commit")

      return {
        allowed: true,
        charged: false,
        charged_units: 0,
        premium_units: units,
        ledger: ledgerResult.rows[0],
        wallet: lockedWallet,
      }
    }

    const balance = Math.max(0, Number(lockedWallet.credit_balance || 0))

    if (balance < units) {
      await client.query("rollback")

      return {
        allowed: false,
        status: 402,
        message: `You need ${units} AI credit${units > 1 ? "s" : ""}. Please buy credits or upgrade.`,
        requested_units: units,
        wallet: lockedWallet,
      }
    }

    const nextBalance = balance - units
    const updatedWalletResult = await client.query(
      `
        update ai_wallet
        set credit_balance = $1,
          customer_email = $2,
          updated_at = now()
        where id = $3
        returning *
      `,
      [nextBalance, customerEmail, lockedWallet.id]
    )
    const ledgerResult = await client.query(
      `
        insert into ai_credit_ledger (
          id, wallet_id, customer_id, customer_email, type, source, credits,
          balance_after, order_id, usage_id, note, metadata_json, created_at, updated_at
        )
        values ($1, $2, $3, $4, 'consume', $5, $6, $7, null, $8, $9, $10::jsonb, now(), now())
        returning *
      `,
      [
        createAiCreditLedgerId(),
        lockedWallet.id,
        customerId,
        customerEmail,
        tool,
        -units,
        nextBalance,
        usageId,
        note,
        JSON.stringify({
          units,
          billing_mode: "credit",
        }),
      ]
    )

    await client.query("commit")

    return {
      allowed: true,
      charged: true,
      charged_units: units,
      ledger: ledgerResult.rows[0],
      wallet: updatedWalletResult.rows[0],
    }
  } catch (error) {
    await client.query("rollback").catch(() => undefined)
    throw error
  } finally {
    await client.end().catch(() => undefined)
  }
}

const getCustomerId = (req: AuthenticatedMedusaRequest) =>
  (req as any).auth_context?.actor_type === "customer"
    ? (req as any).auth_context?.actor_id
    : null

const getCustomerEmail = async (
  req: AuthenticatedMedusaRequest,
  customerId: string
) => {
  try {
    const customerService = req.scope.resolve(Modules.CUSTOMER) as any
    const customer = await customerService.retrieveCustomer(customerId, {
      select: ["id", "email"],
    })

    return customer?.email || null
  } catch {
    return null
  }
}

export const POST = async (
  req: AuthenticatedMedusaRequest<ConsumeBody>,
  res: MedusaResponse
) => {
  const customerId = getCustomerId(req)

  if (!customerId) {
    return res.status(401).json({
      message: "Sign in to use AI credits.",
    })
  }

  const aiWalletService = req.scope.resolve(AI_WALLET_MODULE) as any

  try {
    const customerEmail = await getCustomerEmail(req, customerId)
    const [existing] = await aiWalletService.listAiWallets({
      customer_id: customerId,
    })
    const wallet =
      existing ||
      (await aiWalletService.createAiWallets({
        id: createAiWalletId(),
        customer_id: customerId,
        customer_email: customerEmail,
        credit_balance: 0,
        plan: "free",
        pro_question_limit: 0,
        metadata_json: {},
      }))
    const tool = sanitizeText(req.body?.tool, 80) || "ai"
    const usageId = sanitizeText(req.body?.usage_id, 120) || null
    const note = sanitizeText(req.body?.note, 240) || null
    const units = normalizeUnits(req.body?.units)

    const charge = await chargeWalletWithLock({
      walletId: wallet.id,
      customerId,
      customerEmail,
      tool,
      usageId,
      note,
      units,
    })

    if (charge.allowed === false) {
      return res.status(charge.status || 402).json({
        ...charge,
        wallet: formatAiWallet(charge.wallet),
      })
    }

    return res.json({
      ...charge,
      wallet: formatAiWallet(charge.wallet),
    })
  } catch (error) {
    if (isAiWalletStorageMissing(error)) {
      return res.json({
        allowed: true,
        charged: false,
        synced: false,
        message:
          "AI wallet storage is not ready yet. Falling back to daily quota.",
      })
    }

    throw error
  }
}
