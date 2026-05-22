import { randomUUID } from "crypto"

export const AI_WALLET_MODULE = "aiWallet"

export type AiWalletRecord = {
  id: string
  customer_id: string
  customer_email?: string | null
  credit_balance?: number | string | null
  plan?: string | null
  plan_expires_at?: string | Date | null
  pro_question_limit?: number | string | null
  metadata_json?: Record<string, unknown> | null
  created_at?: string | Date
  updated_at?: string | Date
}

export type AiCreditLedgerRecord = {
  id: string
  wallet_id: string
  customer_id: string
  customer_email?: string | null
  type: string
  source?: string | null
  credits?: number | string | null
  balance_after?: number | string | null
  order_id?: string | null
  usage_id?: string | null
  note?: string | null
  metadata_json?: Record<string, unknown> | null
  created_at?: string | Date
}

export const createAiWalletId = () =>
  `aiw_${randomUUID().replace(/-/g, "")}`

export const createAiCreditLedgerId = () =>
  `aicred_${randomUUID().replace(/-/g, "")}`

export const parseNonNegativeInt = (value: unknown, fallback = 0) => {
  const parsed = Number(value)

  if (!Number.isFinite(parsed) || parsed < 0) {
    return fallback
  }

  return Math.floor(parsed)
}

export const parseCreditDelta = (value: unknown) => {
  const parsed = Number(value)

  if (!Number.isFinite(parsed)) {
    return 0
  }

  return Math.trunc(parsed)
}

export const sanitizeText = (value: unknown, maxLength: number) =>
  typeof value === "string" ? value.trim().slice(0, maxLength) : ""

export const getAiCreditPacks = () => [
  {
    id: "credits_10",
    label: process.env.AI_CREDITS_10_LABEL || "Shreem AI Credits - 10 Readings",
    description:
      process.env.AI_CREDITS_10_DESCRIPTION ||
      "Digital pack of 10 paid AI credits for Kundli, Matchmaking, Prashna Kundli, GrowBuddy, and other Shreem AI tools. Deep Kundli uses 2 credits.",
    credits: parseNonNegativeInt(process.env.AI_CREDITS_10_AMOUNT, 10),
    price_inr: parseNonNegativeInt(process.env.AI_CREDITS_10_PRICE_INR, 199),
    product_handle:
      process.env.AI_CREDITS_10_HANDLE || "shreem-ai-credits-10",
    digital: true,
  },
  {
    id: "credits_30",
    label: process.env.AI_CREDITS_30_LABEL || "Shreem AI Credits - 30 Readings",
    description:
      process.env.AI_CREDITS_30_DESCRIPTION ||
      "Digital pack of 30 paid AI credits for Kundli, Matchmaking, Prashna Kundli, GrowBuddy, and other Shreem AI tools. Deep Kundli uses 2 credits.",
    credits: parseNonNegativeInt(process.env.AI_CREDITS_30_AMOUNT, 30),
    price_inr: parseNonNegativeInt(process.env.AI_CREDITS_30_PRICE_INR, 499),
    product_handle:
      process.env.AI_CREDITS_30_HANDLE || "shreem-ai-credits-30",
    digital: true,
  },
  {
    id: "premium_monthly",
    label: process.env.AI_PREMIUM_MONTHLY_LABEL || "Shreem AI Premium - 30 Days",
    description:
      process.env.AI_PREMIUM_MONTHLY_DESCRIPTION ||
      "Digital 30-day AI membership with 10 AI calls per day for Kundli, Matchmaking, Prashna Kundli, GrowBuddy, and other Shreem AI tools. Deep Kundli uses 2 daily calls.",
    credits: parseNonNegativeInt(process.env.AI_PREMIUM_MONTHLY_CREDITS, 0),
    price_inr: parseNonNegativeInt(
      process.env.AI_PREMIUM_MONTHLY_PRICE_INR,
      499
    ),
    product_handle:
      process.env.AI_PREMIUM_MONTHLY_HANDLE ||
      "shreem-ai-premium-monthly",
    plan: "premium",
    duration_days: parseNonNegativeInt(
      process.env.AI_PREMIUM_MONTHLY_DAYS,
      30
    ),
    pro_question_limit: parseNonNegativeInt(
      process.env.AI_PREMIUM_MONTHLY_DAILY_LIMIT,
      10
    ),
    digital: true,
  },
]

export const getAiCreditPackByHandle = (handle: string) =>
  getAiCreditPacks().find((pack) => pack.product_handle === handle)

export const isProActive = (wallet?: AiWalletRecord | null) => {
  if (!wallet || !wallet.plan || wallet.plan === "free") {
    return false
  }

  if (!wallet.plan_expires_at) {
    return true
  }

  return new Date(wallet.plan_expires_at).getTime() > Date.now()
}

export const formatAiWallet = (
  wallet: AiWalletRecord,
  ledger: AiCreditLedgerRecord[] = []
) => ({
  id: wallet.id,
  customer_id: wallet.customer_id,
  customer_email: wallet.customer_email || null,
  credit_balance: parseNonNegativeInt(wallet.credit_balance),
  plan: wallet.plan || "free",
  plan_expires_at: wallet.plan_expires_at || null,
  pro_question_limit: parseNonNegativeInt(wallet.pro_question_limit),
  pro_active: isProActive(wallet),
  metadata: wallet.metadata_json || {},
  recent_ledger: ledger.map((item) => ({
    id: item.id,
    type: item.type,
    source: item.source || null,
    credits: parseCreditDelta(item.credits),
    balance_after: parseNonNegativeInt(item.balance_after),
    order_id: item.order_id || null,
    usage_id: item.usage_id || null,
    note: item.note || null,
    metadata: item.metadata_json || {},
    created_at: item.created_at,
  })),
  created_at: wallet.created_at,
  updated_at: wallet.updated_at,
})

export const isAiWalletStorageMissing = (error: unknown) => {
  const code = (error as { code?: string })?.code
  const message =
    error instanceof Error
      ? error.message
      : typeof error === "object" && error
      ? String((error as { message?: unknown }).message || "")
      : String(error || "")

  return (
    code === "42P01" ||
    (message.includes("ai_wallet") && message.includes("does not exist")) ||
    (message.includes("ai_credit_ledger") &&
      message.includes("does not exist"))
  )
}
