import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"

import {
  getGemstoneVendorProfile,
  listGemstoneProductsForVendor,
} from "../../../../lib/gemstone-marketplace"
import { requireGemstoneVendor, setVendorNoStore } from "../_auth"

export const GET = async (req: MedusaRequest, res: MedusaResponse) => {
  setVendorNoStore(res)
  const vendor = await requireGemstoneVendor(req, res)

  if (!vendor) {
    return
  }

  const [profile, products] = await Promise.all([
    getGemstoneVendorProfile(vendor.vendor_id),
    listGemstoneProductsForVendor(vendor.vendor_id),
  ])

  return res.json({
    ok: true,
    user: vendor,
    profile,
    products,
  })
}
