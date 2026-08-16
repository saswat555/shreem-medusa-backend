import {
  AuthenticatedMedusaRequest,
  MedusaResponse,
} from "@medusajs/framework/http"

const isAdminRequest = (req: any) => {
  const authContext = req.auth_context || req.authContext || {}

  return (
    authContext.actor_type === "user" ||
    authContext.actorType === "user" ||
    Boolean(authContext.user_id) ||
    Boolean(authContext.userId) ||
    Boolean(authContext.actor_id) ||
    Boolean(authContext.actorId) ||
    Boolean(req.user?.id)
  )
}

const clean = (value: unknown) => String(value || "").trim()
const numberValue = (value: unknown) => {
  const parsed = Number(value || 0)
  return Number.isFinite(parsed) ? parsed : 0
}

const monthRange = (month: string) => {
  const safeMonth = /^\d{4}-\d{2}$/.test(month)
    ? month
    : new Date().toISOString().slice(0, 7)
  const start = new Date(`${safeMonth}-01T00:00:00.000Z`)
  const end = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + 1, 1))

  return {
    month: safeMonth,
    startIso: start.toISOString(),
    endIso: end.toISOString(),
  }
}

const formatAddress = (address: any) =>
  [
    address?.address_1,
    address?.address_2,
    address?.city,
    address?.province,
    address?.postal_code,
    address?.country_code ? String(address.country_code).toUpperCase() : "",
  ]
    .map(clean)
    .filter(Boolean)
    .join(", ")

const isCancelled = (order: any) =>
  /cancel/i.test(
    [order?.status, order?.fulfillment_status, order?.payment_status]
      .map(clean)
      .join(" ")
  ) || Boolean(order?.canceled_at)

const normalizeItem = (order: any, item: any) => {
  const quantity = Math.max(1, numberValue(item?.quantity) || 1)
  const unitPrice = numberValue(item?.unit_price)
  const fallbackSubtotal = unitPrice * quantity
  const subtotal = numberValue(item?.subtotal || item?.raw_subtotal) || fallbackSubtotal
  const discount = numberValue(item?.discount_total || item?.raw_discount_total)
  const tax = numberValue(item?.tax_total || item?.raw_tax_total)
  const total = numberValue(item?.total || item?.raw_total) || Math.max(0, subtotal - discount + tax)

  return {
    order_id: order.id,
    order_number: order.display_id ? `#${order.display_id}` : order.id,
    order_date: order.created_at,
    customer_email: clean(order.email),
    customer_name:
      clean(`${order.shipping_address?.first_name || ""} ${order.shipping_address?.last_name || ""}`) ||
      clean(`${order.billing_address?.first_name || ""} ${order.billing_address?.last_name || ""}`),
    state:
      clean(order.shipping_address?.province) ||
      clean(order.billing_address?.province),
    pincode:
      clean(order.shipping_address?.postal_code) ||
      clean(order.billing_address?.postal_code),
    address: formatAddress(order.shipping_address || order.billing_address),
    product: clean(item?.product_title || item?.title || "Item"),
    variant: clean(item?.variant_title),
    sku: clean(item?.variant_sku || item?.sku),
    hsn: clean(item?.metadata?.hsn || item?.product?.metadata?.hsn),
    quantity,
    unit_price: unitPrice,
    taxable_value: Math.max(0, subtotal - discount),
    discount,
    tax,
    line_total: total,
    currency_code: clean(order.currency_code || "INR").toUpperCase(),
    payment_status: clean(order.payment_status),
    fulfillment_status: clean(order.fulfillment_status || order.status),
  }
}

const normalizeOrder = (order: any) => {
  const items = Array.isArray(order.items)
    ? order.items.map((item: any) => normalizeItem(order, item))
    : []
  const subtotal =
    numberValue(order.subtotal || order.item_subtotal || order.raw_subtotal) ||
    items.reduce((sum: number, item: any) => sum + item.taxable_value + item.discount, 0)
  const discount = numberValue(order.discount_total || order.raw_discount_total)
  const itemTax = items.reduce((sum: number, item: any) => sum + item.tax, 0)
  const tax = numberValue(order.tax_total || order.raw_tax_total) || itemTax
  const shipping = numberValue(order.shipping_total || order.raw_shipping_total)
  const total =
    numberValue(order.total || order.raw_total) ||
    Math.max(0, subtotal - discount + tax + shipping)

  return {
    id: order.id,
    display_id: order.display_id ? String(order.display_id) : "",
    order_number: order.display_id ? `#${order.display_id}` : order.id,
    created_at: order.created_at,
    email: clean(order.email),
    customer_name:
      clean(`${order.shipping_address?.first_name || ""} ${order.shipping_address?.last_name || ""}`) ||
      clean(`${order.billing_address?.first_name || ""} ${order.billing_address?.last_name || ""}`),
    state:
      clean(order.shipping_address?.province) ||
      clean(order.billing_address?.province),
    pincode:
      clean(order.shipping_address?.postal_code) ||
      clean(order.billing_address?.postal_code),
    address: formatAddress(order.shipping_address || order.billing_address),
    currency_code: clean(order.currency_code || "INR").toUpperCase(),
    status: clean(order.status),
    payment_status: clean(order.payment_status),
    fulfillment_status: clean(order.fulfillment_status),
    subtotal,
    discount_total: discount,
    shipping_total: shipping,
    tax_total: tax,
    total,
    taxable_value: Math.max(0, subtotal - discount),
    item_count: items.reduce((sum: number, item: any) => sum + item.quantity, 0),
    items,
  }
}

const loadOrders = async (
  req: AuthenticatedMedusaRequest,
  fields: string[],
  startIso: string,
  endIso: string
) => {
  const query = req.scope.resolve("query") as any
  const { data } = await query.graph({
    entity: "order",
    fields,
    filters: {
      created_at: {
        $gte: startIso,
        $lt: endIso,
      },
    },
    pagination: {
      take: Math.min(Math.max(Number(req.query.limit || 500), 1), 1000),
      skip: Math.max(Number(req.query.offset || 0), 0),
    },
  })

  return Array.isArray(data) ? data : []
}

export const GET = async (
  req: AuthenticatedMedusaRequest,
  res: MedusaResponse
) => {
  res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate")
  res.setHeader("Pragma", "no-cache")
  res.setHeader("Expires", "0")

  if (!isAdminRequest(req)) {
    return res.status(401).json({
      message: "Admin authentication is required.",
      orders: [],
      lines: [],
    })
  }

  const range = monthRange(clean(req.query.month))
  const baseFields = [
    "id",
    "display_id",
    "email",
    "currency_code",
    "created_at",
    "status",
    "items.title",
    "items.product_title",
    "items.variant_title",
    "items.quantity",
    "items.unit_price",
    "shipping_address.first_name",
    "shipping_address.last_name",
    "shipping_address.address_1",
    "shipping_address.address_2",
    "shipping_address.city",
    "shipping_address.province",
    "shipping_address.postal_code",
    "shipping_address.country_code",
    "billing_address.first_name",
    "billing_address.last_name",
    "billing_address.address_1",
    "billing_address.address_2",
    "billing_address.city",
    "billing_address.province",
    "billing_address.postal_code",
    "billing_address.country_code",
  ]
  const fullFields = [
    ...baseFields,
    "total",
    "subtotal",
    "discount_total",
    "shipping_total",
    "tax_total",
    "payment_status",
    "fulfillment_status",
    "items.total",
    "items.subtotal",
    "items.discount_total",
    "items.tax_total",
    "items.variant_sku",
    "items.metadata",
    "items.product.metadata",
  ]

  let rawOrders: any[] = []
  let fieldsComplete = true

  try {
    rawOrders = await loadOrders(req, fullFields, range.startIso, range.endIso)
  } catch {
    fieldsComplete = false
    rawOrders = await loadOrders(req, baseFields, range.startIso, range.endIso)
  }

  const orders = rawOrders
    .filter((order) => !isCancelled(order))
    .map(normalizeOrder)
    .sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime())
  const lines = orders.flatMap((order) => order.items)
  const summary = orders.reduce(
    (totals, order) => ({
      orders: totals.orders + 1,
      items: totals.items + order.item_count,
      subtotal: totals.subtotal + order.subtotal,
      discount_total: totals.discount_total + order.discount_total,
      shipping_total: totals.shipping_total + order.shipping_total,
      taxable_value: totals.taxable_value + order.taxable_value,
      tax_total: totals.tax_total + order.tax_total,
      total: totals.total + order.total,
    }),
    {
      orders: 0,
      items: 0,
      subtotal: 0,
      discount_total: 0,
      shipping_total: 0,
      taxable_value: 0,
      tax_total: 0,
      total: 0,
    }
  )

  return res.json({
    range,
    seller: {
      name: process.env.SHREEM_GST_SELLER_NAME || "Braj Savitri Krishi Sansthan",
      trade_name: process.env.SHREEM_GST_TRADE_NAME || "Shreem Farms",
      gstin: process.env.SHREEM_GSTIN || "",
      state: process.env.SHREEM_GST_STATE || "Madhya Pradesh",
    },
    fields_complete: fieldsComplete,
    note: fieldsComplete
      ? ""
      : "Medusa did not expose detailed tax/total fields in this query. CSV still includes order/item values that were available.",
    summary,
    orders,
    lines,
  })
}
