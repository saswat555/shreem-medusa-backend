import {
  AuthenticatedMedusaRequest,
  MedusaResponse,
} from "@medusajs/framework/http"
import { Modules } from "@medusajs/framework/utils"

import {
  AI_WALLET_MODULE,
  createAiCreditLedgerId,
  createAiWalletId,
  formatAiWallet,
  isAiWalletStorageMissing,
  isProActive,
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

    if (usageId) {
      const [existingLedger] = await aiWalletService.listAiCreditLedgers({
        customer_id: customerId,
        usage_id: usageId,
      })

      if (existingLedger) {
        return res.json({
          allowed: true,
          charged: existingLedger.type === "consume",
          charged_units:
            existingLedger.type === "consume" ? getLedgerUnits(existingLedger) : 0,
          units: getLedgerUnits(existingLedger),
          ledger: existingLedger,
          wallet: formatAiWallet(wallet),
          idempotent: true,
        })
      }
    }

    if (isProActive(wallet)) {
      const { start, end } = getIstDayWindow()
      const proLimit = Math.max(0, Number(wallet.pro_question_limit || 0))

      if (proLimit > 0) {
        const todayLedgers = await aiWalletService.listAiCreditLedgers({
          customer_id: customerId,
          type: "premium_usage",
          created_at: {
            $gte: start,
            $lt: end,
          },
        })
        const usedToday = todayLedgers.reduce(
          (sum: number, ledger: any) => sum + getLedgerUnits(ledger),
          0
        )

        if (usedToday + units > proLimit) {
          return res.status(402).json({
            allowed: false,
            message: `Premium daily AI limit reached. You can use ${proLimit} calls per day.`,
            premium_daily_limit: proLimit,
            premium_used_today: usedToday,
            requested_units: units,
            wallet: formatAiWallet(wallet),
          })
        }
      }

      const ledger = await aiWalletService.createAiCreditLedgers({
        id: createAiCreditLedgerId(),
        wallet_id: wallet.id,
        customer_id: customerId,
        customer_email: customerEmail,
        type: "premium_usage",
        source: tool,
        credits: 0,
        balance_after: Math.max(0, Number(wallet.credit_balance || 0)),
        usage_id: usageId,
        note,
        metadata_json: {
          units,
          billing_mode: "premium",
          plan: wallet.plan || "premium",
          plan_expires_at: wallet.plan_expires_at || null,
          pro_question_limit: wallet.pro_question_limit || 0,
        },
      })

      return res.json({
        allowed: true,
        charged: false,
        charged_units: 0,
        premium_units: units,
        ledger,
        wallet: formatAiWallet(wallet),
      })
    }

    const balance = Math.max(0, Number(wallet.credit_balance || 0))

    if (balance < units) {
      return res.status(402).json({
        allowed: false,
        message: `You need ${units} AI credit${units > 1 ? "s" : ""}. Please buy credits or upgrade.`,
        requested_units: units,
        wallet: formatAiWallet(wallet),
      })
    }

    const nextBalance = balance - units
    const updatedWallet = await aiWalletService.updateAiWallets({
      id: wallet.id,
      credit_balance: nextBalance,
      customer_email: customerEmail,
    })
    const ledger = await aiWalletService.createAiCreditLedgers({
      id: createAiCreditLedgerId(),
      wallet_id: wallet.id,
      customer_id: customerId,
      customer_email: customerEmail,
      type: "consume",
      source: tool,
      credits: -units,
      balance_after: nextBalance,
      usage_id: usageId,
      note,
      metadata_json: {
        units,
        billing_mode: "credit",
      },
    })

    return res.json({
      allowed: true,
      charged: true,
      charged_units: units,
      ledger,
      wallet: formatAiWallet(updatedWallet),
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
