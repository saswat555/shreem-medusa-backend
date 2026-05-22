import type { SubscriberArgs, SubscriberConfig } from "@medusajs/framework"
import {
  AI_WALLET_MODULE,
  createAiCreditLedgerId,
  createAiWalletId,
  getAiCreditPacks,
  parseNonNegativeInt,
} from "../lib/ai-wallet"

type OrderEvent = {
  id?: string
  order_id?: string
}

const getOrderId = (data: OrderEvent) => data.id || data.order_id || ""

const toQuantity = (value: unknown) => Math.max(1, parseNonNegativeInt(value, 1))

const getLineHandle = (line: any) =>
  line?.product?.handle ||
  line?.variant?.product?.handle ||
  line?.variant?.product_handle ||
  line?.product_handle ||
  line?.metadata?.product_handle ||
  line?.metadata?.ai_credit_pack ||
  ""

const getLineMetadataCredits = (line: any) =>
  parseNonNegativeInt(
    line?.metadata?.ai_credits ||
      line?.metadata?.credits ||
      line?.product?.metadata?.ai_credits ||
      line?.variant?.metadata?.ai_credits ||
      line?.variant?.product?.metadata?.ai_credits
  )

const getLineMetadataPlan = (line: any) =>
  line?.metadata?.ai_plan ||
  line?.product?.metadata?.ai_plan ||
  line?.variant?.metadata?.ai_plan ||
  line?.variant?.product?.metadata?.ai_plan ||
  ""

const getLineMetadataPlanDays = (line: any) =>
  parseNonNegativeInt(
    line?.metadata?.ai_premium_days ||
      line?.product?.metadata?.ai_premium_days ||
      line?.variant?.metadata?.ai_premium_days ||
      line?.variant?.product?.metadata?.ai_premium_days,
    30
  )

const getLineMetadataQuestionLimit = (line: any) =>
  parseNonNegativeInt(
    line?.metadata?.ai_pro_daily_limit ||
      line?.product?.metadata?.ai_pro_daily_limit ||
      line?.variant?.metadata?.ai_pro_daily_limit ||
      line?.variant?.product?.metadata?.ai_pro_daily_limit,
    0
  )

export default async function aiWalletOrderCreditHandler({
  event,
  container,
}: SubscriberArgs<OrderEvent>) {
  const orderId = getOrderId(event.data)

  if (!orderId) {
    return
  }

  const query = container.resolve("query") as any
  const aiWalletService = container.resolve(AI_WALLET_MODULE) as any
  const packs = getAiCreditPacks()

  const { data } = await query.graph({
    entity: "order",
    fields: [
      "id",
      "email",
      "customer_id",
      "items.quantity",
      "items.metadata",
      "items.product.handle",
      "items.product.metadata",
      "items.variant.metadata",
      "items.variant.product.handle",
      "items.variant.product.metadata",
    ],
    filters: { id: orderId },
  })
  const order = data?.[0]

  if (!order?.customer_id) {
    return
  }

  const existingLedger = await aiWalletService.listAiCreditLedgers({
    order_id: order.id,
    type: "order_credit",
  })

  if (existingLedger.length) {
    return
  }

  const grant = (order.items || []).reduce(
    (acc: any, line: any) => {
      const quantity = toQuantity(line?.quantity)
      const handle = getLineHandle(line)
      const pack = packs.find((item) => item.product_handle === handle)
      const metadataCredits = getLineMetadataCredits(line)
      const credits = (pack?.credits || metadataCredits) * quantity
      const metadataPlan = getLineMetadataPlan(line)
      const metadataPremium =
        metadataPlan === "premium"
          ? {
              plan: "premium",
              duration_days: getLineMetadataPlanDays(line),
              pro_question_limit: getLineMetadataQuestionLimit(line),
            }
          : null
      const packPremium =
        pack?.plan === "premium"
          ? {
              plan: "premium",
              duration_days: pack.duration_days || 30,
              pro_question_limit: (pack as any).pro_question_limit || 10,
            }
          : null

      if (!credits && !packPremium && !metadataPremium) {
        return acc
      }

      return {
        credits: acc.credits + credits,
        premium: acc.premium || packPremium || metadataPremium,
        handles: [...acc.handles, handle || "metadata"],
      }
    },
    { credits: 0, premium: null, handles: [] as string[] }
  )

  if (!grant.credits && !grant.premium) {
    return
  }

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
  const nextBalance =
    parseNonNegativeInt(wallet.credit_balance) + parseNonNegativeInt(grant.credits)
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
    credits: grant.credits,
    balance_after: nextBalance,
    order_id: order.id,
    note: grant.premium
      ? "Order granted AI credits and Premium access"
      : "Order granted AI credits",
    metadata_json: {
      handles: grant.handles,
      plan: updatedWallet.plan,
      plan_expires_at: updatedWallet.plan_expires_at,
      premium_daily_limit: updatedWallet.pro_question_limit || 0,
      digital_product: true,
      fulfillment_type: "digital",
    },
  })
}

export const config: SubscriberConfig = {
  event: "order.placed",
}
