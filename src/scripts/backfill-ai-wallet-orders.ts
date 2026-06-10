import type { ExecArgs } from "@medusajs/framework/types"
import {
  AI_WALLET_MODULE,
  createAiCreditLedgerId,
  createAiWalletId,
  getAiCreditPackByHandleAndSku,
  getAiCreditPacks,
  parseNonNegativeInt,
} from "../lib/ai-wallet"

const getLineHandle = (line: any) =>
  line?.product?.handle ||
  line?.variant?.product?.handle ||
  line?.variant?.product_handle ||
  line?.product_handle ||
  line?.metadata?.product_handle ||
  ""

const getLineSku = (line: any) =>
  line?.variant?.sku ||
  line?.variant_sku ||
  line?.sku ||
  line?.metadata?.variant_sku ||
  line?.metadata?.sku ||
  ""

const getLineTitle = (line: any) =>
  line?.title ||
  line?.product_title ||
  line?.variant_title ||
  line?.product?.title ||
  line?.variant?.title ||
  line?.variant?.product?.title ||
  line?.metadata?.title ||
  ""

const getLineMetadataPack = (line: any) =>
  line?.metadata?.ai_credit_pack ||
  line?.metadata?.ai_pack ||
  line?.metadata?.credit_pack ||
  ""

const getLineMetadataCredits = (line: any) =>
  parseNonNegativeInt(
    line?.metadata?.ai_credits ||
      line?.metadata?.credits ||
      line?.product?.metadata?.ai_credits ||
      line?.variant?.metadata?.ai_credits ||
      line?.variant?.product?.metadata?.ai_credits
  )

export default async function backfillAiWalletOrders({ container }: ExecArgs) {
  const query = container.resolve("query") as any
  const aiWalletService = container.resolve(AI_WALLET_MODULE) as any
  const packs = getAiCreditPacks()

  console.log("[ai-wallet-backfill] configured packs", packs.map((pack: any) => ({
    id: pack.id,
    handle: pack.product_handle,
    sku: pack.variant_sku,
    credits: pack.credits,
    title: pack.variant_title,
  })))

  const { data: orders = [] } = await query.graph({
    entity: "order",
    fields: [
      "id",
      "display_id",
      "email",
      "customer_id",
      "created_at",
      "items.quantity",
      "items.title",
      "items.product_title",
      "items.variant_title",
      "items.product_handle",
      "items.variant_sku",
      "items.sku",
      "items.metadata",
      "items.product.handle",
      "items.product.title",
      "items.product.metadata",
      "items.variant.sku",
      "items.variant.title",
      "items.variant.metadata",
      "items.variant.product.handle",
      "items.variant.product.title",
      "items.variant.product.metadata",
    ],
    pagination: {
      take: 500,
      order: {
        created_at: "DESC",
      },
    },
  })

  let credited = 0
  let corrected = 0
  let skipped = 0

  for (const order of orders) {
    if (!order?.customer_id) {
      skipped++
      continue
    }

    const grant = (order.items || []).reduce(
      (acc: any, line: any) => {
        const quantity = Math.max(1, parseNonNegativeInt(line?.quantity, 1))
        const handle = getLineHandle(line)
        const sku = getLineSku(line)
        const title = getLineTitle(line)
        const metadataPack = getLineMetadataPack(line)
        const pack = getAiCreditPackByHandleAndSku(handle, sku, title, metadataPack)
        const metadataCredits = getLineMetadataCredits(line)
        const credits = (pack?.credits || metadataCredits) * quantity

        if (!credits && !pack?.plan) {
          return acc
        }

        return {
          credits: acc.credits + credits,
          handles: [...acc.handles, handle || sku || title || metadataPack || "metadata"],
          matched: [
            ...acc.matched,
            {
              title,
              handle,
              sku,
              metadataPack,
              pack_id: pack?.id || null,
              pack_sku: (pack as any)?.variant_sku || null,
              credits,
              quantity,
            },
          ],
          premium:
            acc.premium ||
            (pack?.plan
              ? {
                  plan: pack.plan,
                  duration_days: pack.duration_days || 30,
                  pro_question_limit: pack.pro_question_limit || 10,
                }
              : null),
        }
      },
      { credits: 0, handles: [] as string[], matched: [] as any[], premium: null as any }
    )

    if (!grant.credits && !grant.premium) {
      skipped++
      continue
    }

    const existingLedger = await aiWalletService.listAiCreditLedgers({
      order_id: order.id,
      type: "order_credit",
    })

    const [existingWallet] = await aiWalletService.listAiWallets({
      customer_id: order.customer_id,
    })

    const wallet =
      existingWallet ||
      (await aiWalletService.createAiWallets({
        id: createAiWalletId(),
        customer_id: order.customer_id,
        customer_email: order.email || null,
        credit_balance: 0,
        plan: "free",
        pro_question_limit: 0,
        metadata_json: {},
      }))

    const previousCredited = existingLedger.reduce(
      (sum: number, ledger: any) => sum + parseNonNegativeInt(ledger.credits),
      0
    )

    const delta = parseNonNegativeInt(grant.credits) - previousCredited

    if (delta <= 0) {
      skipped++
      continue
    }

    const nextBalance = parseNonNegativeInt(wallet.credit_balance) + delta

    const planExpiry = grant.premium
      ? new Date(Date.now() + grant.premium.duration_days * 24 * 60 * 60 * 1000)
      : wallet.plan_expires_at || null

    const updatedWallet = await aiWalletService.updateAiWallets({
      id: wallet.id,
      customer_email: order.email || wallet.customer_email || null,
      credit_balance: nextBalance,
      ...(grant.premium
        ? {
            plan: grant.premium.plan,
            plan_expires_at: planExpiry,
            pro_question_limit: grant.premium.pro_question_limit || 10,
          }
        : {}),
    })

    await aiWalletService.createAiCreditLedgers({
      id: createAiCreditLedgerId(),
      wallet_id: wallet.id,
      customer_id: order.customer_id,
      customer_email: order.email || wallet.customer_email || null,
      type: "order_credit",
      source: grant.handles.join(", "),
      credits: delta,
      balance_after: nextBalance,
      order_id: order.id,
      note: existingLedger.length
        ? "Corrected AI wallet credits from existing order"
        : "Backfilled AI wallet credits from existing order",
      metadata_json: {
        handles: grant.handles,
        matched: grant.matched,
        expected_total_order_credits: grant.credits,
        previous_credited: previousCredited,
        correction_delta: delta,
        plan: updatedWallet.plan,
        plan_expires_at: updatedWallet.plan_expires_at,
        backfill: true,
      },
    })

    if (existingLedger.length) {
      corrected++
    } else {
      credited++
    }

    console.log("[ai-wallet-backfill] credited/corrected", {
      order_id: order.id,
      display_id: order.display_id,
      customer_id: order.customer_id,
      expected_credits: grant.credits,
      previous_credited: previousCredited,
      delta,
      balance_after: nextBalance,
      matched: grant.matched,
    })
  }

  console.log("[ai-wallet-backfill] complete", {
    scanned: orders.length,
    credited,
    corrected,
    skipped,
  })
}
