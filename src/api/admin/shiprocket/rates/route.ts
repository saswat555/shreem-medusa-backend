import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { shiprocketFetch, getCheapestShiprocketRate } from "../../../../lib/shiprocket/client"

const positiveNumber = (value: any, fallback: number) => {
  const n = Number(value)
  return Number.isFinite(n) && n > 0 ? n : fallback
}

export const POST = async (req: MedusaRequest, res: MedusaResponse) => {
  try {
    const body = req.body as any

    const pickupPostcode =
      body.pickup_postcode || process.env.SHIPROCKET_PICKUP_POSTCODE

    const deliveryPostcode = body.delivery_postcode

    if (!pickupPostcode) {
      return res.status(400).json({
        ok: false,
        error: "Missing pickup_postcode or SHIPROCKET_PICKUP_POSTCODE",
      })
    }

    if (!deliveryPostcode) {
      return res.status(400).json({
        ok: false,
        error: "delivery_postcode is required",
      })
    }

    const weight = positiveNumber(
      body.weight,
      Number(process.env.SHIPROCKET_DEFAULT_WEIGHT_KG || 1)
    )

    const cod = body.cod ? 1 : 0

    const params = new URLSearchParams({
      pickup_postcode: String(pickupPostcode),
      delivery_postcode: String(deliveryPostcode),
      weight: String(weight),
      cod: String(cod),
    })

    const data = await shiprocketFetch(
      `/courier/serviceability/?${params.toString()}`,
      { method: "GET" }
    )

    const cheapest = getCheapestShiprocketRate(data)

    return res.json({
      ok: true,
      input: {
        pickup_postcode: pickupPostcode,
        delivery_postcode: deliveryPostcode,
        weight,
        cod,
      },
      cheapest,
      shiprocket: data,
    })
  } catch (e: any) {
    return res.status(500).json({
      ok: false,
      error: e.message,
    })
  }
}
