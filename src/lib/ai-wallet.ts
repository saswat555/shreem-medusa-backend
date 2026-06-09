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
    id: "credits_1",
    label: process.env.AI_CREDITS_1_LABEL || "Shreem AI Jyotish Credits - 1 Credit",
    description:
      process.env.AI_CREDITS_1_DESCRIPTION ||
      "1 AI Jyotish credit. Prashna and lost-item Prashna use 1 credit.",
    credits: parseNonNegativeInt(process.env.AI_CREDITS_1_AMOUNT, 1),
    price_inr: parseNonNegativeInt(process.env.AI_CREDITS_1_PRICE_INR, 49),
    product_handle:
      process.env.AI_CREDITS_HANDLE || "shreem-ai-jyotish-credits",
    variant_sku: process.env.AI_CREDITS_1_SKU || "SHREEM-AI-CREDIT-1",
    variant_title: "1 Credit",
    digital: true,
  },
  {
    id: "credits_2",
    label: process.env.AI_CREDITS_2_LABEL || "Shreem AI Jyotish Credits - 2 Credits",
    description:
      process.env.AI_CREDITS_2_DESCRIPTION ||
      "2 AI Jyotish credits. Best for one standard Kundli reading or two Prashna readings.",
    credits: parseNonNegativeInt(process.env.AI_CREDITS_2_AMOUNT, 2),
    price_inr: parseNonNegativeInt(process.env.AI_CREDITS_2_PRICE_INR, 89),
    product_handle:
      process.env.AI_CREDITS_HANDLE || "shreem-ai-jyotish-credits",
    variant_sku: process.env.AI_CREDITS_2_SKU || "SHREEM-AI-CREDIT-2",
    variant_title: "2 Credits",
    digital: true,
  },
  {
    id: "credits_5",
    label: process.env.AI_CREDITS_5_LABEL || "Shreem AI Jyotish Credits - 5 Credits",
    description:
      process.env.AI_CREDITS_5_DESCRIPTION ||
      "5 AI Jyotish credits for Prashna, Kundli, Janam Patrika, matchmaking, and other Shreem AI astrology tools.",
    credits: parseNonNegativeInt(process.env.AI_CREDITS_5_AMOUNT, 5),
    price_inr: parseNonNegativeInt(process.env.AI_CREDITS_5_PRICE_INR, 199),
    product_handle:
      process.env.AI_CREDITS_HANDLE || "shreem-ai-jyotish-credits",
    variant_sku: process.env.AI_CREDITS_5_SKU || "SHREEM-AI-CREDIT-5",
    variant_title: "5 Credits",
    digital: true,
  },
  {
    id: "credits_10",
    label: process.env.AI_CREDITS_10_LABEL || "Shreem AI Jyotish Credits - 10 Credits",
    description:
      process.env.AI_CREDITS_10_DESCRIPTION ||
      "10 AI Jyotish credits. Best for repeated Prashna and Kundli readings.",
    credits: parseNonNegativeInt(process.env.AI_CREDITS_10_AMOUNT, 10),
    price_inr: parseNonNegativeInt(process.env.AI_CREDITS_10_PRICE_INR, 299),
    product_handle:
      process.env.AI_CREDITS_HANDLE || "shreem-ai-jyotish-credits",
    variant_sku: process.env.AI_CREDITS_10_SKU || "SHREEM-AI-CREDIT-10",
    variant_title: "10 Credits",
    digital: true,
  },
  {
    id: "credits_30",
    label: process.env.AI_CREDITS_30_LABEL || "Shreem AI Jyotish Credits - 30 Credits",
    description:
      process.env.AI_CREDITS_30_DESCRIPTION ||
      "30 AI Jyotish credits. Best value prepaid pack for repeated AI Jyotish use.",
    credits: parseNonNegativeInt(process.env.AI_CREDITS_30_AMOUNT, 30),
    price_inr: parseNonNegativeInt(process.env.AI_CREDITS_30_PRICE_INR, 699),
    product_handle:
      process.env.AI_CREDITS_HANDLE || "shreem-ai-jyotish-credits",
    variant_sku: process.env.AI_CREDITS_30_SKU || "SHREEM-AI-CREDIT-30",
    variant_title: "30 Credits",
    digital: true,
  },
  {
    id: "jyotish_monthly",
    label: process.env.AI_PREMIUM_MONTHLY_LABEL || "Shreem AI Jyotish Monthly",
    description:
      process.env.AI_PREMIUM_MONTHLY_DESCRIPTION ||
      "30-day AI Jyotish plan with 30 total readings. Fair usage applies.",
    credits: parseNonNegativeInt(process.env.AI_PREMIUM_MONTHLY_CREDITS, 0),
    price_inr: parseNonNegativeInt(
      process.env.AI_PREMIUM_MONTHLY_PRICE_INR,
      499
    ),
    product_handle:
      process.env.AI_PREMIUM_MONTHLY_HANDLE ||
      "shreem-ai-jyotish-monthly",
    variant_sku: process.env.AI_PREMIUM_MONTHLY_SKU || "SHREEM-AI-MONTHLY",
    plan: "premium",
    duration_days: parseNonNegativeInt(
      process.env.AI_PREMIUM_MONTHLY_DAYS,
      30
    ),
    pro_question_limit: parseNonNegativeInt(
      process.env.AI_PREMIUM_MONTHLY_TOTAL_LIMIT,
      30
    ),
    digital: true,
  },
]

export const getAiCreditPackByHandle = (handle: string) =>
  getAiCreditPacks().find((pack) => pack.product_handle === handle)

export const getAiCreditPackByHandleAndSku = (
  handle?: string | null,
  sku?: string | null
) => {
  const packs = getAiCreditPacks()
  const cleanHandle = String(handle || "").trim()
  const cleanSku = String(sku || "").trim()

  return (
    packs.find(
      (pack) =>
        pack.product_handle === cleanHandle &&
        cleanSku &&
        String((pack as any).variant_sku || "") === cleanSku
    ) ||
    packs.find(
      (pack) =>
        pack.product_handle === cleanHandle &&
        !String((pack as any).variant_sku || "").trim()
    ) ||
    packs.find((pack) => pack.product_handle === cleanHandle)
  )
}


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
