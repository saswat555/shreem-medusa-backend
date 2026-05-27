import type { MedusaContainer } from "@medusajs/framework/types"
import { Modules } from "@medusajs/framework/utils"

import {
  buildOrderStatusEmail,
  sendShreemEmail,
} from "../email/shreem-mail"
import {
  getCheapestShiprocketRate,
  isShiprocketApiError,
  shiprocketFetch,
} from "./client"

type BookingOptions = {
  force?: boolean
  source?: string
  notifyCustomer?: boolean
}

type PackageDetails = {
  weight: number
  length: number
  breadth: number
  height: number
}

const clean = (value: unknown, fallback = "") =>
  String(value || fallback).trim()

const positiveNumber = (value: unknown, fallback = 0) => {
  const parsed = Number(value)

  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback
}

const moneyMajor = (value: unknown) => {
  const parsed = Number(value)

  if (!Number.isFinite(parsed)) {
    return 0
  }

  return Number((parsed / 100).toFixed(2))
}

const medusaWeightToKg = (value: unknown) => {
  const parsed = positiveNumber(value)

  if (!parsed) {
    return 0
  }

  return parsed > 50 ? parsed / 1000 : parsed
}

const readMetadataNumber = (metadata: any, keys: string[]) => {
  for (const key of keys) {
    const parsed = positiveNumber(metadata?.[key])

    if (parsed) {
      return parsed
    }
  }

  return 0
}

const getVariantOrProductWeight = (line: any, fallback: number) =>
  positiveNumber(line?.variant?.metadata?.weight_kg) ||
  positiveNumber(line?.variant?.metadata?.package_weight_kg) ||
  positiveNumber(line?.product?.metadata?.weight_kg) ||
  positiveNumber(line?.product?.metadata?.package_weight_kg) ||
  medusaWeightToKg(line?.variant?.weight) ||
  medusaWeightToKg(line?.product?.weight) ||
  fallback

const getVariantOrProductDimensions = (line: any) => {
  const variantMetadata = line?.variant?.metadata || {}
  const productMetadata = line?.product?.metadata || {}

  return {
    length:
      readMetadataNumber(variantMetadata, ["length_cm", "package_length_cm"]) ||
      readMetadataNumber(productMetadata, ["length_cm", "package_length_cm"]) ||
      positiveNumber(line?.variant?.length) ||
      positiveNumber(line?.product?.length),
    breadth:
      readMetadataNumber(variantMetadata, [
        "breadth_cm",
        "width_cm",
        "package_breadth_cm",
        "package_width_cm",
      ]) ||
      readMetadataNumber(productMetadata, [
        "breadth_cm",
        "width_cm",
        "package_breadth_cm",
        "package_width_cm",
      ]) ||
      positiveNumber(line?.variant?.width) ||
      positiveNumber(line?.product?.width),
    height:
      readMetadataNumber(variantMetadata, ["height_cm", "package_height_cm"]) ||
      readMetadataNumber(productMetadata, ["height_cm", "package_height_cm"]) ||
      positiveNumber(line?.variant?.height) ||
      positiveNumber(line?.product?.height),
  }
}

const getShippingMethodData = (order: any) => {
  const methods = Array.isArray(order?.shipping_methods)
    ? order.shipping_methods
    : []

  return (
    methods.find((method: any) => method?.data?.provider === "shiprocket")
      ?.data || methods.find((method: any) => method?.data?.courier)?.data || {}
  )
}

const getPackageDetails = (order: any): PackageDetails => {
  const shippingData = getShippingMethodData(order)
  const fallbackWeight = positiveNumber(
    process.env.SHIPROCKET_DEFAULT_WEIGHT_KG,
    0.5
  )
  const fallbackLength = positiveNumber(
    process.env.SHIPROCKET_DEFAULT_LENGTH_CM,
    10
  )
  const fallbackBreadth = positiveNumber(
    process.env.SHIPROCKET_DEFAULT_BREADTH_CM,
    10
  )
  const fallbackHeight = positiveNumber(
    process.env.SHIPROCKET_DEFAULT_HEIGHT_CM,
    5
  )
  const items = Array.isArray(order?.items) ? order.items : []
  const calculated = items.reduce(
    (acc: PackageDetails, line: any) => {
      const quantity = Math.max(1, Number(line?.quantity || 1))
      const dims = getVariantOrProductDimensions(line)
      const weight = getVariantOrProductWeight(line, fallbackWeight)

      return {
        weight: acc.weight + weight * quantity,
        length: Math.max(acc.length, dims.length),
        breadth: Math.max(acc.breadth, dims.breadth),
        height: acc.height + dims.height * quantity,
      }
    },
    { weight: 0, length: 0, breadth: 0, height: 0 }
  )

  return {
    weight: positiveNumber(shippingData.weight_kg, calculated.weight || fallbackWeight),
    length: positiveNumber(shippingData.length_cm, calculated.length || fallbackLength),
    breadth: positiveNumber(
      shippingData.breadth_cm,
      calculated.breadth || fallbackBreadth
    ),
    height: positiveNumber(shippingData.height_cm, calculated.height || fallbackHeight),
  }
}

const isDigitalLine = (line: any) => {
  const metadata = {
    ...(line?.product?.metadata || {}),
    ...(line?.variant?.metadata || {}),
    ...(line?.metadata || {}),
  }

  return (
    metadata.digital_product === true ||
    metadata.digital_product === "true" ||
    metadata.fulfillment_type === "digital" ||
    metadata.ai_credits ||
    metadata.ai_plan
  )
}

const isPhysicalOrder = (order: any) =>
  (order?.items || []).some((line: any) => !isDigitalLine(line))

const orderUrl = (orderId: string) => {
  const siteUrl = (process.env.SHREEM_SITE_URL || "https://www.shreemfarms.in")
    .trim()
    .replace(/\/+$/, "")

  return `${siteUrl}/account/orders/details/${encodeURIComponent(orderId)}`
}

export const sendOrderLifecycleEmail = async ({
  order,
  type,
  extra = "",
}: {
  order: any
  type: "pending_payment" | "payment_confirmed" | "shiprocket_booked" | "shipped"
  extra?: string
}) => {
  const email = clean(order?.email).toLowerCase()

  if (!email) {
    return false
  }

  const displayId = order?.display_id ? `#${order.display_id}` : order?.id
  const url = orderUrl(order?.id)
  const content = {
    pending_payment: {
      subject: `Order ${displayId} received - payment pending`,
      title: "Order received",
      intro:
        `We have received your Shreem Farms order ${displayId}. Payment is currently pending or waiting for manual verification. We will process it after the payment is confirmed.`,
      note: "If you paid by manual UPI, please keep your bank/UPI reference handy until the team verifies the credit.",
    },
    payment_confirmed: {
      subject: `Payment confirmed for Shreem order ${displayId}`,
      title: "Payment confirmed",
      intro:
        `Your payment for Shreem Farms order ${displayId} has been confirmed. We are preparing the order now.${extra ? ` ${extra}` : ""}`,
      note: "You will receive another update once the courier pickup is booked.",
    },
    shiprocket_booked: {
      subject: `Courier booked for Shreem order ${displayId}`,
      title: "Courier booked",
      intro:
        `Shiprocket courier has been booked for order ${displayId}.${extra ? ` ${extra}` : ""}`,
      note: "Tracking details may take a short while to become active after pickup/manifest generation.",
    },
    shipped: {
      subject: `Shreem order ${displayId} is shipped`,
      title: "Order shipped",
      intro:
        `Your Shreem Farms order ${displayId} has been shipped.${extra ? ` ${extra}` : ""}`,
      note: "Please keep your phone available for courier delivery updates.",
    },
  }[type]
  const body = buildOrderStatusEmail({
    title: content.title,
    intro: content.intro,
    orderUrl: url,
    note: content.note,
  })

  await sendShreemEmail({
    to: email,
    subject: content.subject,
    ...body,
  })

  return true
}

export const fetchOrderForShiprocket = async (
  container: MedusaContainer,
  orderId: string
) => {
  const query = container.resolve("query") as any
  const { data } = await query.graph({
    entity: "order",
    fields: [
      "id",
      "display_id",
      "created_at",
      "email",
      "currency_code",
      "subtotal",
      "total",
      "shipping_total",
      "metadata",
      "shipping_address.*",
      "billing_address.*",
      "items.id",
      "items.title",
      "items.quantity",
      "items.unit_price",
      "items.subtotal",
      "items.total",
      "items.metadata",
      "items.product.title",
      "items.product.handle",
      "items.product.weight",
      "items.product.length",
      "items.product.width",
      "items.product.height",
      "items.product.metadata",
      "items.variant.title",
      "items.variant.id",
      "items.variant.sku",
      "items.variant.weight",
      "items.variant.length",
      "items.variant.width",
      "items.variant.height",
      "items.variant.metadata",
      "shipping_methods.id",
      "shipping_methods.name",
      "shipping_methods.amount",
      "shipping_methods.data",
      "payment_collections.payments.id",
      "payment_collections.payments.amount",
      "payment_collections.payments.provider_id",
      "payment_collections.payments.captured_at",
    ],
    filters: { id: orderId },
  })

  return data?.[0] || null
}

export const hasCapturedPayment = (order: any) => {
  const collections = Array.isArray(order?.payment_collections)
    ? order.payment_collections
    : []
  const payments = collections.flatMap((collection: any) =>
    Array.isArray(collection?.payments) ? collection.payments : []
  )

  return payments.some((payment: any) => Boolean(payment?.captured_at))
}

const getCustomerName = (address: any, email = "") => {
  const firstName = clean(address?.first_name) || clean(email.split("@")[0], "Customer")
  const lastName = clean(address?.last_name) || "."

  return { firstName, lastName }
}

const cleanPhone = (value: unknown) => clean(value).replace(/\D/g, "").slice(-10)

const getSelectedCourier = async (order: any, pkg: PackageDetails) => {
  const shippingData = getShippingMethodData(order)
  const courier = shippingData.courier

  if (courier?.courier_company_id) {
    return courier
  }

  const address = order?.shipping_address || order?.billing_address || {}
  const pickupPostcode = clean(process.env.SHIPROCKET_PICKUP_POSTCODE, "486001")
  const deliveryPostcode = clean(address?.postal_code)
  const params = new URLSearchParams({
    pickup_postcode: pickupPostcode,
    delivery_postcode: deliveryPostcode,
    weight: String(pkg.weight),
    cod: "0",
    length: String(pkg.length),
    breadth: String(pkg.breadth),
    height: String(pkg.height),
  })
  const rates = await shiprocketFetch(`/courier/serviceability/?${params.toString()}`, {
    method: "GET",
  })

  return getCheapestShiprocketRate(rates)
}

const compactShiprocketResponse = (data: any) => ({
  order_id: data?.order_id || data?.data?.order_id || data?.id || null,
  shipment_id: data?.shipment_id || data?.data?.shipment_id || data?.shipment?.id || null,
  awb_code:
    data?.awb_code ||
    data?.response?.data?.awb_code ||
    data?.data?.awb_code ||
    data?.awb_assign_status ||
    null,
  label_url:
    data?.label_url || data?.label || data?.data?.label_url || data?.label_created || null,
  invoice_url:
    data?.invoice_url || data?.invoice || data?.data?.invoice_url || data?.is_invoice_created || null,
  raw_status: data?.status || data?.status_code || null,
})

const firstValue = (...values: unknown[]) =>
  values.map((value) => clean(value)).find(Boolean) || ""

const getPackageQuotes = (order: any) => {
  const data = getShippingMethodData(order)

  return Array.isArray(data?.package_quotes) ? data.package_quotes : []
}

const selectedOptionProvider = (quote: any) =>
  clean(
    quote?.selected_option?.provider ||
      quote?.selected_option?.source ||
      quote?.cheapest?.provider ||
      quote?.carrier
  ).toLowerCase()

const getShiprocketPackageQuotes = (order: any) =>
  getPackageQuotes(order).filter((quote: any) =>
    selectedOptionProvider(quote).includes("shiprocket") || quote?.carrier === "shiprocket"
  )

const getIndiaPostPackageQuotes = (order: any) =>
  getPackageQuotes(order).filter((quote: any) =>
    selectedOptionProvider(quote).includes("india") || quote?.carrier === "india_post"
  )

const lineBelongsToQuote = (line: any, quote: any) => {
  const packageLines = Array.isArray(quote?.line_items) ? quote.line_items : []

  if (!packageLines.length) {
    return true
  }

  return packageLines.some((item: any) => {
    const variantId = clean(item?.variant_id)
    const lineId = clean(item?.line_id)
    const title = clean(item?.title).toLowerCase()

    return (
      (variantId && variantId === clean(line?.variant?.id || line?.variant_id)) ||
      (lineId && lineId === clean(line?.id)) ||
      (title && title === clean(line?.title || line?.product?.title).toLowerCase())
    )
  })
}

const filterOrderForQuotes = (order: any, quotes: any[]) => {
  if (!quotes.length) {
    return order
  }

  return {
    ...order,
    items: (order?.items || []).filter((line: any) =>
      quotes.some((quote) => lineBelongsToQuote(line, quote))
    ),
  }
}

const packageFromQuotes = (quotes: any[]): PackageDetails | null => {
  if (!quotes.length) {
    return null
  }

  return quotes.reduce(
    (acc: PackageDetails, quote: any) => ({
      weight: acc.weight + positiveNumber(quote?.weight),
      length: Math.max(acc.length, positiveNumber(quote?.length)),
      breadth: Math.max(acc.breadth, positiveNumber(quote?.breadth)),
      height: acc.height + positiveNumber(quote?.height),
    }),
    { weight: 0, length: 0, breadth: 0, height: 0 }
  )
}

const buildShiprocketOrderPayload = async (
  order: any,
  selectedQuotes: any[] = []
) => {
  const pickupLocation = clean(
    process.env.SHIPROCKET_PICKUP_LOCATION ||
      process.env.SHIPROCKET_PICKUP_LOCATION_NAME
  )

  if (!pickupLocation) {
    throw new Error(
      "SHIPROCKET_PICKUP_LOCATION is required. Use the exact pickup location name from Shiprocket."
    )
  }

  const address = order?.shipping_address || order?.billing_address || {}
  const billing = order?.billing_address || address
  const phone = cleanPhone(address?.phone || billing?.phone)

  if (!phone || phone.length < 10) {
    throw new Error("Customer phone number is required before booking Shiprocket.")
  }

  const email = clean(order?.email, "support@shreemfarms.in")
  const { firstName, lastName } = getCustomerName(address, email)
  const quoteOrder = filterOrderForQuotes(order, selectedQuotes)
  const pkg = packageFromQuotes(selectedQuotes) || getPackageDetails(quoteOrder)
  const courier =
    selectedQuotes.find((quote) => quote?.selected_option?.courier_company_id)
      ?.selected_option || (await getSelectedCourier(quoteOrder, pkg))
  const orderDate = order?.created_at
    ? new Date(order.created_at).toISOString().slice(0, 19).replace("T", " ")
    : new Date().toISOString().slice(0, 19).replace("T", " ")
  const subtotal = moneyMajor(order?.subtotal || order?.total)

  const orderItems = (quoteOrder?.items || [])
    .filter((line: any) => !isDigitalLine(line))
    .map((line: any) => {
      const quantity = Math.max(1, Number(line?.quantity || 1))
      const unitPrice =
        moneyMajor(line?.unit_price) ||
        Number((moneyMajor(line?.subtotal || line?.total) / quantity).toFixed(2)) ||
        1

      return {
        name: clean(line?.title || line?.product?.title || line?.variant?.title, "Shreem product"),
        sku: clean(line?.variant?.sku || line?.id, "shreem-item"),
        units: quantity,
        selling_price: unitPrice,
        discount: "0",
        tax: "0",
        hsn: clean(line?.metadata?.hsn || line?.product?.metadata?.hsn || ""),
      }
    })

  const payload: any = {
    // Keep Medusa's order id as Shiprocket's channel order id so webhooks can
    // safely map shipment updates back to the exact order.
    order_id: order.id,
    order_date: orderDate,
    pickup_location: pickupLocation,
    channel_id: process.env.SHIPROCKET_CHANNEL_ID || undefined,
    billing_customer_name: firstName,
    billing_last_name: lastName,
    billing_address: firstValue(billing?.address_1, address?.address_1),
    billing_address_2: firstValue(billing?.address_2, address?.address_2),
    billing_city: firstValue(billing?.city, address?.city),
    billing_pincode: firstValue(billing?.postal_code, address?.postal_code),
    billing_state: firstValue(billing?.province, address?.province, "Madhya Pradesh"),
    billing_country: "India",
    billing_email: email,
    billing_phone: phone,
    shipping_is_billing: false,
    shipping_customer_name: firstName,
    shipping_last_name: lastName,
    shipping_address: firstValue(address?.address_1, billing?.address_1),
    shipping_address_2: firstValue(address?.address_2, billing?.address_2),
    shipping_city: firstValue(address?.city, billing?.city),
    shipping_pincode: firstValue(address?.postal_code, billing?.postal_code),
    shipping_state: firstValue(address?.province, billing?.province, "Madhya Pradesh"),
    shipping_country: "India",
    shipping_email: email,
    shipping_phone: phone,
    order_items: orderItems,
    payment_method: "Prepaid",
    shipping_charges: moneyMajor(order?.shipping_total),
    giftwrap_charges: 0,
    transaction_charges: 0,
    total_discount: 0,
    sub_total: subtotal,
    length: pkg.length,
    breadth: pkg.breadth,
    height: pkg.height,
    weight: pkg.weight,
  }

  Object.keys(payload).forEach((key) => payload[key] === undefined && delete payload[key])

  return { payload, pkg, courier }
}

export const persistShiprocketMetadata = async (
  container: MedusaContainer,
  order: any,
  shiprocket: Record<string, unknown>
) => {
  const orderService = container.resolve(Modules.ORDER) as any
  const metadata = {
    ...(order?.metadata || {}),
    shiprocket: {
      ...((order?.metadata as any)?.shiprocket || {}),
      ...shiprocket,
      updated_at: new Date().toISOString(),
    },
  }

  await orderService.updateOrders(order.id, {
    id: order.id,
    metadata,
  })

  return metadata.shiprocket
}

export const bookShiprocketForOrder = async (
  container: MedusaContainer,
  orderId: string,
  options: BookingOptions = {}
) => {
  const order = await fetchOrderForShiprocket(container, orderId)

  if (!order) {
    throw new Error("Order not found")
  }

  const existing = (order?.metadata as any)?.shiprocket || {}
  if (existing.booked && !options.force) {
    return {
      ok: true,
      skipped: true,
      message: "Shiprocket is already booked for this order.",
      order,
      shiprocket: existing,
    }
  }

  if (!hasCapturedPayment(order)) {
    throw new Error("Payment must be captured before booking Shiprocket.")
  }

  if (!isPhysicalOrder(order)) {
    const shiprocket = await persistShiprocketMetadata(container, order, {
      booked: false,
      skipped: true,
      status: "digital_order",
      reason: "Order has no physical line items.",
      source: options.source || "shiprocket_booking",
    })

    return { ok: true, skipped: true, order, shiprocket }
  }

  const shiprocketQuotes = getShiprocketPackageQuotes(order)
  const indiaPostQuotes = getIndiaPostPackageQuotes(order)

  if (getPackageQuotes(order).length && !shiprocketQuotes.length) {
    const shiprocket = await persistShiprocketMetadata(container, order, {
      booked: false,
      skipped: true,
      status: "manual_india_post_required",
      source: options.source || "shiprocket_booking",
      reason:
        "Selected shipment is India Post/manual parcel. Book it outside Shiprocket.",
      india_post_packages: indiaPostQuotes,
    })

    return { ok: true, skipped: true, order, shiprocket }
  }

  const { payload, pkg, courier } = await buildShiprocketOrderPayload(
    order,
    shiprocketQuotes
  )
  const created = await shiprocketFetch("/orders/create/adhoc", {
    method: "POST",
    body: JSON.stringify(payload),
  })
  const createdCompact = compactShiprocketResponse(created)
  const shipmentId = clean(createdCompact.shipment_id)
  const shiprocketOrderId = clean(createdCompact.order_id)
  let awb: any = null
  let pickup: any = null
  let label: any = null
  let invoice: any = null
  const courierId = positiveNumber(courier?.courier_company_id)

  if (shipmentId && courierId && process.env.SHIPROCKET_AUTO_ASSIGN_AWB !== "false") {
    awb = await shiprocketFetch("/courier/assign/awb", {
      method: "POST",
      body: JSON.stringify({
        shipment_id: shipmentId,
        courier_id: courierId,
      }),
    }).catch((error) => ({ error: serializeShiprocketError(error) }))
  }

  if (shipmentId && process.env.SHIPROCKET_AUTO_PICKUP !== "false") {
    pickup = await shiprocketFetch("/courier/generate/pickup", {
      method: "POST",
      body: JSON.stringify({ shipment_id: [shipmentId] }),
    }).catch((error) => ({ error: serializeShiprocketError(error) }))
  }

  if (shipmentId && process.env.SHIPROCKET_AUTO_LABEL !== "false") {
    label = await shiprocketFetch("/courier/generate/label", {
      method: "POST",
      body: JSON.stringify({ shipment_id: [shipmentId] }),
    }).catch((error) => ({ error: serializeShiprocketError(error) }))
  }

  if (shiprocketOrderId && process.env.SHIPROCKET_AUTO_INVOICE !== "false") {
    invoice = await shiprocketFetch("/orders/print/invoice", {
      method: "POST",
      body: JSON.stringify({ ids: [shiprocketOrderId] }),
    }).catch((error) => ({ error: serializeShiprocketError(error) }))
  }

  const awbCompact = compactShiprocketResponse(awb)
  const labelCompact = compactShiprocketResponse(label)
  const invoiceCompact = compactShiprocketResponse(invoice)
  const shiprocket = await persistShiprocketMetadata(container, order, {
    booked: true,
    status: "booked",
    source: options.source || "shiprocket_booking",
    channel_order_id: payload.order_id,
    shiprocket_order_id: shiprocketOrderId || null,
    shipment_id: shipmentId || null,
    courier: courier
      ? {
          courier_name: courier.courier_name,
          courier_company_id: courier.courier_company_id,
          estimated_delivery_days: courier.estimated_delivery_days,
          etd: courier.etd,
          rate: courier.rate ?? courier.freight_charge,
        }
      : null,
    package: pkg,
    package_quotes: getPackageQuotes(order),
    shiprocket_packages: shiprocketQuotes,
    india_post_packages: indiaPostQuotes,
    awb_code: awbCompact.awb_code || null,
    label_url: labelCompact.label_url || null,
    invoice_url: invoiceCompact.invoice_url || null,
    create_response: createdCompact,
    awb_response: awb ? awbCompact : null,
    pickup_response: pickup ? compactShiprocketResponse(pickup) : null,
    label_response: label ? labelCompact : null,
    invoice_response: invoice ? invoiceCompact : null,
  })

  if (options.notifyCustomer !== false) {
    await sendOrderLifecycleEmail({
      order,
      type: "shiprocket_booked",
      extra: courier?.courier_name
        ? `Courier: ${courier.courier_name}.`
        : "Courier details will be shared soon.",
    }).catch((error) => console.error("Shiprocket booked email failed", error))
  }

  return { ok: true, order, shiprocket, created, awb, pickup, label, invoice }
}

export const markShiprocketOrderShipped = async (
  container: MedusaContainer,
  orderId: string,
  tracking?: Record<string, unknown>
) => {
  const order = await fetchOrderForShiprocket(container, orderId)

  if (!order) {
    throw new Error("Order not found")
  }

  const shiprocket = await persistShiprocketMetadata(container, order, {
    status: "shipped",
    shipped_at: new Date().toISOString(),
    tracking: tracking || {},
  })

  await sendOrderLifecycleEmail({
    order,
    type: "shipped",
    extra: shiprocket?.awb_code ? `AWB: ${shiprocket.awb_code}.` : "",
  }).catch((error) => console.error("Shipped email failed", error))

  return { ok: true, order, shiprocket }
}

export const serializeShiprocketError = (error: unknown) => {
  if (isShiprocketApiError(error)) {
    return {
      message: error.message,
      status: error.status,
      data: error.data,
      path: error.path,
    }
  }

  return {
    message: error instanceof Error ? error.message : String(error),
  }
}
