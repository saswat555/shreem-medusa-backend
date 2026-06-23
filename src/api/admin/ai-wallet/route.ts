import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"

import {
  AI_WALLET_MODULE,
  formatAiWallet,
  getAiCreditPacks,
  isAiWalletStorageMissing,
} from "../../../lib/ai-wallet"

const parseLimit = (value: unknown, fallback = 50) => {
  const parsed = Number(value || fallback)
  return Number.isFinite(parsed) && parsed > 0 ? Math.min(parsed, 200) : fallback
}

const parseOffset = (value: unknown, fallback = 0) => {
  const parsed = Number(value || fallback)
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback
}

const sanitizeText = (value: unknown, max = 240) =>
  typeof value === "string" ? value.trim().slice(0, max) : ""

const setNoStoreHeaders = (res: MedusaResponse) => {
  res.setHeader(
    "Cache-Control",
    "no-store, no-cache, must-revalidate, proxy-revalidate"
  )
  res.setHeader("Pragma", "no-cache")
  res.setHeader("Expires", "0")
  res.setHeader("Surrogate-Control", "no-store")
}

const parseCreditBalance = (wallet: any) =>
  Math.max(0, Math.trunc(Number(wallet?.credit_balance || 0) || 0))

const walletMatchesSearch = (wallet: any, search: string) => {
  if (!search) {
    return true
  }

  const needle = search.toLowerCase()

  return [wallet.customer_email, wallet.customer_id, wallet.id]
    .filter(Boolean)
    .some((value) => String(value).toLowerCase().includes(needle))
}

export async function GET(req: MedusaRequest, res: MedusaResponse) {
  setNoStoreHeaders(res)

  const limit = parseLimit(req.query.limit)
  const offset = parseOffset(req.query.offset)
  const customerSearch = sanitizeText(req.query.customer_email)
  const aiWalletService = req.scope.resolve(AI_WALLET_MODULE) as any

  try {
    const allWallets = await aiWalletService.listAiWallets(
      {},
      { take: 1000, order: { updated_at: "DESC" } }
    )
    const filteredWallets = allWallets.filter((wallet: any) =>
      walletMatchesSearch(wallet, customerSearch)
    )
    const pageWallets = filteredWallets.slice(offset, offset + limit)
    const wallets = await Promise.all(
      pageWallets.map(async (wallet: any) => {
        const ledger = await aiWalletService.listAiCreditLedgers(
          { wallet_id: wallet.id },
          { take: 100, order: { created_at: "DESC" } }
        )

        return formatAiWallet(wallet, ledger)
      })
    )
    const totalCredits = filteredWallets.reduce(
      (total: number, wallet: any) => total + parseCreditBalance(wallet),
      0
    )
    const premiumWallets = filteredWallets.filter(
      (wallet: any) => wallet.plan && wallet.plan !== "free"
    ).length

    return res.json({
      wallets,
      count: filteredWallets.length,
      limit,
      offset,
      summary: {
        wallets: filteredWallets.length,
        total_credits: totalCredits,
        premium_wallets: premiumWallets,
      },
      packs: getAiCreditPacks(),
    })
  } catch (error: any) {
    if (isAiWalletStorageMissing(error)) {
      return res.json({
        setup_required: true,
        message:
          "AI wallet storage is not ready yet. Run backend database migrations.",
        wallets: [],
        count: 0,
        limit,
        offset,
        summary: {
          wallets: 0,
          total_credits: 0,
          premium_wallets: 0,
        },
        packs: getAiCreditPacks(),
      })
    }

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
      packs: getAiCreditPacks(),
    })
  }
}
