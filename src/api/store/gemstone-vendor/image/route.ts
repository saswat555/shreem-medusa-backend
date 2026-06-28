import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"

import { saveAdminImageUpload } from "../../../../lib/admin-media"
import { requireGemstoneVendor, setVendorNoStore } from "../_auth"

export const POST = async (
  req: MedusaRequest<{
    fileName?: string
    mimeType?: string
    contentBase64?: string
  }>,
  res: MedusaResponse
) => {
  setVendorNoStore(res)
  const vendor = await requireGemstoneVendor(req, res)

  if (!vendor) {
    return
  }

  try {
    const image = await saveAdminImageUpload({
      ...(req.body || {}),
      directory: "gemstones",
    })

    return res.status(201).json({
      ok: true,
      image,
    })
  } catch (error: any) {
    return res.status(400).json({
      ok: false,
      message: error?.message || "Image upload failed.",
    })
  }
}
