import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import crypto from "crypto"
import { Client } from "pg"

const readRawBody = async (req: MedusaRequest) => {
  if (typeof (req as any).text === "function") {
    return (req as any).text()
  }

  return new Promise<string>((resolve, reject) => {
    const chunks: Buffer[] = []

    ;(req as any)
      .on("data", (chunk: Buffer | string) =>
        chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk))
      )
      .on("end", () => resolve(Buffer.concat(chunks).toString("utf8")))
      .on("error", reject)
  })
}

const verifyWebhookSignature = ({
  rawBody,
  signature,
}: {
  rawBody: string
  signature?: string | string[]
}) => {
  const secret = String(process.env.RAZORPAY_WEBHOOK_SECRET || "").trim()

  if (!secret) {
    return process.env.NODE_ENV !== "production"
  }

  const received = Array.isArray(signature) ? signature[0] : signature

  if (!received) {
    return false
  }

  const expected = crypto
    .createHmac("sha256", secret)
    .update(rawBody)
    .digest("hex")

  const expectedBuffer = Buffer.from(expected)
  const receivedBuffer = Buffer.from(received)

  if (expectedBuffer.length !== receivedBuffer.length) {
    return false
  }

  return crypto.timingSafeEqual(expectedBuffer, receivedBuffer)
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

const markDigitalCart = async (client: Client, cartId: string) => {
  const digitalResult = await client.query(
    `
      select
        count(*)::integer as item_count,
        count(*) filter (
          where
            lower(coalesce(cli.product_handle, p.handle, '')) in (
              'shreem-ai-jyotish-credits',
              'shreem-ai-jyotish-monthly'
            )
            or lower(coalesce(cli.variant_sku, pv.sku, '')) like 'shreem-ai-%'
            or coalesce(cli.metadata, '{}'::jsonb)->>'digital_product' = 'true'
            or coalesce(p.metadata, '{}'::jsonb)->>'digital_product' = 'true'
            or coalesce(pv.metadata, '{}'::jsonb)->>'digital_product' = 'true'
        )::integer as digital_count
      from cart_line_item cli
      left join product p on p.id = cli.product_id
      left join product_variant pv on pv.id = cli.variant_id
      where cli.cart_id = $1
        and cli.deleted_at is null
    `,
    [cartId]
  )
  const row = digitalResult.rows[0] || {}
  const itemCount = Number(row.item_count || 0)
  const digitalCount = Number(row.digital_count || 0)

  if (!itemCount || itemCount !== digitalCount) {
    return
  }

  await client.query(
    `
      update cart_line_item
      set
        requires_shipping = false,
        metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object(
          'digital', true,
          'digital_product', true,
          'no_shipping', true,
          'requires_shipping', false,
          'fulfillment_type', 'digital'
        ),
        updated_at = now()
      where cart_id = $1
        and deleted_at is null
    `,
    [cartId]
  )

  await client.query(
    `
      update cart_shipping_method
      set deleted_at = now(), updated_at = now()
      where cart_id = $1
        and deleted_at is null
    `,
    [cartId]
  )
}

const completeCart = async ({
  cartId,
  publishableKey,
}: {
  cartId: string
  publishableKey: string
}) => {
  if (!publishableKey) {
    throw new Error("No publishable API key found for cart completion")
  }

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
  razorpayPaymentId,
}: {
  client: Client
  paymentSessionId: string
  paymentCollectionId: string
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
          'razorpay_status', 'captured',
          'razorpay_payment_id', $2::text,
          'captured_payment_verified', true
        ),
        updated_at = now()
      where payment_session_id = $1
        and deleted_at is null
      returning id, amount, raw_amount
    `,
    [paymentSessionId, razorpayPaymentId]
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
            'source', 'razorpay_webhook',
            'razorpay_payment_id', $5::text
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
      order by opc.created_at desc
      limit 1
    `,
    [paymentCollectionId]
  )
  const order = orderResult.rows[0]

  if (!order || !payment) {
    return
  }

  const transactionId = `ordtrx_${crypto
    .createHash("sha1")
    .update(`${order.order_id}:${captureId || payment.id}`)
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
      captureId || payment.id,
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
  } catch (error) {
    await client.query("rollback").catch(() => undefined)
    throw error
  }
}

export async function POST(req: MedusaRequest, res: MedusaResponse) {
  const rawBody = await readRawBody(req)
  const signature = req.headers["x-razorpay-signature"] as string | string[] | undefined

  if (!verifyWebhookSignature({ rawBody, signature })) {
    return res.status(401).json({ ok: false, message: "Invalid Razorpay signature" })
  }

  let payload: any

  try {
    payload = JSON.parse(rawBody)
  } catch {
    return res.status(400).json({ ok: false, message: "Invalid JSON payload" })
  }

  const event = String(payload?.event || "")
  const payment = payload?.payload?.payment?.entity || payload?.payment || {}
  const razorpayPaymentId = String(payment?.id || "")
  const razorpayOrderId = String(payment?.order_id || "")
  const captured =
    event === "payment.captured" ||
    payment?.captured === true ||
    payment?.status === "captured" ||
    payment?.status === "authorized"

  if (!razorpayPaymentId || !razorpayOrderId || !captured) {
    return res.json({ ok: true, ignored: true, event })
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
          ps.data,
          ps.payment_collection_id,
          cpc.cart_id,
          c.completed_at as cart_completed_at
        from payment_session ps
        join cart_payment_collection cpc
          on cpc.payment_collection_id = ps.payment_collection_id
          and cpc.deleted_at is null
        join cart c
          on c.id = cpc.cart_id
        where ps.deleted_at is null
          and (
            ps.data->>'razorpay_order_id' = $1
            or ps.data->>'id' = $1
          )
        order by ps.created_at desc
        limit 1
      `,
      [razorpayOrderId]
    )
    const session = sessionResult.rows[0]

    if (!session) {
      await client.query("commit")
      return res.json({ ok: true, ignored: true, reason: "payment_session_not_found" })
    }

    const expectedAmount = Math.round(Number(session.amount || 0) * 100)
    const actualAmount = Number(payment?.amount || 0)

    if (expectedAmount > 0 && actualAmount > 0 && expectedAmount !== actualAmount) {
      await client.query("rollback")
      return res.status(409).json({
        ok: false,
        message: "Razorpay amount mismatch",
        expected_amount: expectedAmount,
        actual_amount: actualAmount,
      })
    }

    await markDigitalCart(client, session.cart_id)

    await client.query(
      `
        update cart
        set
          metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object(
            'recovered_razorpay_cart_id', id,
            'razorpay_webhook_confirmed', true,
            'razorpay_webhook_confirmed_at', now()
          ),
          updated_at = now()
        where id = $1
      `,
      [session.cart_id]
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
            'captured_payment_verified', true,
            'razorpay_status', 'captured',
            'razorpay_order_id', $2::text,
            'razorpay_payment_id', $3::text,
            'razorpay_payment_status', $4::text,
            'razorpay_webhook_event', $5::text,
            'razorpay_webhook_confirmed_at', now()
          ),
          updated_at = now()
        where id = $1
      `,
      [
        session.payment_session_id,
        razorpayOrderId,
        razorpayPaymentId,
        String(payment?.status || "captured"),
        event,
      ]
    )

    await client.query(
      `
        update payment_collection
        set
          status = case
            when status = 'completed' then status
            else 'authorized'
          end,
          authorized_amount = amount,
          raw_authorized_amount = raw_amount,
          updated_at = now()
        where id = $1
      `,
      [session.payment_collection_id]
    )

    const publishableKey = await getPublishableKey(client)

    await client.query("commit")

    if (!session.cart_completed_at) {
      await completeCart({ cartId: session.cart_id, publishableKey })
    }

    await markPaymentCaptured({
      client,
      paymentSessionId: session.payment_session_id,
      paymentCollectionId: session.payment_collection_id,
      razorpayPaymentId,
    })

    return res.json({
      ok: true,
      event,
      cart_id: session.cart_id,
      payment_session_id: session.payment_session_id,
    })
  } catch (error: any) {
    await client.query("rollback").catch(() => undefined)

    console.error("[razorpay-webhook] failed", {
      event,
      razorpay_order_id: razorpayOrderId,
      razorpay_payment_id: razorpayPaymentId,
      message: error?.message,
      stack: error?.stack,
    })

    return res.status(500).json({
      ok: false,
      message: error?.message || "Razorpay webhook failed",
    })
  } finally {
    await client.end().catch(() => undefined)
  }
}
