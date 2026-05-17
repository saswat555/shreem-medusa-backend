import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { shiprocketFetch, getCheapestShiprocketRate } from "../../../../lib/shiprocket/client"

const positiveNumber = (value: any, fallback: number) => {
  const n = Number(value)
  return Number.isFinite(n) && n > 0 ? n : fallback
}

export const POST = async (req: MedusaRequest, res: MedusaResponse) => {
  try {
    const body = req.body as any

    const pickupPostcode = process.env.SHIPROCKET_PICKUP_POSTCODE
    const deliveryPostcode = body.delivery_postcode || body.postal_code

    if (!deliveryPostcode) {
      return res.status(400).json({
        ok: false,
        error: "delivery_postcode or postal_code is required",
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

    if (!cheapest) {
      return res.json({
        ok: false,
        available: false,
        message: "No Shiprocket courier available for this pincode",
        shiprocket: data,
      })
    }

    const amount =
      Number(
        cheapest.rate ??
          cheapest.freight_charge ??
          cheapest.estimated_charges ??
          cheapest.total_charge
      ) || 0

    return res.json({
      ok: true,
      available: true,
      provider: "shiprocket",
      pickup_postcode: pickupPostcode,
      delivery_postcode: deliveryPostcode,
      amount,
      amount_paise: Math.round(amount * 100),
      courier: cheapest,
      all_options: data?.data?.available_courier_companies || [],
    })
  } catch (e: any) {
    return res.status(500).json({
      ok: false,
      error: e.message,
    })
  }
}
