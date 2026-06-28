import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"

import {
  listGemstoneProductsForVendor,
  saveGemstoneProductForVendor,
} from "../../../../lib/gemstone-marketplace"
import { requireGemstoneVendor, setVendorNoStore } from "../_auth"

export const GET = async (req: MedusaRequest, res: MedusaResponse) => {
  setVendorNoStore(res)
  const vendor = await requireGemstoneVendor(req, res)

  if (!vendor) {
    return
  }

  return res.json({
    ok: true,
    products: await listGemstoneProductsForVendor(vendor.vendor_id),
  })
}

export const POST = async (
  req: MedusaRequest<{ product?: any }>,
  res: MedusaResponse
) => {
  setVendorNoStore(res)
  const vendor = await requireGemstoneVendor(req, res)

  if (!vendor) {
    return
  }

  try {
    const product = await saveGemstoneProductForVendor(
      vendor.vendor_id,
      req.body?.product || {}
    )

    return res.status(201).json({
      ok: true,
      product,
    })
  } catch (error: any) {
    return res.status(400).json({
      ok: false,
      message: error?.message || "Could not save gemstone product.",
    })
  }
}
