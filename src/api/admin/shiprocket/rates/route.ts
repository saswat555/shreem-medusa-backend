import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import {
  getCheapestShiprocketRate,
  getShiprocketConfigStatus,
  isShiprocketApiError,
  shiprocketFetch,
} from "../../../../lib/shiprocket/client"

const positiveNumber = (value: any, fallback: number) => {
  const n = Number(value)
  return Number.isFinite(n) && n > 0 ? n : fallback
}

const cleanPostcode = (value: any) => String(value || "").trim()

const isValidIndianPostcode = (value: string) => /^\d{6}$/.test(value)

const appendOptionalNumber = (
  params: URLSearchParams,
  key: string,
  value: any
) => {
  const n = Number(value)
  if (Number.isFinite(n) && n > 0) {
    params.set(key, String(n))
  }
}

export const POST = async (req: MedusaRequest, res: MedusaResponse) => {
  try {
    const body = req.body as any

    const pickupPostcode = cleanPostcode(
      body.pickup_postcode || process.env.SHIPROCKET_PICKUP_POSTCODE
    )

    const deliveryPostcode = cleanPostcode(
      body.delivery_postcode || body.postal_code || body.pincode
    )

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

    if (!isValidIndianPostcode(pickupPostcode)) {
      return res.status(400).json({
        ok: false,
        error: "pickup_postcode must be a 6 digit Indian pincode",
        config: getShiprocketConfigStatus(),
      })
    }

    if (!isValidIndianPostcode(deliveryPostcode)) {
      return res.status(400).json({
        ok: false,
        error: "delivery_postcode must be a 6 digit Indian pincode",
      })
    }

    const weight = positiveNumber(
      body.weight,
      Number(process.env.SHIPROCKET_DEFAULT_WEIGHT_KG || 0.5)
    )

    const cod = body.cod ? 1 : 0

    const params = new URLSearchParams({
      pickup_postcode: String(pickupPostcode),
      delivery_postcode: String(deliveryPostcode),
      weight: String(weight),
      cod: String(cod),
    })

    appendOptionalNumber(params, "length", body.length || body.length_cm)
    appendOptionalNumber(params, "breadth", body.breadth || body.breadth_cm)
    appendOptionalNumber(params, "height", body.height || body.height_cm)
    appendOptionalNumber(params, "declared_value", body.declared_value)
    if (body.mode === "Surface" || body.mode === "Air") {
      params.set("mode", body.mode)
    }

    const data = await shiprocketFetch(
      `/courier/serviceability/?${params.toString()}`,
      { method: "GET" }
    )

    const cheapest = getCheapestShiprocketRate(data)

    if (!cheapest) {
      return res.json({
        ok: false,
        available: false,
        input: {
          pickup_postcode: pickupPostcode,
          delivery_postcode: deliveryPostcode,
          weight,
          cod,
        },
        message: "No Shiprocket courier available for this lane/pincode.",
        shiprocket: data,
      })
    }

    return res.json({
      ok: true,
      available: true,
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
    const status = isShiprocketApiError(e) ? e.status : 500
    const response = {
      ok: false,
      error: e.message || "Shiprocket rate lookup failed",
      shiprocket_status: isShiprocketApiError(e) ? e.status : undefined,
      shiprocket_error: isShiprocketApiError(e) ? e.data : undefined,
      shiprocket_path: isShiprocketApiError(e) ? e.path : undefined,
      config: getShiprocketConfigStatus(),
    }

    console.error("Shiprocket admin rate lookup failed", response)

    return res.status(status).json(response)
  }
}
