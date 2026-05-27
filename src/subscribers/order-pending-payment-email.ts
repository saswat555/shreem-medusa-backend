import type { SubscriberArgs, SubscriberConfig } from "@medusajs/framework"

import { sendOrderLifecycleEmail } from "../lib/shiprocket/order-booking"

type OrderEvent = {
  id?: string
  order_id?: string
}

const getOrderId = (data: OrderEvent) => data.id || data.order_id || ""

export default async function orderPendingPaymentEmailHandler({
  event,
  container,
}: SubscriberArgs<OrderEvent>) {
  const orderId = getOrderId(event.data)

  if (!orderId) {
    return
  }

  const query = container.resolve("query") as any
  const { data } = await query.graph({
    entity: "order",
    fields: ["id", "display_id", "email", "metadata"],
    filters: { id: orderId },
  })
  const order = data?.[0]

  if (!order?.email || order?.metadata?.pending_payment_email_sent_at) {
    return
  }

  await sendOrderLifecycleEmail({
    order,
    type: "pending_payment",
  }).catch((error) => console.error("Pending payment order email failed", error))
}

export const config: SubscriberConfig = {
  event: "order.placed",
}
