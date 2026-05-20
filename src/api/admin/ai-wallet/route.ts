import {
  AuthenticatedMedusaRequest,
  MedusaResponse,
} from "@medusajs/framework/http"

import {
  AI_WALLET_MODULE,
  formatAiWallet,
  getAiCreditPacks,
  isAiWalletStorageMissing,
  parseNonNegativeInt,
  sanitizeText,
} from "../../../lib/ai-wallet"

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
      wallets: [],
    })
  }

  const limit = Math.min(parseNonNegativeInt(req.query.limit, 50) || 50, 100)
  const offset = Math.max(parseNonNegativeInt(req.query.offset, 0), 0)
  const customerEmail = sanitizeText(req.query.customer_email, 240)
  const plan = sanitizeText(req.query.plan, 40)
  const filters: Record<string, unknown> = {}

  if (customerEmail) {
    filters.customer_email = customerEmail
  }

  if (plan) {
    filters.plan = plan
  }

  const aiWalletService = req.scope.resolve(AI_WALLET_MODULE) as any

  try {
    const [wallets, count] = await aiWalletService.listAndCountAiWallets(
      filters,
      {
        take: limit,
        skip: offset,
        order: { updated_at: "DESC" },
      }
    )
    const summaryRows = await aiWalletService.listAiWallets(filters, {
      take: 5000,
      order: { updated_at: "DESC" },
    })
    const summary = summaryRows.reduce(
      (acc: any, wallet: any) => ({
        wallets: acc.wallets + 1,
        total_credits:
          acc.total_credits + parseNonNegativeInt(wallet.credit_balance),
        premium_wallets:
          acc.premium_wallets + (wallet.plan && wallet.plan !== "free" ? 1 : 0),
      }),
      { wallets: 0, total_credits: 0, premium_wallets: 0 }
    )

    return res.json({
      wallets: wallets.map((wallet: any) => formatAiWallet(wallet)),
      summary,
      packs: getAiCreditPacks(),
      count,
      limit,
      offset,
    })
  } catch (error) {
    if (isAiWalletStorageMissing(error)) {
      return res.json({
        wallets: [],
        count: 0,
        limit,
        offset,
        setup_required: true,
        message:
          "AI wallet tables are missing. Run NODE_ENV=production npm run db:migrate on the backend server.",
      })
    }

    throw error
  }
}
