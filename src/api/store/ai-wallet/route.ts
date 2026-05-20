import {
  AuthenticatedMedusaRequest,
  MedusaResponse,
} from "@medusajs/framework/http"
import { Modules } from "@medusajs/framework/utils"

import {
  AI_WALLET_MODULE,
  createAiWalletId,
  formatAiWallet,
  getAiCreditPacks,
  isAiWalletStorageMissing,
} from "../../../lib/ai-wallet"

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

export const GET = async (
  req: AuthenticatedMedusaRequest,
  res: MedusaResponse
) => {
  const customerId = getCustomerId(req)

  if (!customerId) {
    return res.status(401).json({
      message: "Sign in to view AI credits.",
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
    const ledger = await aiWalletService.listAiCreditLedgers(
      { wallet_id: wallet.id },
      { take: 20, order: { created_at: "DESC" } }
    )

    return res.json({
      synced: true,
      wallet: formatAiWallet(wallet, ledger),
      packs: getAiCreditPacks(),
    })
  } catch (error) {
    if (isAiWalletStorageMissing(error)) {
      return res.json({
        synced: false,
        setup_required: true,
        message:
          "AI wallet storage is not ready yet. Run backend database migrations.",
        wallet: null,
        packs: getAiCreditPacks(),
      })
    }

    throw error
  }
}
