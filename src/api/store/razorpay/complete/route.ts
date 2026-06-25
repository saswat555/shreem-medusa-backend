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
    return false
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
    return false
  }

  const body = await response.json()
  const payments = Array.isArray(body?.items) ? body.items : []
  const payment = payments.find((item: any) => item?.id === paymentId)

  return payment?.status === "captured" || payment?.captured === true
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
  const captureVerified =
    signatureVerified ||
    (await fetchCapturedPayment({
      orderId: razorpayOrderId,
      paymentId: razorpayPaymentId,
    }))

  if (!captureVerified) {
    return res.status(409).json({
      ok: false,
      message: "Razorpay payment could not be verified as captured",
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
          ps.payment_collection_id,
          cpc.cart_id,
          c.completed_at as cart_completed_at
        from payment_session ps
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

    let completePayload: any = undefined
    if (completeResponse) {
      try {
        completePayload = JSON.parse(completeResponse)
      } catch {
        completePayload = { raw: completeResponse }
      }
    }

    return res.json({
      ok: true,
      cart_id: cartId,
      payment_session_id: paymentSessionId,
      payment_collection_id: paymentCollectionId,
      completed: !session.cart_completed_at,
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
