import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"

import {
  getGemstoneVendorProfile,
  updateGemstoneVendorProfileForVendor,
} from "../../../../lib/gemstone-marketplace"
import { requireGemstoneVendor, setVendorNoStore } from "../_auth"

export const POST = async (
  req: MedusaRequest<{ profile?: any }>,
  res: MedusaResponse
) => {
  setVendorNoStore(res)
  const vendor = await requireGemstoneVendor(req, res)

  if (!vendor) {
    return
  }

  try {
    const current = await getGemstoneVendorProfile(vendor.vendor_id)
    const profile = await updateGemstoneVendorProfileForVendor(vendor.vendor_id, {
      ...(current || {}),
      ...(req.body?.profile || {}),
      id: vendor.vendor_id,
    })

    return res.json({
      ok: true,
      profile,
    })
  } catch (error: any) {
    return res.status(400).json({
      ok: false,
      message: error?.message || "Could not save vendor profile.",
    })
  }
}
