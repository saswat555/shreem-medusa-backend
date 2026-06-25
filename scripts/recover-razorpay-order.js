const crypto = require("crypto")
const fs = require("fs")
const path = require("path")
const { Client } = require("pg")

const envPath = path.join(__dirname, "..", ".env")

function loadEnv() {
  const env = {}
  for (const line of fs.readFileSync(envPath, "utf8").split(/\r?\n/)) {
    if (!line || line.trim().startsWith("#") || !line.includes("=")) {
      continue
    }
    const index = line.indexOf("=")
    let value = line.slice(index + 1).trim()
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1)
    }
    env[line.slice(0, index).trim()] = value
  }
  return env
}

const env = { ...loadEnv(), ...process.env }

const razorpayOrderId = process.argv[2] || "order_T5lXaWUYguDxqs"
let razorpayPaymentId = process.argv[3] || ""
const expectedEmail = (process.argv[4] || "aamitsaxena32@gmail.com").toLowerCase()
const expectedAmountPaise = Number(process.argv[5] || 169700)
const fallbackCartId = process.argv[6] || "cart_01KVYQ1KX63S577Q60H12ZNYT5"
const fallbackPaymentSessionId = process.argv[7] || "payses_01KVYQJ7BC1P16G5G35YWDHSB3"
const fallbackPaymentCollectionId = process.argv[8] || "pay_col_01KVYQJ79J53MBEZDYDWSTS5VC"
const FREE_SHIPPING_THRESHOLD_PAISE = Number(process.env.FREE_SHIPPING_THRESHOLD_PAISE || 149900)

const backendUrl = String(
  env.INTERNAL_MEDUSA_BACKEND_URL ||
    env.LOCAL_MEDUSA_BACKEND_URL ||
    "http://127.0.0.1:9000"
).replace(/\/$/, "")

async function getPublishableKey(client) {
  const result = await client.query(`
    select token
    from api_key
    where type = 'publishable'
      and revoked_at is null
    order by created_at asc
    limit 1
  `)
  return result.rows[0]?.token || ""
}

async function completeCart(cartId, publishableKey) {
  const response = await fetch(`${backendUrl}/store/carts/${cartId}/complete`, {
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

async function fetchJson(url, options = {}) {
  const response = await fetch(url, options)
  const body = await response.text()
  let json = undefined

  try {
    json = body ? JSON.parse(body) : undefined
  } catch {
    json = { raw: body }
  }

  if (!response.ok) {
    throw new Error(`${options.method || "GET"} ${url} failed ${response.status}: ${body}`)
  }

  return json
}

async function ensureShippingMethod(client, cartId, publishableKey) {
  const physicalCartResult = await client.query(
    `
      select count(*)::integer as physical_items
      from cart_line_item cli
      where cli.cart_id = $1
        and cli.deleted_at is null
        and coalesce(cli.requires_shipping, true) = true
    `,
    [cartId]
  )
  const hasPhysicalItems = Number(physicalCartResult.rows[0]?.physical_items || 0) > 0
  const existing = await client.query(
    `
      select id, name, shipping_option_id
      from cart_shipping_method
      where cart_id = $1
        and deleted_at is null
      order by created_at asc
    `,
    [cartId]
  )

  const incompatibleExisting = existing.rows.filter((row) =>
    /no shipping|no-shipping|digital/i.test(String(row.name || ""))
  )

  if (hasPhysicalItems && incompatibleExisting.length) {
    const ids = incompatibleExisting.map((row) => row.id)
    console.log("[recover-razorpay-order] removing incompatible shipping methods", incompatibleExisting)
    await client.query(
      `
        update cart_shipping_method_tax_line
        set deleted_at = now(), updated_at = now()
        where shipping_method_id = any($1::text[])
          and deleted_at is null
      `,
      [ids]
    )
    await client.query(
      `
        update cart_shipping_method_adjustment
        set deleted_at = now(), updated_at = now()
        where shipping_method_id = any($1::text[])
          and deleted_at is null
      `,
      [ids]
    )
    await client.query(
      `
        update cart_shipping_method
        set deleted_at = now(), updated_at = now()
        where id = any($1::text[])
          and deleted_at is null
      `,
      [ids]
    )
  }

  const remaining = existing.rows.filter(
    (row) => !incompatibleExisting.some((bad) => bad.id === row.id)
  )

  if (remaining.length) {
    console.log("[recover-razorpay-order] existing shipping methods", remaining)
    return
  }

  const optionsJson = await fetchJson(
    `${backendUrl}/store/shipping-options?cart_id=${encodeURIComponent(cartId)}`,
    {
      headers: {
        "x-publishable-api-key": publishableKey,
      },
    }
  )
  const shippingOptions = Array.isArray(optionsJson?.shipping_options)
    ? optionsJson.shipping_options
    : []
  console.log("[recover-razorpay-order] available shipping options", shippingOptions)

  const usableShippingOptions = shippingOptions.filter((option) => {
    const haystack = `${option?.name || ""} ${JSON.stringify(option?.metadata || {})}`.toLowerCase()
    return !haystack.includes("no shipping") && !haystack.includes("no-shipping") && !haystack.includes("digital")
  })

  const shippingOption =
    usableShippingOptions.find((option) => option?.price_type === "flat") ||
    usableShippingOptions[0] ||
    shippingOptions.find((option) => option?.price_type === "flat") ||
    shippingOptions[0]

  if (!shippingOption?.id) {
    throw new Error(
      `No shipping options returned for cart ${cartId}. Add a valid shipping option for the cart region before recovery.`
    )
  }

  console.log("[recover-razorpay-order] adding shipping method", {
    cart_id: cartId,
    option_id: shippingOption.id,
    name: shippingOption.name,
    price_type: shippingOption.price_type,
  })

  await fetchJson(`${backendUrl}/store/carts/${cartId}/shipping-methods`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-publishable-api-key": publishableKey,
    },
    body: JSON.stringify({
      option_id: shippingOption.id,
    }),
  })

  if (expectedAmountPaise >= FREE_SHIPPING_THRESHOLD_PAISE) {
    const freeShipping = await client.query(
      `
        update cart_shipping_method
        set
          amount = 0,
          raw_amount = jsonb_build_object('value', '0', 'precision', 20),
          metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object(
            'free_shipping_recovery', true,
            'free_shipping_threshold_paise', $2::integer,
            'free_shipping_reason', 'paid cart total qualifies for free shipping'
          ),
          updated_at = now()
        where cart_id = $1
          and deleted_at is null
        returning id, name, shipping_option_id, amount, raw_amount
      `,
      [cartId, FREE_SHIPPING_THRESHOLD_PAISE]
    )

    await client.query(
      `
        update cart_shipping_method_tax_line
        set deleted_at = now(), updated_at = now()
        where shipping_method_id = any($1::text[])
          and deleted_at is null
      `,
      [freeShipping.rows.map((row) => row.id)]
    )

    console.log("[recover-razorpay-order] applied free shipping recovery", freeShipping.rows)
  }

  const after = await client.query(
    `
      select id, name, shipping_option_id
      from cart_shipping_method
      where cart_id = $1
        and deleted_at is null
      order by created_at asc
    `,
    [cartId]
  )
  console.log("[recover-razorpay-order] shipping methods after add", after.rows)
}

async function markRazorpayPaymentReady(client, session, razorpayOrderId, razorpayPaymentId) {
  await client.query(
    `
      update payment_session
      set
        status = 'authorized',
        authorized_at = coalesce(authorized_at, now()),
        deleted_at = null,
        data = coalesce(data, '{}'::jsonb) || jsonb_build_object(
          'provider', 'razorpay',
          'verified', true,
          'captured_payment_verified', true,
          'razorpay_status', 'captured',
          'razorpay_order_id', $2::text,
          'razorpay_payment_id', $3::text,
          'razorpay_payment_status', 'captured',
          'razorpay_manual_recovery', true,
          'razorpay_manual_recovery_at', now()
        ),
        updated_at = now()
      where id = $1
    `,
    [session.payment_session_id, razorpayOrderId, razorpayPaymentId]
  )

  await client.query(
    `
      update payment_collection
      set
        status = case when status = 'completed' then status else 'authorized' end,
        amount = $2::numeric,
        raw_amount = $3::jsonb,
        authorized_amount = $2::numeric,
        raw_authorized_amount = $3::jsonb,
        updated_at = now()
      where id = $1
    `,
    [
      session.payment_collection_id,
      Number(expectedAmountPaise / 100),
      JSON.stringify({ value: String(expectedAmountPaise / 100), precision: 20 }),
    ]
  )
}

async function createMissingRazorpayPaymentSession(client) {
  const linkedCart = await client.query(
    `
      select
        cpc.cart_id,
        cpc.payment_collection_id,
        c.email,
        c.customer_id,
        c.currency_code,
        c.completed_at as cart_completed_at,
        pc.amount as payment_collection_amount,
        pc.raw_amount as payment_collection_raw_amount
      from cart_payment_collection cpc
      join cart c
        on c.id = cpc.cart_id
      join payment_collection pc
        on pc.id = cpc.payment_collection_id
      where cpc.cart_id = $1
        and cpc.payment_collection_id = $2
      order by cpc.created_at desc
      limit 1
    `,
    [fallbackCartId, fallbackPaymentCollectionId]
  )
  const row = linkedCart.rows[0]

  if (!row) {
    return null
  }

  const amount = Number(expectedAmountPaise / 100)
  const rawAmount = JSON.stringify({ value: String(amount), precision: 20 })
  const sessionData = {
    provider: "razorpay",
    verified: true,
    captured_payment_verified: true,
    razorpay_status: "captured",
    razorpay_order_id: razorpayOrderId,
    razorpay_payment_id: razorpayPaymentId,
    razorpay_payment_status: "captured",
    razorpay_manual_recovery: true,
    razorpay_manual_registry: true,
    razorpay_manual_recovery_at: new Date().toISOString(),
    razorpay_recovery_comment: `Manual recovery: payment is captured in Razorpay. Razorpay order ${razorpayOrderId}, payment ${razorpayPaymentId}.`,
  }

  console.log("[recover-razorpay-order] creating missing Razorpay payment session", {
    payment_session_id: fallbackPaymentSessionId,
    payment_collection_id: fallbackPaymentCollectionId,
    cart_id: fallbackCartId,
    amount,
    provider_id: "pp_razorpay_razorpay",
    comment: sessionData.razorpay_recovery_comment,
  })

  await client.query(
    `
      insert into payment_session (
        id,
        currency_code,
        amount,
        raw_amount,
        provider_id,
        data,
        context,
        status,
        authorized_at,
        payment_collection_id,
        metadata,
        created_at,
        updated_at
      )
      values (
        $1::text,
        $2::text,
        $3::numeric,
        $4::jsonb,
        'pp_razorpay_razorpay',
        $5::jsonb,
        $6::jsonb,
        'authorized',
        now(),
        $7::text,
        $8::jsonb,
        now(),
        now()
      )
      on conflict (id) do update
      set
        deleted_at = null,
        amount = excluded.amount,
        raw_amount = excluded.raw_amount,
        provider_id = excluded.provider_id,
        data = payment_session.data || excluded.data,
        context = coalesce(payment_session.context, '{}'::jsonb) || excluded.context,
        status = 'authorized',
        authorized_at = coalesce(payment_session.authorized_at, now()),
        payment_collection_id = excluded.payment_collection_id,
        metadata = coalesce(payment_session.metadata, '{}'::jsonb) || excluded.metadata,
        updated_at = now()
    `,
    [
      fallbackPaymentSessionId,
      String(row.currency_code || "inr"),
      amount,
      rawAmount,
      JSON.stringify(sessionData),
      JSON.stringify({
        cart_id: fallbackCartId,
        customer_id: row.customer_id || "",
        email: row.email || expectedEmail,
        source: "razorpay_manual_registry",
      }),
      fallbackPaymentCollectionId,
      JSON.stringify({
        source: "razorpay_manual_registry",
        cart_id: fallbackCartId,
        razorpay_order_id: razorpayOrderId,
        razorpay_payment_id: razorpayPaymentId,
        comment: sessionData.razorpay_recovery_comment,
      }),
    ]
  )

  await client.query(
    `
      update payment_collection
      set
        amount = $2::numeric,
        raw_amount = $3::jsonb,
        authorized_amount = $2::numeric,
        raw_authorized_amount = $3::jsonb,
        status = case when status = 'completed' then status else 'authorized' end,
        metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object(
          'razorpay_manual_registry', true,
          'razorpay_order_id', $4::text,
          'razorpay_payment_id', $5::text,
          'comment', $6::text
        ),
        updated_at = now()
      where id = $1
    `,
    [
      fallbackPaymentCollectionId,
      amount,
      rawAmount,
      razorpayOrderId,
      razorpayPaymentId,
      sessionData.razorpay_recovery_comment,
    ]
  )

  return {
    payment_session_id: fallbackPaymentSessionId,
    amount,
    raw_amount: JSON.parse(rawAmount),
    data: sessionData,
    payment_collection_id: fallbackPaymentCollectionId,
    cart_id: fallbackCartId,
    cart_completed_at: row.cart_completed_at,
    email: row.email,
    customer_id: row.customer_id,
    currency_code: row.currency_code,
    payment_session_deleted_at: null,
    cart_payment_collection_deleted_at: null,
  }
}

async function fetchCapturedPaymentId() {
  const keyId = String(env.RAZORPAY_KEY_ID || "").trim()
  const keySecret = String(env.RAZORPAY_KEY_SECRET || "").trim()

  if (!keyId || !keySecret) {
    throw new Error("Razorpay API keys are missing")
  }

  const auth = Buffer.from(`${keyId}:${keySecret}`).toString("base64")
  const response = await fetch(
    `https://api.razorpay.com/v1/orders/${encodeURIComponent(razorpayOrderId)}/payments`,
    {
      headers: {
        Authorization: `Basic ${auth}`,
      },
    }
  )
  const body = await response.text()

  if (!response.ok) {
    throw new Error(`Razorpay payment lookup failed ${response.status}: ${body}`)
  }

  const json = JSON.parse(body)
  const payments = Array.isArray(json?.items) ? json.items : []
  const captured = payments.find(
    (item) => item?.status === "captured" || item?.captured === true
  )

  if (!captured?.id) {
    throw new Error(`No captured Razorpay payment found for ${razorpayOrderId}`)
  }

  if (expectedAmountPaise > 0 && Number(captured.amount || 0) !== expectedAmountPaise) {
    throw new Error(
      `Captured payment amount mismatch. Expected ${expectedAmountPaise}, found ${captured.amount}`
    )
  }

  return captured.id
}

async function main() {
  if (!env.DATABASE_URL) {
    throw new Error("DATABASE_URL is missing")
  }

  const client = new Client({ connectionString: env.DATABASE_URL })
  await client.connect()

  try {
    if (!razorpayPaymentId || razorpayPaymentId === "-") {
      razorpayPaymentId = await fetchCapturedPaymentId()
      console.log("[recover-razorpay-order] found captured payment", {
        razorpay_order_id: razorpayOrderId,
        razorpay_payment_id: razorpayPaymentId,
      })
    }

    const sessionResult = await client.query(
      `
        select
          ps.id as payment_session_id,
          ps.amount,
          ps.raw_amount,
          ps.data,
          ps.payment_collection_id,
          coalesce(cpc.cart_id, $2::text) as cart_id,
          c.completed_at as cart_completed_at,
          c.email,
          c.customer_id,
          c.currency_code,
          ps.deleted_at as payment_session_deleted_at,
          cpc.deleted_at as cart_payment_collection_deleted_at
        from payment_session ps
        left join cart_payment_collection cpc
          on cpc.payment_collection_id = ps.payment_collection_id
        left join cart c
          on c.id = coalesce(cpc.cart_id, $2::text)
        where
          ps.data->>'razorpay_order_id' = $1
          or ps.data->>'id' = $1
          or cpc.cart_id = $2
          or ps.id = $3
          or ps.payment_collection_id = $4
        order by ps.created_at desc
        limit 1
      `,
      [
        razorpayOrderId,
        fallbackCartId,
        fallbackPaymentSessionId,
        fallbackPaymentCollectionId,
      ]
    )
    let session = sessionResult.rows[0]
    if (!session) {
      const diagnostics = await client.query(
        `
          select 'payment_session_by_id' as kind, count(*)::integer as count
          from payment_session
          where id = $1
          union all
          select 'payment_session_by_collection' as kind, count(*)::integer as count
          from payment_session
          where payment_collection_id = $2
          union all
          select 'cart_payment_collection_by_cart' as kind, count(*)::integer as count
          from cart_payment_collection
          where cart_id = $3
          union all
          select 'cart_by_id' as kind, count(*)::integer as count
          from cart
          where id = $3
          union all
          select 'order_cart_by_cart' as kind, count(*)::integer as count
          from order_cart
          where cart_id = $3
        `,
        [fallbackPaymentSessionId, fallbackPaymentCollectionId, fallbackCartId]
      )
      console.log("[recover-razorpay-order] diagnostics", diagnostics.rows)
      session = await createMissingRazorpayPaymentSession(client)

      if (!session) {
        throw new Error(`No payment session found for ${razorpayOrderId}`)
      }
    }

    if (session.payment_session_deleted_at || session.cart_payment_collection_deleted_at) {
      console.log("[recover-razorpay-order] reviving soft-deleted payment link", {
        payment_session_id: session.payment_session_id,
        payment_session_deleted_at: session.payment_session_deleted_at,
        payment_collection_id: session.payment_collection_id,
        cart_id: session.cart_id,
        cart_payment_collection_deleted_at: session.cart_payment_collection_deleted_at,
      })
    }

    await client.query(
      `
        update payment_session
        set deleted_at = null, updated_at = now()
        where id = $1
      `,
      [session.payment_session_id]
    )
    await client.query(
      `
        update cart_payment_collection
        set deleted_at = null, updated_at = now()
        where payment_collection_id = $1
          and cart_id = $2
      `,
      [session.payment_collection_id, session.cart_id]
    )

    const customerResult = await client.query(
      `select id, email, first_name, last_name from customer where id = $1 or lower(email) = $2 limit 1`,
      [session.customer_id, expectedEmail]
    )
    const customer = customerResult.rows[0]
    const cartEmail = String(session.email || customer?.email || "").toLowerCase()
    if (expectedEmail && cartEmail !== expectedEmail) {
      throw new Error(`Cart email mismatch. Expected ${expectedEmail}, found ${cartEmail}`)
    }

    const expectedFromSession = Math.round(Number(session.amount || 0) * 100)
    if (
      expectedAmountPaise > 0 &&
      expectedFromSession > 0 &&
      expectedFromSession !== expectedAmountPaise
    ) {
      throw new Error(
        `Amount mismatch. Razorpay ${expectedAmountPaise}, session ${expectedFromSession}`
      )
    }

    const items = await client.query(
      `
        select
          cli.id,
          cli.title,
          cli.quantity,
          cli.unit_price,
          cli.variant_id,
          cli.product_id,
          coalesce(p.title, cli.product_title, cli.title) as product_title,
          coalesce(p.handle, cli.product_handle) as handle,
          coalesce(pv.title, cli.variant_title) as variant_title,
          coalesce(pv.sku, cli.variant_sku) as sku
        from cart_line_item cli
        left join product p on p.id = cli.product_id
        left join product_variant pv on pv.id = cli.variant_id
        where cli.cart_id = $1
          and cli.deleted_at is null
        order by cli.created_at asc
      `,
      [session.cart_id]
    )

    console.log("[recover-razorpay-order] cart", {
      cart_id: session.cart_id,
      email: cartEmail,
      customer_id: session.customer_id,
      session_amount: session.amount,
      currency_code: session.currency_code,
      payment_session_id: session.payment_session_id,
      payment_collection_id: session.payment_collection_id,
      cart_completed_at: session.cart_completed_at,
    })
    console.log("[recover-razorpay-order] items", items.rows)

    await client.query("begin")

    await client.query(
      `
        update cart
        set
          metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object(
            'recovered_razorpay_cart_id', id,
            'razorpay_manual_recovery', true,
            'razorpay_manual_recovery_at', now(),
            'razorpay_order_id', $2::text,
            'razorpay_payment_id', $3::text
          ),
          updated_at = now()
        where id = $1
      `,
      [session.cart_id, razorpayOrderId, razorpayPaymentId]
    )

    await markRazorpayPaymentReady(client, session, razorpayOrderId, razorpayPaymentId)

    await client.query("commit")

    const publishableKey = await getPublishableKey(client)
    await ensureShippingMethod(client, session.cart_id, publishableKey)
    await markRazorpayPaymentReady(client, session, razorpayOrderId, razorpayPaymentId)

    const existingOrderResult = await client.query(
      `
        select oc.order_id
        from order_cart oc
        where oc.cart_id = $1
          and oc.deleted_at is null
        order by oc.created_at desc
        limit 1
      `,
      [session.cart_id]
    )
    let completeResponse = ""
    if (!session.cart_completed_at && !existingOrderResult.rows[0]?.order_id) {
      completeResponse = await completeCart(session.cart_id, publishableKey)
      console.log("[recover-razorpay-order] complete response", completeResponse)
    } else {
      console.log("[recover-razorpay-order] cart already completed")
    }

    const orderResult = await client.query(
      `
        select o.id, o.display_id, o.email, o.currency_code, o.created_at
        from order_cart oc
        join "order" o on o.id = oc.order_id
        where oc.cart_id = $1
          and oc.deleted_at is null
          and o.deleted_at is null
        order by o.created_at desc
        limit 1
      `,
      [session.cart_id]
    )
    const order = orderResult.rows[0]
    console.log("[recover-razorpay-order] order", order || null)

    if (!order) {
      throw new Error(`Cart ${session.cart_id} completed but no order_cart link found`)
    }

    await client.query("begin")

    const paymentResult = await client.query(
      `
        update payment
        set
          captured_at = coalesce(captured_at, now()),
          data = coalesce(data, '{}'::jsonb) || jsonb_build_object(
            'razorpay_status', 'captured',
            'razorpay_payment_id', $2::text,
            'captured_payment_verified', true,
            'razorpay_manual_recovery', true
          ),
          updated_at = now()
        where payment_session_id = $1
          and deleted_at is null
        returning id, amount, raw_amount
      `,
      [session.payment_session_id, razorpayPaymentId]
    )
    const payment = paymentResult.rows[0]

    if (payment) {
      const captureId = `cap_${crypto
        .createHash("sha1")
        .update(`${payment.id}:${razorpayPaymentId}`)
        .digest("hex")
        .slice(0, 26)}`

      await client.query(
        `
          insert into capture (
            id, amount, raw_amount, payment_id, metadata, created_at, updated_at
          )
          select
            $1::text,
            $2::numeric,
            $3::jsonb,
            $4::text,
            jsonb_build_object(
              'source', 'razorpay_manual_recovery',
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
        [captureId, payment.amount, payment.raw_amount, payment.id, razorpayPaymentId]
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
      [session.payment_collection_id]
    )

    await client.query("commit")
    console.log("[recover-razorpay-order] done")
  } catch (error) {
    await client.query("rollback").catch(() => undefined)
    console.error("[recover-razorpay-order] failed", error)
    process.exitCode = 1
  } finally {
    await client.end().catch(() => undefined)
  }
}

main()
