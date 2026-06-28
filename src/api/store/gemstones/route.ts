import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"

import {
  listGemstoneProducts,
  listGemstoneVendors,
} from "../../../lib/gemstone-marketplace"

const setCacheHeaders = (res: MedusaResponse) => {
  res.setHeader(
    "Cache-Control",
    "public, max-age=60, s-maxage=300, stale-while-revalidate=600"
  )
}

export const GET = async (req: MedusaRequest, res: MedusaResponse) => {
  setCacheHeaders(res)

  const vendorHandle = String(req.query.vendor || "").trim()
  const stone = String(req.query.stone || req.query.q || "").trim()
  const [vendors, products] = await Promise.all([
    listGemstoneVendors({ publicOnly: true }),
    listGemstoneProducts({
      publicOnly: true,
      vendorHandle,
      stone,
    }),
  ])

  return res.json({
    vendors,
    products,
  })
}
