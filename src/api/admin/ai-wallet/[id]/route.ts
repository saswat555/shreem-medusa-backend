import {
  AuthenticatedMedusaRequest,
  MedusaResponse,
} from "@medusajs/framework/http"

import {
  AI_WALLET_MODULE,
  createAiCreditLedgerId,
  formatAiWallet,
  isAiWalletStorageMissing,
  parseCreditDelta,
  parseNonNegativeInt,
  sanitizeText,
} from "../../../../lib/ai-wallet"

type Params = {
  id: string
}

type PatchBody = {
  add_credits?: unknown
  plan?: unknown
  plan_expires_at?: unknown
  pro_question_limit?: unknown
  note?: unknown
}

const isAdminRequest = (req: AuthenticatedMedusaRequest) =>
  (req as any).auth_context?.actor_type === "user" &&
  Boolean((req as any).auth_context?.actor_id)

export const GET = async (
  req: AuthenticatedMedusaRequest,
  res: MedusaResponse
) => {
  if (!isAdminRequest(req)) {
    return res.status(401).json({
      message: "Admin authentication is required.",
    })
  }

  const id = sanitizeText(req.params.id, 120)
  const aiWalletService = req.scope.resolve(AI_WALLET_MODULE) as any

  try {
    const wallet = await aiWalletService.retrieveAiWallet(id)
    const ledger = await aiWalletService.listAiCreditLedgers(
      { wallet_id: wallet.id },
      { take: 100, order: { created_at: "DESC" } }
    )

    return res.json({
      wallet: formatAiWallet(wallet, ledger),
    })
  } catch (error) {
    if (isAiWalletStorageMissing(error)) {
      return res.status(404).json({
        message: "AI wallet storage is not ready.",
      })
    }

    throw error
  }
}

export const PATCH = async (
  req: AuthenticatedMedusaRequest<PatchBody, Params>,
  res: MedusaResponse
) => {
  if (!isAdminRequest(req)) {
    return res.status(401).json({
      message: "Admin authentication is required.",
    })
  }

  const id = sanitizeText(req.params.id, 120)
  const aiWalletService = req.scope.resolve(AI_WALLET_MODULE) as any
  const wallet = await aiWalletService.retrieveAiWallet(id)
  const creditDelta = parseCreditDelta(req.body?.add_credits)
  const nextBalance = Math.max(
    0,
    parseNonNegativeInt(wallet.credit_balance) + creditDelta
  )
  const rawPlan = sanitizeText(req.body?.plan, 40)
  const plan = rawPlan || wallet.plan || "free"
  const rawExpiry = sanitizeText(req.body?.plan_expires_at, 80)
  const expiry =
    rawExpiry && !Number.isNaN(new Date(rawExpiry).getTime())
      ? new Date(rawExpiry)
      : wallet.plan_expires_at || null
  const proQuestionLimit = parseNonNegativeInt(
    req.body?.pro_question_limit,
    parseNonNegativeInt(wallet.pro_question_limit)
  )
  const note = sanitizeText(req.body?.note, 240) || "Admin adjustment"
  const updatedWallet = await aiWalletService.updateAiWallets({
    id: wallet.id,
    credit_balance: nextBalance,
    plan,
    plan_expires_at: expiry,
    pro_question_limit: proQuestionLimit,
  })

  if (creditDelta !== 0) {
    await aiWalletService.createAiCreditLedgers({
      id: createAiCreditLedgerId(),
      wallet_id: wallet.id,
      customer_id: wallet.customer_id,
      customer_email: wallet.customer_email,
      type: "admin_adjustment",
      source: "admin",
      credits: creditDelta,
      balance_after: nextBalance,
      note,
      metadata_json: {},
    })
  }

  const ledger = await aiWalletService.listAiCreditLedgers(
    { wallet_id: wallet.id },
    { take: 100, order: { created_at: "DESC" } }
  )

  return res.json({
    wallet: formatAiWallet(updatedWallet, ledger),
  })
}
