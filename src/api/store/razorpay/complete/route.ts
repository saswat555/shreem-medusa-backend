import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import crypto from "crypto"
import { Client } from "pg"

type Body = {
  cart_id?: string
  payment_collection_id?: string
  payment_session_id?: string
  razorpay_order_id?: string
  razorpay_payment_id?: string
  razorpay_signature?: string
}

const getDatabaseUrl = () => {
  const databaseUrl = process.env.DATABASE_URL

  if (!databaseUrl) {
    throw new Error("DATABASE_URL is missing")
  }

  return databaseUrl
}

const getLocalBackendUrl = () =>
  String(
    process.env.INTERNAL_MEDUSA_BACKEND_URL ||
      process.env.LOCAL_MEDUSA_BACKEND_URL ||
      "http://127.0.0.1:9000"
  ).replace(/\/$/, "")

const verifyRazorpaySignature = ({
  orderId,
  paymentId,
  signature,
}: {
  orderId: string
  paymentId: string
  signature?: string
}) => {
  const secret = String(process.env.RAZORPAY_KEY_SECRET || "").trim()

  if (!secret || !signature) {
    return false
  }

  const expected = crypto
    .createHmac("sha256", secret)
    .update(`${orderId}|${paymentId}`)
    .digest("hex")

  const expectedBuffer = Buffer.from(expected)
  const receivedBuffer = Buffer.from(signature)

  return (
    expectedBuffer.length === receivedBuffer.length &&
    crypto.timingSafeEqual(expectedBuffer, receivedBuffer)
  )
}

const fetchCapturedPayment = async ({
  orderId,
  paymentId,
}: {
  orderId: string
  paymentId: string
}) => {
  const keyId = String(process.env.RAZORPAY_KEY_ID || "").trim()
  const keySecret = String(process.env.RAZORPAY_KEY_SECRET || "").trim()

  if (!keyId || !keySecret) {
    return { verified: false, payment: null as any, reason: "missing_credentials" }
  }

  const auth = Buffer.from(`${keyId}:${keySecret}`).toString("base64")
  const response = await fetch(
    `https://api.razorpay.com/v1/orders/${encodeURIComponent(orderId)}/payments`,
    {
      headers: {
        Authorization: `Basic ${auth}`,
      },
    }
  )

  if (!response.ok) {
    return { verified: false, payment: null as any, reason: `razorpay_${response.status}` }
  }

  const body = await response.json()
  const payments = Array.isArray(body?.items) ? body.items : []
  const payment = payments.find((item: any) => item?.id === paymentId)

  return {
    verified: payment?.status === "captured" || payment?.captured === true,
    payment,
    reason: !payment
      ? "payment_not_found"
      : payment?.status || "unknown_status",
  }
}

const getPublishableKey = async (client: Client) => {
  const result = await client.query(
    `
      select token
      from api_key
      where type = 'publishable'
        and revoked_at is null
      order by created_at asc
      limit 1
    `
  )

  return result.rows[0]?.token || ""
}

const completeCart = async ({
  cartId,
  publishableKey,
}: {
  cartId: string
  publishableKey: string
}) => {
  const response = await fetch(`${getLocalBackendUrl()}/store/carts/${cartId}/complete`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-publishable-api-key": publishableKey,
    },
    body: JSON.stringify({}),
  })
  const body = await response.text()

  if (!response.ok) {
    throw new Error(`Cart completion failed ${response.status}: ${body}`)
  }

  return body
}

const markPaymentCaptured = async ({
  client,
  paymentSessionId,
  paymentCollectionId,
  razorpayOrderId,
  razorpayPaymentId,
}: {
  client: Client
  paymentSessionId: string
  paymentCollectionId: string
  razorpayOrderId: string
  razorpayPaymentId: string
}) => {
  await client.query("begin")

  try {
    const paymentResult = await client.query(
      `
        update payment
        set
          captured_at = coalesce(captured_at, now()),
          data = coalesce(data, '{}'::jsonb) || jsonb_build_object(
            'provider', 'razorpay',
            'verified', true,
            'captured_payment_verified', true,
            'razorpay_status', 'captured',
            'razorpay_payment_status', 'captured',
            'razorpay_order_id', $2::text,
            'razorpay_payment_id', $3::text
          ),
          updated_at = now()
        where payment_session_id = $1
          and deleted_at is null
        returning id, amount, raw_amount
      `,
      [paymentSessionId, razorpayOrderId, razorpayPaymentId]
    )
    const payment = paymentResult.rows[0]

    let captureId = ""

    if (payment) {
      captureId = `cap_${crypto
        .createHash("sha1")
        .update(`${payment.id}:${razorpayPaymentId}`)
        .digest("hex")
        .slice(0, 26)}`

      await client.query(
        `
          insert into capture (
            id,
            amount,
            raw_amount,
            payment_id,
            metadata,
            created_at,
            updated_at
          )
          select
            $1::text,
            $2::numeric,
            $3::jsonb,
            $4::text,
            jsonb_build_object(
              'source', 'razorpay_checkout_completion',
              'razorpay_order_id', $5::text,
              'razorpay_payment_id', $6::text
            ),
            now(),
            now()
          where not exists (
            select 1
            from capture
            where payment_id = $4::text
              and deleted_at is null
          )
        `,
        [
          captureId,
          payment.amount,
          payment.raw_amount,
          payment.id,
          razorpayOrderId,
          razorpayPaymentId,
        ]
      )
    }

    await client.query(
      `
        update payment_collection
        set
          status = 'completed',
          captured_amount = amount,
          raw_captured_amount = raw_amount,
          completed_at = coalesce(completed_at, now()),
          updated_at = now()
        where id = $1
      `,
      [paymentCollectionId]
    )

    const orderResult = await client.query(
      `
        select o.id as order_id, o.currency_code, o.version
        from order_payment_collection opc
        join "order" o on o.id = opc.order_id
        where opc.payment_collection_id = $1
          and opc.deleted_at is null
          and o.deleted_at is null
        union
        select o.id as order_id, o.currency_code, o.version
        from cart_payment_collection cpc
        join order_cart oc on oc.cart_id = cpc.cart_id and oc.deleted_at is null
        join "order" o on o.id = oc.order_id
        where cpc.payment_collection_id = $1
          and cpc.deleted_at is null
          and o.deleted_at is null
        limit 1
      `,
      [paymentCollectionId]
    )
    const order = orderResult.rows[0]

    if (!order || !payment) {
      await client.query("commit")
      return { order_id: order?.order_id || "" }
    }

    const transactionReference = captureId || payment.id
    const transactionId = `ordtrx_${crypto
      .createHash("sha1")
      .update(`${order.order_id}:${transactionReference}`)
      .digest("hex")
      .slice(0, 26)}`

    await client.query(
      `
        insert into order_transaction (
          id,
          order_id,
          version,
          amount,
          raw_amount,
          currency_code,
          reference,
          reference_id,
          created_at,
          updated_at
        )
        select
          $1::text,
          $2::text,
          $3::integer,
          $4::numeric,
          $5::jsonb,
          $6::text,
          'capture',
          $7::text,
          now(),
          now()
        where not exists (
          select 1
          from order_transaction
          where order_id = $2::text
            and reference = 'capture'
            and reference_id = $7::text
            and deleted_at is null
        )
      `,
      [
        transactionId,
        order.order_id,
        Number(order.version || 1),
        payment.amount,
        payment.raw_amount,
        order.currency_code,
        transactionReference,
      ]
    )

    await client.query(
      `
        update order_summary
        set
          totals = coalesce(totals, '{}'::jsonb) || jsonb_build_object(
            'paid_total', $2::numeric,
            'raw_paid_total', $3::jsonb,
            'transaction_total', $2::numeric,
            'raw_transaction_total', $3::jsonb,
            'pending_difference', 0,
            'raw_pending_difference', jsonb_build_object('value', '0', 'precision', 20)
          ),
          updated_at = now()
        where order_id = $1
          and deleted_at is null
      `,
      [order.order_id, payment.amount, payment.raw_amount]
    )

    await client.query("commit")
    return { order_id: order.order_id }
  } catch (error) {
    await client.query("rollback").catch(() => undefined)
    throw error
  }
}

const getCompletedOrder = async (client: Client, cartId: string) => {
  const result = await client.query(
    `
      select o.id, o.display_id, o.email, o.currency_code
      from order_cart oc
      join "order" o on o.id = oc.order_id
      where oc.cart_id = $1
        and oc.deleted_at is null
        and o.deleted_at is null
      order by o.created_at desc
      limit 1
    `,
    [cartId]
  )

  return result.rows[0] || null
}

export const POST = async (req: MedusaRequest<Body>, res: MedusaResponse) => {
  const {
    cart_id: cartId,
    payment_collection_id: paymentCollectionId,
    payment_session_id: paymentSessionId,
    razorpay_order_id: razorpayOrderId,
    razorpay_payment_id: razorpayPaymentId,
    razorpay_signature: razorpaySignature,
  } = req.body || {}

  if (!cartId || !paymentCollectionId || !paymentSessionId || !razorpayOrderId || !razorpayPaymentId) {
    return res.status(400).json({
      ok: false,
      message: "Missing Razorpay completion details",
    })
  }

  const signatureVerified = verifyRazorpaySignature({
    orderId: razorpayOrderId,
    paymentId: razorpayPaymentId,
    signature: razorpaySignature,
  })
  const capturedPayment = await fetchCapturedPayment({
    orderId: razorpayOrderId,
    paymentId: razorpayPaymentId,
  })
  const captureVerified = signatureVerified || capturedPayment.verified

  if (!captureVerified) {
    return res.status(409).json({
      ok: false,
      message: `Razorpay payment could not be verified as captured (${capturedPayment.reason})`,
    })
  }

  const client = new Client({ connectionString: getDatabaseUrl() })

  try {
    await client.connect()
    await client.query("begin")

    const sessionResult = await client.query(
      `
        select
          ps.id as payment_session_id,
          ps.amount,
          ps.data as payment_session_data,
          ps.payment_collection_id,
          pc.amount as payment_collection_amount,
          cpc.cart_id,
          c.completed_at as cart_completed_at
        from payment_session ps
        join payment_collection pc
          on pc.id = ps.payment_collection_id
          and pc.deleted_at is null
        join cart_payment_collection cpc
          on cpc.payment_collection_id = ps.payment_collection_id
          and cpc.deleted_at is null
        join cart c
          on c.id = cpc.cart_id
        where ps.id = $1
          and ps.payment_collection_id = $2
          and cpc.cart_id = $3
          and ps.deleted_at is null
        limit 1
      `,
      [paymentSessionId, paymentCollectionId, cartId]
    )
    const session = sessionResult.rows[0]

    if (!session) {
      await client.query("rollback")
      return res.status(404).json({
        ok: false,
        message: "Payment session for cart was not found",
      })
    }

    if (!capturedPayment.payment) {
      await client.query("rollback")
      return res.status(409).json({
        ok: false,
        message: "Razorpay payment was signed but live payment details could not be loaded for amount verification. Please contact support.",
      })
    }

    const expectedMinorAmount = Math.round(
      Number(session.payment_collection_amount || session.amount || 0) * 100
    )
    const paidMinorAmount = Number(capturedPayment.payment?.amount || 0)

    if (
      expectedMinorAmount <= 0 ||
      paidMinorAmount <= 0 ||
      expectedMinorAmount !== paidMinorAmount
    ) {
      await client.query("rollback")
      console.error("[razorpay-complete] amount mismatch", {
        cart_id: cartId,
        payment_collection_id: paymentCollectionId,
        payment_session_id: paymentSessionId,
        razorpay_order_id: razorpayOrderId,
        razorpay_payment_id: razorpayPaymentId,
        expected_minor_amount: expectedMinorAmount,
        paid_minor_amount: paidMinorAmount,
      })
      return res.status(409).json({
        ok: false,
        message: "Razorpay payment amount does not match the current cart total. Please contact support before retrying payment.",
      })
    }

    await client.query(
      `
        update cart
        set
          metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object(
            'recovered_razorpay_cart_id', id,
            'razorpay_checkout_confirmed', true,
            'razorpay_checkout_confirmed_at', now(),
            'razorpay_order_id', $2::text,
            'razorpay_payment_id', $3::text
          ),
          updated_at = now()
        where id = $1
      `,
      [cartId, razorpayOrderId, razorpayPaymentId]
    )

    await client.query(
      `
        update payment_session
        set
          status = 'authorized',
          authorized_at = coalesce(authorized_at, now()),
          data = coalesce(data, '{}'::jsonb) || jsonb_build_object(
            'provider', 'razorpay',
            'verified', true,
            'signature_verified', $4::boolean,
            'captured_payment_verified', true,
            'razorpay_status', 'captured',
            'razorpay_order_id', $2::text,
            'razorpay_payment_id', $3::text,
            'razorpay_signature', coalesce($5::text, ''),
            'razorpay_checkout_confirmed_at', now()
          ),
          updated_at = now()
        where id = $1
      `,
      [
        paymentSessionId,
        razorpayOrderId,
        razorpayPaymentId,
        signatureVerified,
        razorpaySignature || "",
      ]
    )

    await client.query(
      `
        update payment_collection
        set
          status = case when status = 'completed' then status else 'authorized' end,
          authorized_amount = amount,
          raw_authorized_amount = raw_amount,
          updated_at = now()
        where id = $1
      `,
      [paymentCollectionId]
    )

    const publishableKey = await getPublishableKey(client)
    await client.query("commit")

    let completeResponse = ""
    if (!session.cart_completed_at) {
      completeResponse = await completeCart({ cartId, publishableKey })
    }

    await markPaymentCaptured({
      client,
      paymentSessionId,
      paymentCollectionId,
      razorpayOrderId,
      razorpayPaymentId,
    })

    let completePayload: any = undefined
    if (completeResponse) {
      try {
        completePayload = JSON.parse(completeResponse)
      } catch {
        completePayload = { raw: completeResponse }
      }
    }

    const order = completePayload?.order || (await getCompletedOrder(client, cartId))

    return res.json({
      ok: true,
      cart_id: cartId,
      payment_session_id: paymentSessionId,
      payment_collection_id: paymentCollectionId,
      completed: !session.cart_completed_at,
      order,
      complete_response: completePayload,
    })
  } catch (error: any) {
    await client.query("rollback").catch(() => undefined)

    console.error("[razorpay-complete] failed", {
      cart_id: cartId,
      payment_collection_id: paymentCollectionId,
      payment_session_id: paymentSessionId,
      razorpay_order_id: razorpayOrderId,
      razorpay_payment_id: razorpayPaymentId,
      message: error?.message,
      stack: error?.stack,
    })

    return res.status(500).json({
      ok: false,
      message: error?.message || "Razorpay completion failed",
    })
  } finally {
    await client.end().catch(() => undefined)
  }
}
