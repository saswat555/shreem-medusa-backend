import type { SubscriberArgs, SubscriberConfig } from "@medusajs/framework"

type OrderEvent = {
  id?: string
  order_id?: string
}

const getOrderId = (data: OrderEvent) => data.id || data.order_id || ""

export default async function orderPendingPaymentEmailHandler({
  event,
}: SubscriberArgs<OrderEvent>) {
  const orderId = getOrderId(event.data)

  if (!orderId) {
    return
  }

  // Custom external shipping/email integration removed.
  // Keep this subscriber as a safe no-op so order.placed never fails.
  return
}

export const config: SubscriberConfig = {
  event: "order.placed",
}
