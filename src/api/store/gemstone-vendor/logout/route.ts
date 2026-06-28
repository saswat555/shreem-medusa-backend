import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"

import {
  getGemstoneVendorSessionCookieName,
  logoutGemstoneVendor,
} from "../../../../lib/gemstone-marketplace"
import { getVendorCookie, setVendorNoStore } from "../_auth"

export const POST = async (req: MedusaRequest, res: MedusaResponse) => {
  setVendorNoStore(res)
  await logoutGemstoneVendor(getVendorCookie(req))
  res.clearCookie(getGemstoneVendorSessionCookieName(), { path: "/" })

  return res.json({
    ok: true,
  })
}
