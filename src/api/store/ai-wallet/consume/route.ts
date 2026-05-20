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

    if (isProActive(wallet)) {
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
        metadata_json: {},
      })

      return res.json({
        allowed: true,
        charged: false,
        ledger,
        wallet: formatAiWallet(wallet),
      })
    }

    const balance = Math.max(0, Number(wallet.credit_balance || 0))

    if (balance < 1) {
      return res.status(402).json({
        allowed: false,
        message: "No AI credits available. Please buy credits or upgrade.",
        wallet: formatAiWallet(wallet),
      })
    }

    const nextBalance = balance - 1
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
      credits: -1,
      balance_after: nextBalance,
      usage_id: usageId,
      note,
      metadata_json: {},
    })

    return res.json({
      allowed: true,
      charged: true,
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
