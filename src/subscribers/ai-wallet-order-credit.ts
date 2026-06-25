import type { SubscriberArgs, SubscriberConfig } from "@medusajs/framework"
import {
  AI_WALLET_MODULE,
  createAiCreditLedgerId,
  createAiWalletId,
  getAiCreditPacks,
  getAiCreditPackByHandleAndSku,
  parseNonNegativeInt,
} from "../lib/ai-wallet"
import { getMailSettings } from "../lib/admin-mail-settings"
import {
  buildAiWalletActivatedEmail,
  sendShreemEmail,
} from "../lib/email/shreem-mail"
import { Client } from "pg"

type OrderEvent = {
  id?: string
  order_id?: string
}

const getOrderId = (data: OrderEvent) => data.id || data.order_id || ""

const getDatabaseUrl = () => process.env.DATABASE_URL || ""
const getSiteUrl = () =>
  String(process.env.SHREEM_SITE_URL || "https://shreemfarms.in").replace(
    /\/+$/,
    ""
  )

const toQuantity = (value: unknown) => Math.max(1, parseNonNegativeInt(value, 1))

const normalizePackText = (value: unknown) =>
  String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()

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

const findAiPackForLine = (line: any, packs: any[]) => {
  const handle = getLineHandle(line)
  const sku = getLineSku(line)
  const title = getLineTitle(line)
  const titleText = normalizePackText(title)
  const metadataPack =
    line?.metadata?.ai_credit_pack ||
    line?.metadata?.ai_pack ||
    line?.metadata?.credit_pack ||
    ""

  return (
    getAiCreditPackByHandleAndSku(handle, sku, title, metadataPack) ||
    packs.find((pack) => sku && String(pack.variant_sku || "") === String(sku)) ||
    packs.find((pack) => metadataPack && String(pack.id || "") === String(metadataPack)) ||
    packs.find((pack) => metadataPack && String(pack.variant_sku || "") === String(metadataPack)) ||
    packs.find((pack) => metadataPack && String(pack.product_handle || "") === String(metadataPack)) ||
    packs.find((pack) => {
      const packNeedles = [
        pack.id,
        pack.label,
        pack.variant_title,
        pack.variant_sku,
        pack.product_handle,
      ]
        .map(normalizePackText)
        .filter(Boolean)

      return packNeedles.some((needle) => needle && titleText.includes(needle))
    }) ||
    null
  )
}

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

const attachRecoveredCartLedger = async ({
  order,
}: {
  order: any
}) => {
  let cartId =
    order?.metadata?.recovered_razorpay_cart_id ||
    order?.metadata?.cart_id ||
    order?.metadata?.source_cart_id ||
    ""
  const databaseUrl = getDatabaseUrl()

  if (!cartId || !databaseUrl) {
    return false
  }

  const client = new Client({ connectionString: databaseUrl })

  try {
    await client.connect()

    if (!cartId) {
      const cartResult = await client.query(
        `
          select cart_id
          from order_cart
          where order_id = $1
            and deleted_at is null
          order by created_at desc
          limit 1
        `,
        [String(order.id)]
      )

      cartId = cartResult.rows[0]?.cart_id || ""
    }

    if (!cartId) {
      return false
    }

    const result = await client.query(
      `
        update ai_credit_ledger
        set
          order_id = $2::text,
          note = coalesce(note, '') || ' · Linked to repaired Medusa order.',
          metadata_json = coalesce(metadata_json, '{}'::jsonb) || jsonb_build_object(
            'repaired_order_id', $2::text,
            'repair_linked_at', now()
          ),
          updated_at = now()
        where deleted_at is null
          and source = 'razorpay_captured_cart_recovery'
          and order_id is null
          and metadata_json->>'cart_id' = $1
        returning id, credits
      `,
      [String(cartId), String(order.id)]
    )

    if (result.rowCount) {
      console.log("[ai-wallet-order-credit] linked recovered ledger to order", {
        order_id: order.id,
        cart_id: cartId,
        ledger_id: result.rows[0]?.id,
        credits: result.rows[0]?.credits,
      })

      return true
    }
  } catch (error: any) {
    console.error("[ai-wallet-order-credit] recovery ledger link failed", {
      order_id: order?.id,
      cart_id: cartId,
      message: error?.message,
    })
  } finally {
    await client.end().catch(() => undefined)
  }

  return false
}

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

  console.log("[ai-wallet-order-credit] processing order", { order_id: orderId })

  const { data } = await query.graph({
    entity: "order",
    fields: [
      "id",
      "email",
      "customer_id",
      "metadata",
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
    filters: { id: orderId },
  })
  const order = data?.[0]

  if (!order?.customer_id) {
    console.warn("[ai-wallet-order-credit] no customer on order", { order_id: orderId })
    return
  }

  const linkedRecoveredLedger = await attachRecoveredCartLedger({ order })

  if (linkedRecoveredLedger) {
    return
  }

  const existingLedger = await aiWalletService.listAiCreditLedgers({
    order_id: order.id,
    type: "order_credit",
  })

  if (existingLedger.length) {
    console.log("[ai-wallet-order-credit] already credited", { order_id: order.id })
    return
  }

  const grant = (order.items || []).reduce(
    (acc: any, line: any) => {
      const quantity = toQuantity(line?.quantity)
      const handle = getLineHandle(line)
      const sku = getLineSku(line)
      const title = getLineTitle(line)
      const pack = findAiPackForLine(line, packs)
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
        handles: [...acc.handles, handle || sku || title || "metadata"],
      }
    },
    { credits: 0, premium: null, handles: [] as string[] }
  )

  if (!grant.credits && !grant.premium) {
    console.log("[ai-wallet-order-credit] no AI pack found", {
      order_id: order.id,
      items: (order.items || []).map((line: any) => ({
        title: getLineTitle(line),
        handle: getLineHandle(line),
        sku: getLineSku(line),
        metadata: line?.metadata || {},
      })),
    })
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

  console.log("[ai-wallet-order-credit] credited order", {
    order_id: order.id,
    customer_id: order.customer_id,
    credits: grant.credits,
    premium: Boolean(grant.premium),
    balance_after: nextBalance,
    handles: grant.handles,
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

  if (order.email) {
    try {
      const settings = await getMailSettings()

      if (settings.ai_wallet_enabled !== false) {
        const accountUrl = `${getSiteUrl()}/in/account`
        const email = buildAiWalletActivatedEmail({
          credits: parseNonNegativeInt(grant.credits),
          balance: nextBalance,
          plan: updatedWallet.plan,
          planExpiresAt: updatedWallet.plan_expires_at,
          accountUrl,
        })

        await sendShreemEmail({
          to: order.email,
          subject: grant.premium
            ? "Your Shreem AI Jyotish plan is active"
            : "Your Shreem AI credits are ready",
          text: email.text,
          html: email.html,
        })
      }
    } catch (error: any) {
      console.warn("[ai-wallet-order-credit] wallet email failed safely", {
        order_id: order.id,
        customer_email: order.email,
        message: error?.message || String(error),
      })
    }
  }
}

export const config: SubscriberConfig = {
  event: "order.placed",
}
