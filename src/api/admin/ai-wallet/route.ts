import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { Client } from "pg"

const parseLimit = (value: unknown, fallback = 50) => {
  const parsed = Number(value || fallback)
  return Number.isFinite(parsed) && parsed > 0 ? Math.min(parsed, 200) : fallback
}

const parseOffset = (value: unknown, fallback = 0) => {
  const parsed = Number(value || fallback)
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback
}

const parseIntSafe = (value: unknown) => {
  const parsed = Number(value || 0)
  return Number.isFinite(parsed) ? Math.max(0, Math.trunc(parsed)) : 0
}

const sanitizeText = (value: unknown, max = 240) =>
  typeof value === "string" ? value.trim().slice(0, max) : ""

const formatWallet = (wallet: any) => ({
  id: wallet.id,
  customer_id: wallet.customer_id,
  customer_email: wallet.customer_email,
  credit_balance: parseIntSafe(wallet.credit_balance),
  plan: wallet.plan || "free",
  plan_expires_at: wallet.plan_expires_at || null,
  pro_question_limit: parseIntSafe(wallet.pro_question_limit),
  metadata_json: wallet.metadata_json || {},
  created_at: wallet.created_at,
  updated_at: wallet.updated_at,
})

const getDatabaseUrl = () => {
  const databaseUrl = process.env.DATABASE_URL

  if (!databaseUrl) {
    throw new Error("DATABASE_URL is missing")
  }

  return databaseUrl
}

export async function GET(req: MedusaRequest, res: MedusaResponse) {
  const limit = parseLimit(req.query.limit)
  const offset = parseOffset(req.query.offset)
  const customerEmail = sanitizeText(req.query.customer_email)

  const client = new Client({
    connectionString: getDatabaseUrl(),
  })

  try {
    await client.connect()

    const filterParams: any[] = []
    let where = "where deleted_at is null"

    if (customerEmail) {
      filterParams.push(customerEmail)
      where += ` and lower(customer_email) = lower($${filterParams.length})`
    }

    const walletParams = [...filterParams, limit, offset]
    const limitParam = filterParams.length + 1
    const offsetParam = filterParams.length + 2

    const walletsResult = await client.query(
      `
        select
          id,
          customer_id,
          customer_email,
          credit_balance,
          plan,
          plan_expires_at,
          pro_question_limit,
          metadata_json,
          created_at,
          updated_at
        from ai_wallet
        ${where}
        order by updated_at desc nulls last, created_at desc nulls last
        limit $${limitParam}
        offset $${offsetParam}
      `,
      walletParams
    )

    const countResult = await client.query(
      `
        select count(*)::integer as count
        from ai_wallet
        ${where}
      `,
      filterParams
    )

    const summaryResult = await client.query(
      `
        select
          count(*)::integer as wallets,
          coalesce(sum(greatest(0, credit_balance)), 0)::integer as total_credits,
          count(*) filter (where plan is not null and plan <> 'free')::integer as premium_wallets
        from ai_wallet
        ${where}
      `,
      filterParams
    )

    const wallets = walletsResult.rows.map(formatWallet)
    const summary = summaryResult.rows[0] || {
      wallets: 0,
      total_credits: 0,
      premium_wallets: 0,
    }

    return res.json({
      wallets,
      count: Number(countResult.rows[0]?.count || wallets.length),
      limit,
      offset,
      summary: {
        wallets: parseIntSafe(summary.wallets),
        total_credits: parseIntSafe(summary.total_credits),
        premium_wallets: parseIntSafe(summary.premium_wallets),
      },
    })
  } catch (error: any) {
    console.error("[admin-ai-wallet] failed to list wallets", {
      message: error?.message,
      stack: error?.stack,
    })

    return res.status(500).json({
      message: "Failed to list AI wallets",
      error: error?.message || "unknown error",
      wallets: [],
      count: 0,
      limit,
      offset,
      summary: {
        wallets: 0,
        total_credits: 0,
        premium_wallets: 0,
      },
    })
  } finally {
    await client.end().catch(() => undefined)
  }
}
