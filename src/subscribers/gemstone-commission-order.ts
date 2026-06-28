import type { SubscriberArgs, SubscriberConfig } from "@medusajs/framework"

import { recordGemstoneCommissionForOrder } from "../lib/gemstone-marketplace"

type OrderEvent = {
  id?: string
  order_id?: string
}

const getOrderId = (data: OrderEvent) => data.id || data.order_id || ""

export default async function gemstoneCommissionOrderHandler({
  event,
  container,
}: SubscriberArgs<OrderEvent>) {
  const orderId = getOrderId(event.data)

  if (!orderId) {
    return
  }

  try {
    const query = container.resolve("query") as any
    const { data } = await query.graph({
      entity: "order",
      fields: [
        "id",
        "display_id",
        "email",
        "currency_code",
        "total",
        "items.id",
        "items.title",
        "items.product_title",
        "items.quantity",
        "items.unit_price",
        "items.subtotal",
        "items.total",
        "items.variant_id",
        "items.variant.id",
        "items.metadata",
      ],
      filters: { id: orderId },
    })
    const order = data?.[0]

    if (!order) {
      return
    }

    const recorded = await recordGemstoneCommissionForOrder({ order })

    if (recorded.length) {
      console.log("[gemstone-commission] recorded vendor commission", {
        order_id: order.id,
        count: recorded.length,
      })
    }
  } catch (error: any) {
    console.error("[gemstone-commission] failed safely", {
      order_id: orderId,
      message: error?.message || String(error),
    })
  }
}

export const config: SubscriberConfig = {
  event: "order.placed",
}
