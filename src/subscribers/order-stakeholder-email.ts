import type { SubscriberArgs, SubscriberConfig } from "@medusajs/framework"

import { getMailSettings } from "../lib/admin-mail-settings"
import {
  buildStakeholderOrderEmail,
  sendShreemEmail,
} from "../lib/email/shreem-mail"

type OrderEvent = {
  id?: string
  order_id?: string
}

const getOrderId = (data: OrderEvent) => data.id || data.order_id || ""

const getSiteUrl = () =>
  String(process.env.SHREEM_SITE_URL || "https://shreemfarms.in").replace(
    /\/+$/,
    ""
  )

const getAdminUrl = () =>
  String(
    process.env.MEDUSA_ADMIN_URL ||
      process.env.MEDUSA_BACKEND_URL ||
      "https://shreemfarms.in"
  ).replace(/\/+$/, "")

export default async function orderStakeholderEmailHandler({
  event,
  container,
}: SubscriberArgs<OrderEvent>) {
  const orderId = getOrderId(event.data)

  if (!orderId) {
    return
  }

  try {
    const settings = await getMailSettings()

    if (settings.order_stakeholder_enabled === false) {
      return
    }

    const recipients = settings.order_stakeholder_recipients || []

    if (!recipients.length) {
      console.warn("[order-stakeholder-email] no recipients configured", {
        order_id: orderId,
      })
      return
    }

    const query = container.resolve("query") as any
    const { data } = await query.graph({
      entity: "order",
      fields: [
        "id",
        "display_id",
        "email",
        "currency_code",
        "total",
        "created_at",
        "items.title",
        "items.product_title",
        "items.quantity",
        "shipping_address.first_name",
        "shipping_address.last_name",
        "shipping_address.address_1",
        "shipping_address.address_2",
        "shipping_address.city",
        "shipping_address.province",
        "shipping_address.postal_code",
        "shipping_address.country_code",
        "shipping_address.phone",
      ],
      filters: { id: orderId },
    })
    const order = data?.[0]

    if (!order) {
      console.warn("[order-stakeholder-email] order not found", {
        order_id: orderId,
      })
      return
    }

    const displayId = order.display_id ? String(order.display_id) : order.id
    const adminOrderUrl = `${getAdminUrl()}/app/orders/${order.id}`
    const storefrontOrderUrl = `${getSiteUrl()}/in/order/${order.id}/confirmed`
    const email = buildStakeholderOrderEmail({
      order,
      adminOrderUrl,
      storefrontOrderUrl,
    })

    await Promise.allSettled(
      recipients.map((to) =>
        sendShreemEmail({
          to,
          subject: email.subject,
          text: email.text,
          html: email.html,
        })
      )
    ).then((results) => {
      const failed = results.filter((result) => result.status === "rejected")

      if (failed.length) {
        console.warn("[order-stakeholder-email] some emails failed", {
          order_id: order.id,
          display_id: displayId,
          failed: failed.length,
          recipients,
        })
      }
    })
  } catch (error) {
    console.error("[order-stakeholder-email] failed safely", {
      order_id: orderId,
      error,
    })
  }
}

export const config: SubscriberConfig = {
  event: "order.placed",
}
