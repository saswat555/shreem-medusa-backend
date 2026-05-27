import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"

import {
  markShiprocketOrderShipped,
  serializeShiprocketError,
} from "../../../lib/shiprocket/order-booking"

const clean = (value: unknown) => String(value || "").trim()

const getOrderIdFromPayload = (payload: any) => {
  const candidates = [
    payload?.order_id,
    payload?.channel_order_id,
    payload?.shipment?.order_id,
    payload?.data?.order_id,
    payload?.data?.channel_order_id,
  ].map(clean)

  const value = candidates.find(Boolean) || ""

  return value.startsWith("SHREEM-") ? value.replace(/^SHREEM-/, "") : value
}

const isShippedStatus = (payload: any) => {
  const status = [
    payload?.current_status,
    payload?.shipment_status,
    payload?.status,
    payload?.data?.current_status,
    payload?.data?.shipment_status,
    payload?.data?.status,
  ]
    .map((value) => clean(value).toLowerCase())
    .join(" ")

  return /\b(shipped|in transit|picked up|pickup generated)\b/.test(status)
}

export const POST = async (req: MedusaRequest, res: MedusaResponse) => {
  const secret = process.env.SHIPROCKET_WEBHOOK_SECRET?.trim()
  const headerSecret = clean(
    req.headers["x-shiprocket-secret"] || req.headers["x-webhook-secret"]
  )

  if (secret && headerSecret !== secret) {
    return res.status(401).json({ ok: false, message: "Invalid webhook secret." })
  }

  const payload = (req.body || {}) as any

  if (!isShippedStatus(payload)) {
    return res.json({ ok: true, ignored: true, message: "Status is not shipped." })
  }

  const orderId = getOrderIdFromPayload(payload)

  if (!orderId) {
    return res.status(400).json({ ok: false, message: "Order id missing." })
  }

  try {
    const result = await markShiprocketOrderShipped(req.scope, orderId, payload)

    return res.json({ ok: true, shiprocket: result.shiprocket })
  } catch (error) {
    const serialized = serializeShiprocketError(error)

    return res.status(Number((serialized as any).status || 500)).json({
      ok: false,
      message: serialized.message || "Shiprocket webhook failed.",
      error: serialized,
    })
  }
}
