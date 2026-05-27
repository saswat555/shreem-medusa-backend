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

const getCourierAmount = (courier: any) =>
  Number(
    courier?.rate ??
      courier?.freight_charge ??
      courier?.estimated_charges ??
      courier?.total_charge ??
      0
  ) || 0

const normalizePackage = (value: any, fallback: any) => ({
  id: String(value?.id || fallback.id || "package"),
  label: String(value?.label || fallback.label || "Shipment parcel"),
  carrier: value?.carrier === "india_post" ? "india_post" : "shiprocket",
  separate: Boolean(value?.separate),
  shipping_class: String(value?.shipping_class || "standard"),
  line_items: Array.isArray(value?.line_items) ? value.line_items : [],
  weight: positiveNumber(value?.weight, fallback.weight),
  length: positiveNumber(value?.length, fallback.length || 0),
  breadth: positiveNumber(value?.breadth, fallback.breadth || 0),
  height: positiveNumber(value?.height, fallback.height || 0),
})

const getIndiaPostParcelOption = (pkg: any) => {
  const weightKg = positiveNumber(pkg.weight, 0.5)
  const slabCount = Math.max(1, Math.ceil(weightKg / 0.5))
  const firstSlab = Number(process.env.INDIA_POST_FIRST_500G_RATE || 36)
  const additionalSlab = Number(process.env.INDIA_POST_ADDITIONAL_500G_RATE || 16)
  const gstPercent = Number(process.env.INDIA_POST_GST_PERCENT || 18)
  const handlingFee = Number(process.env.INDIA_POST_HANDLING_FEE || 0)
  const base = firstSlab + Math.max(0, slabCount - 1) * additionalSlab
  const withGst = base * (1 + gstPercent / 100)
  const rate = Number((withGst + handlingFee).toFixed(2))

  return {
    provider: "india_post",
    option_id: `${pkg.id}:india-post-retail`,
    courier_name: "India Post Parcel (Retail)",
    courier_company_id: 0,
    estimated_delivery_days: process.env.INDIA_POST_ESTIMATED_DAYS || "5-10",
    etd: "Manual post-office booking",
    rate,
    freight_charge: rate,
    source: "configured_india_post_tariff",
    tariff: {
      first_500g: firstSlab,
      additional_500g: additionalSlab,
      gst_percent: gstPercent,
      handling_fee: handlingFee,
      slabs: slabCount,
    },
  }
}

const rateShiprocketPackage = async ({
  pkg,
  pickupPostcode,
  deliveryPostcode,
  cod,
}: {
  pkg: any
  pickupPostcode: string
  deliveryPostcode: string
  cod: number
}) => {
  const params = new URLSearchParams({
    pickup_postcode: String(pickupPostcode),
    delivery_postcode: String(deliveryPostcode),
    weight: String(pkg.weight),
    cod: String(cod),
  })

  appendOptionalNumber(params, "length", pkg.length)
  appendOptionalNumber(params, "breadth", pkg.breadth)
  appendOptionalNumber(params, "height", pkg.height)

  const data = await shiprocketFetch(
    `/courier/serviceability/?${params.toString()}`,
    { method: "GET" }
  )
  const allOptions = Array.isArray(data?.data?.available_courier_companies)
    ? data.data.available_courier_companies
    : []
  const cheapest = getCheapestShiprocketRate(data)

  return { data, allOptions, cheapest }
}

export const POST = async (req: MedusaRequest, res: MedusaResponse) => {
  try {
    const body = req.body as any

    const pickupPostcode = cleanPostcode(process.env.SHIPROCKET_PICKUP_POSTCODE)
    const deliveryPostcode = cleanPostcode(
      body.delivery_postcode || body.postal_code || body.pincode
    )

    if (!pickupPostcode) {
      return res.status(400).json({
        ok: false,
        error: "Missing SHIPROCKET_PICKUP_POSTCODE",
      })
    }

    if (!deliveryPostcode) {
      return res.status(400).json({
        ok: false,
        error: "delivery_postcode or postal_code is required",
      })
    }

    if (!isValidIndianPostcode(pickupPostcode)) {
      return res.status(400).json({
        ok: false,
        error: "SHIPROCKET_PICKUP_POSTCODE must be a 6 digit Indian pincode",
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

    const incomingPackages = Array.isArray(body.packages) ? body.packages : []
    const packages = incomingPackages.length
      ? incomingPackages.map((pkg: any) =>
          normalizePackage(pkg, {
            id: "shiprocket:standard",
            label: "Standard parcel",
            weight,
            length: body.length || body.length_cm,
            breadth: body.breadth || body.breadth_cm,
            height: body.height || body.height_cm,
          })
        )
      : [
          normalizePackage(
            {
              id: "shiprocket:standard",
              label: "Standard parcel",
              carrier: "shiprocket",
              weight,
              length: body.length || body.length_cm,
              breadth: body.breadth || body.breadth_cm,
              height: body.height || body.height_cm,
            },
            { weight }
          ),
        ]

    const packageQuotes = await Promise.all(
      packages.map(async (pkg: any) => {
        const includeIndiaPost =
          pkg.carrier === "india_post" || body.compare_india_post === true
        const indiaPostOption = includeIndiaPost ? getIndiaPostParcelOption(pkg) : null
        let shiprocketOptions: any[] = []
        let cheapest: any = null

        try {
          const rated = await rateShiprocketPackage({
            pkg,
            pickupPostcode,
            deliveryPostcode,
            cod,
          })
          shiprocketOptions = rated.allOptions
          cheapest = rated.cheapest
        } catch (error) {
          if (!indiaPostOption) {
            throw error
          }
        }

        const allOptions = [
          ...(indiaPostOption ? [indiaPostOption] : []),
          ...shiprocketOptions.map((option) => ({
            ...option,
            provider: "shiprocket",
            option_id: `${pkg.id}:shiprocket:${option.courier_company_id}`,
          })),
        ].sort((a, b) => getCourierAmount(a) - getCourierAmount(b))
        const selected = pkg.carrier === "india_post" && indiaPostOption
          ? indiaPostOption
          : cheapest
            ? { ...cheapest, provider: "shiprocket", option_id: `${pkg.id}:shiprocket:${cheapest.courier_company_id}` }
            : allOptions[0]
        const amount = getCourierAmount(selected)

        return {
          ...pkg,
          cheapest: selected || null,
          selected_option: selected || null,
          amount,
          amount_paise: Math.round(amount * 100),
          all_options: allOptions,
          message: selected
            ? undefined
            : "No courier available for this parcel.",
        }
      })
    )

    const unavailableQuote = packageQuotes.find((quote) => !quote.selected_option)

    if (unavailableQuote) {
      return res.json({
        ok: false,
        available: false,
        message: `No courier available for ${unavailableQuote.label}.`,
        package_quotes: packageQuotes,
      })
    }

    const amount = packageQuotes.reduce(
      (sum, quote) => sum + Number(quote.amount || 0),
      0
    )
    const selectedCarrier = packageQuotes[0]?.selected_option || null
    const allCartOptions = packageQuotes.flatMap((quote) => quote.all_options || [])

    return res.json({
      ok: true,
      available: true,
      provider: packageQuotes.some((quote) => quote.carrier === "india_post")
        ? "split"
        : "shiprocket",
      pickup_postcode: pickupPostcode,
      delivery_postcode: deliveryPostcode,
      amount: Number(amount.toFixed(2)),
      amount_paise: Math.round(amount * 100),
      package: {
        weight,
        length: body.length || body.length_cm || null,
        breadth: body.breadth || body.breadth_cm || null,
        height: body.height || body.height_cm || null,
      },
      courier: selectedCarrier,
      all_options: allCartOptions,
      package_quotes: packageQuotes,
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

    console.error("Shiprocket store rate lookup failed", response)

    return res.status(status).json(response)
  }
}
