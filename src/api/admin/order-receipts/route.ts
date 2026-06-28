import {
  AuthenticatedMedusaRequest,
  MedusaResponse,
} from "@medusajs/framework/http"

const isAdminRequest = (req: AuthenticatedMedusaRequest) =>
  (req as any).auth_context?.actor_type === "user" &&
  Boolean((req as any).auth_context?.actor_id)

const parsePositiveInt = (value: unknown, fallback: number, max: number) => {
  const parsed = Number(value || fallback)

  if (!Number.isFinite(parsed) || parsed <= 0) {
    return fallback
  }

  return Math.min(Math.trunc(parsed), max)
}

const getFromAddress = () => ({
  name: process.env.SHREEM_SHIPPING_FROM_NAME || "Shreem Farms",
  line1:
    process.env.SHREEM_SHIPPING_FROM_LINE1 ||
    "Braj Savitri Krishi Sansthan",
  line2:
    process.env.SHREEM_SHIPPING_FROM_LINE2 ||
    "Shreem Farms, Rewa, Madhya Pradesh",
  city: process.env.SHREEM_SHIPPING_FROM_CITY || "Rewa",
  province: process.env.SHREEM_SHIPPING_FROM_STATE || "Madhya Pradesh",
  postal_code: process.env.SHREEM_SHIPPING_FROM_PINCODE || "",
  country_code: process.env.SHREEM_SHIPPING_FROM_COUNTRY || "IN",
  phone: process.env.SHREEM_SHIPPING_FROM_PHONE || "",
  email: process.env.SHREEM_SHIPPING_FROM_EMAIL || "support@shreemfarms.in",
})

const clean = (value: unknown) => String(value || "").trim()

const formatAddress = (address: any) => {
  if (!address) {
    return {
      name: "No customer name",
      lines: ["No shipping address found"],
      phone: "",
    }
  }

  const name =
    clean(`${address.first_name || ""} ${address.last_name || ""}`) ||
    clean(address.company) ||
    "Customer"
  const lines = [
    address.address_1,
    address.address_2,
    [address.city, address.province, address.postal_code].filter(Boolean).join(", "),
    address.country_code ? String(address.country_code).toUpperCase() : "",
  ]
    .map(clean)
    .filter(Boolean)

  return {
    name,
    lines: lines.length ? lines : ["No shipping address found"],
    phone: clean(address.phone),
  }
}

const normalizeOrder = (order: any) => {
  const shipping = formatAddress(order.shipping_address)
  const items = Array.isArray(order.items)
    ? order.items.map((item: any) => ({
        title: clean(item.product_title || item.title || "Item"),
        quantity: Number(item.quantity || 1),
        unit_price: Number(item.unit_price || 0),
      }))
    : []
  const totalQuantity = items.reduce((sum: number, item: any) => sum + item.quantity, 0)
  const hasPhysicalShipping =
    Boolean(order.shipping_address?.address_1 || order.shipping_address?.postal_code) &&
    !items.every((item: any) => /jyotish|astrology|credit|consultation|ai/i.test(item.title))
  const fulfillmentStatus = clean(order.fulfillment_status || order.status || "")
  const paymentStatus = clean(order.payment_status || "")
  const pending =
    hasPhysicalShipping &&
    !/fulfilled|shipped|delivered|cancel/i.test(fulfillmentStatus)

  return {
    id: order.id,
    display_id: order.display_id ? String(order.display_id) : "",
    order_label: order.display_id ? `#${order.display_id}` : order.id,
    email: clean(order.email),
    created_at: order.created_at,
    currency_code: clean(order.currency_code || "INR").toUpperCase(),
    total: Number(order.total || 0),
    status: clean(order.status),
    fulfillment_status: fulfillmentStatus,
    payment_status: paymentStatus,
    pending,
    has_physical_shipping: hasPhysicalShipping,
    total_quantity: totalQuantity,
    items,
    ship_to: shipping,
  }
}

const loadOrders = async (
  req: AuthenticatedMedusaRequest,
  fields: string[],
  orderId?: string
) => {
  const query = req.scope.resolve("query") as any
  const { data } = await query.graph({
    entity: "order",
    fields,
    filters: orderId
      ? {
          id: orderId,
        }
      : undefined,
    pagination: {
      take: parsePositiveInt(req.query.limit, 100, 250),
      skip: Math.max(0, Number(req.query.offset || 0) || 0),
    },
  })

  return Array.isArray(data) ? data : []
}

export const GET = async (
  req: AuthenticatedMedusaRequest,
  res: MedusaResponse
) => {
  if (!isAdminRequest(req)) {
    return res.status(401).json({
      message: "Admin authentication is required.",
      orders: [],
    })
  }

  const mode = clean(req.query.mode || "pending")
  const orderId = clean(req.query.order_id)
  const baseFields = [
    "id",
    "display_id",
    "email",
    "currency_code",
    "total",
    "created_at",
    "status",
    "items.title",
    "items.product_title",
    "items.quantity",
    "items.unit_price",
    "shipping_address.first_name",
    "shipping_address.last_name",
    "shipping_address.company",
    "shipping_address.address_1",
    "shipping_address.address_2",
    "shipping_address.city",
    "shipping_address.province",
    "shipping_address.postal_code",
    "shipping_address.country_code",
    "shipping_address.phone",
  ]
  const extendedFields = [
    ...baseFields,
    "fulfillment_status",
    "payment_status",
  ]

  let rawOrders: any[] = []

  try {
    rawOrders = await loadOrders(req, extendedFields, orderId)
  } catch {
    rawOrders = await loadOrders(req, baseFields, orderId)
  }

  const allOrders = rawOrders
    .map(normalizeOrder)
    .sort((a, b) => {
      const aTime = a.created_at ? new Date(a.created_at).getTime() : 0
      const bTime = b.created_at ? new Date(b.created_at).getTime() : 0

      return bTime - aTime
    })
  const orders =
    orderId || mode === "all"
      ? allOrders
      : allOrders.filter((order) => order.pending)

  return res.json({
    from: getFromAddress(),
    orders,
    count: orders.length,
    total_count: allOrders.length,
    mode,
  })
}
