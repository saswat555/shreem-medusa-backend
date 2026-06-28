import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"

import { changeGemstoneVendorPassword } from "../../../../lib/gemstone-marketplace"
import { requireGemstoneVendor, setVendorNoStore } from "../_auth"

export const POST = async (
  req: MedusaRequest<{ current_password?: string; new_password?: string }>,
  res: MedusaResponse
) => {
  setVendorNoStore(res)
  const vendor = await requireGemstoneVendor(req, res)

  if (!vendor) {
    return
  }

  try {
    await changeGemstoneVendorPassword({
      userId: vendor.id,
      currentPassword: req.body?.current_password,
      newPassword: req.body?.new_password,
    })

    return res.json({
      ok: true,
    })
  } catch (error: any) {
    return res.status(400).json({
      ok: false,
      message: error?.message || "Could not change password.",
    })
  }
}
