import {
  AuthenticatedMedusaRequest,
  MedusaResponse,
} from "@medusajs/framework/http"
import { Modules } from "@medusajs/framework/utils"
import { randomUUID } from "crypto"
import { Client } from "pg"

import {
  AI_WALLET_MODULE,
  createAiWalletId,
  formatAiWallet,
  getAiCreditPacks,
  isAiWalletStorageMissing,
} from "../../../lib/ai-wallet"

const RAZORPAY_ORDER_API = "https://api.razorpay.com/v1/orders"

const getRazorpayAuthHeader = () => {
  const key = process.env.RAZORPAY_KEY_ID
  const secret = process.env.RAZORPAY_KEY_SECRET

  if (!key || !secret) {
    return ""
  }

  return `Basic ${Buffer.from(`${key}:${secret}`).toString("base64")}`
}

const fetchCapturedRazorpayPayment = async (orderId: string) => {
  const authorization = getRazorpayAuthHeader()

  if (!authorization || !orderId) {
    return null
  }

  const [orderResponse, paymentsResponse] = await Promise.all([
    fetch(`${RAZORPAY_ORDER_API}/${orderId}`, {
      headers: { authorization },
    }),
    fetch(`${RAZORPAY_ORDER_API}/${orderId}/payments`, {
      headers: { authorization },
    }),
  ])

  if (!orderResponse.ok || !paymentsResponse.ok) {
    return null
  }

  const order = await orderResponse.json()
  const payments = await paymentsResponse.json()
  const capturedPayment = (payments?.items || []).find(
    (payment: any) => payment?.status === "captured" || payment?.captured === true
  )

  if (order?.status !== "paid" || !capturedPayment) {
    return null
  }

  return {
    order,
    payment: capturedPayment,
  }
}

const reconcileCapturedRazorpayCarts = async ({
  customerId,
  customerEmail,
}: {
  customerId: string
  customerEmail?: string | null
}) => {
  if (!process.env.DATABASE_URL) {
    return
  }

  const client = new Client({ connectionString: process.env.DATABASE_URL })

  await client.connect()

  try {
    const pending = await client.query(
      `
        with ai_carts as (
          select
            c.id as cart_id,
            c.customer_id,
            c.email as customer_email,
            pc.id as payment_collection_id,
            ps.id as payment_session_id,
            ps.data->>'razorpay_order_id' as razorpay_order_id,
            coalesce(sum(
              case
                when upper(coalesce(cli.variant_sku, '')) = 'SHREEM-AI-CREDIT-30' then 30
                when upper(coalesce(cli.variant_sku, '')) = 'SHREEM-AI-CREDIT-10' then 10
                when upper(coalesce(cli.variant_sku, '')) = 'SHREEM-AI-CREDIT-5' then 5
                when upper(coalesce(cli.variant_sku, '')) = 'SHREEM-AI-CREDIT-2' then 2
                when upper(coalesce(cli.variant_sku, '')) = 'SHREEM-AI-CREDIT-1' then 1
                when coalesce(cli.metadata->>'ai_credits', '') ~ '^[0-9]+$'
                  then (cli.metadata->>'ai_credits')::integer
                else 0
              end * greatest(1, cli.quantity)
            ), 0)::integer as expected_credits,
            count(*)::integer as item_count,
            count(*) filter (
              where lower(coalesce(cli.product_handle, '')) in ('shreem-ai-jyotish-credits', 'shreem-ai-jyotish-monthly')
                or upper(coalesce(cli.variant_sku, '')) like 'SHREEM-AI-%'
            )::integer as ai_item_count,
            jsonb_agg(jsonb_build_object(
              'line_id', cli.id,
              'title', cli.title,
              'product_handle', cli.product_handle,
              'variant_sku', cli.variant_sku,
              'variant_title', cli.variant_title,
              'quantity', cli.quantity,
              'unit_price', cli.unit_price
            )) as matched_items
          from cart c
          join cart_payment_collection cpc on cpc.cart_id = c.id
          join payment_collection pc on pc.id = cpc.payment_collection_id
          join payment_session ps on ps.payment_collection_id = pc.id
          join cart_line_item cli on cli.cart_id = c.id and cli.deleted_at is null
          where c.customer_id = $1
            and c.completed_at is null
            and coalesce(pc.status, '') <> 'paid'
            and ps.provider_id ilike '%razorpay%'
            and ps.data ? 'razorpay_order_id'
            and not exists (
              select 1
              from ai_credit_ledger l
              where l.deleted_at is null
                and (
                  l.metadata_json->>'cart_id' = c.id
                  or l.metadata_json->>'razorpay_order_id' = ps.data->>'razorpay_order_id'
                )
            )
          group by c.id, c.customer_id, c.email, pc.id, ps.id, ps.data
        )
        select *
        from ai_carts
        where item_count > 0
          and item_count = ai_item_count
          and expected_credits > 0
        order by cart_id desc
        limit 5
      `,
      [customerId]
    )

    for (const cart of pending.rows) {
      const captured = await fetchCapturedRazorpayPayment(cart.razorpay_order_id)

      if (!captured) {
        continue
      }

      await client.query("begin")

      const walletResult = await client.query(
        `
          select *
          from ai_wallet
          where customer_id = $1
            and deleted_at is null
          limit 1
        `,
        [customerId]
      )
      const wallet = walletResult.rows[0]

      if (!wallet) {
        await client.query(
          `
            insert into ai_wallet (
              id, customer_id, customer_email, credit_balance, plan,
              pro_question_limit, metadata_json, created_at, updated_at
            )
            values ($1, $2, $3, 0, 'free', 0, '{}'::jsonb, now(), now())
          `,
          [
            `aiw_recover_${randomUUID().replace(/-/g, "").slice(0, 20)}`,
            customerId,
            customerEmail || cart.customer_email || null,
          ]
        )
      }

      const [activeWallet] = (
        await client.query(
          `
            select *
            from ai_wallet
            where customer_id = $1
              and deleted_at is null
            limit 1
          `,
          [customerId]
        )
      ).rows
      const credits = Number(cart.expected_credits || 0)
      const balanceAfter = Number(activeWallet.credit_balance || 0) + credits

      await client.query(
        `
          insert into ai_credit_ledger (
            id, wallet_id, customer_id, customer_email, type, source, credits,
            balance_after, order_id, usage_id, note, metadata_json, created_at, updated_at
          )
          values ($1, $2, $3, $4, 'order_credit', 'razorpay_captured_cart_recovery',
            $5, $6, null, null, $7, $8, now(), now())
        `,
        [
          `aicred_recover_${randomUUID().replace(/-/g, "").slice(0, 20)}`,
          activeWallet.id,
          customerId,
          customerEmail || cart.customer_email || null,
          credits,
          balanceAfter,
          "Recovered AI credits from captured Razorpay cart without completed Medusa order",
          JSON.stringify({
            cart_id: cart.cart_id,
            payment_collection_id: cart.payment_collection_id,
            payment_session_id: cart.payment_session_id,
            razorpay_order_id: cart.razorpay_order_id,
            razorpay_payment_id: captured.payment.id,
            captured_payment_verified: true,
            expected_credits: credits,
            matched_items: cart.matched_items,
          }),
        ]
      )

      await client.query(
        `
          update ai_wallet
          set credit_balance = $1,
            customer_email = $2,
            updated_at = now()
          where id = $3
        `,
        [balanceAfter, customerEmail || cart.customer_email || null, activeWallet.id]
      )
      await client.query(
        `
          update payment_session
          set data = coalesce(data, '{}'::jsonb) || $2::jsonb,
            updated_at = now()
          where id = $1
        `,
        [
          cart.payment_session_id,
          JSON.stringify({
            razorpay_payment_id: captured.payment.id,
            razorpay_recovered: true,
            razorpay_status: "captured",
            recovery_note:
              "Wallet credited after Razorpay API confirmed captured payment",
          }),
        ]
      )

      await client.query("commit")
    }
  } catch (error) {
    await client.query("rollback").catch(() => undefined)
    console.error("[ai-wallet] Razorpay cart recovery failed", {
      customer_id: customerId,
      message: error instanceof Error ? error.message : String(error),
    })
  } finally {
    await client.end().catch(() => undefined)
  }
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
    await reconcileCapturedRazorpayCarts({ customerId, customerEmail })
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
      { take: 100, order: { created_at: "DESC" } }
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
