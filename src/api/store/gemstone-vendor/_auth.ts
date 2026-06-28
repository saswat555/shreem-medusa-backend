import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"

import {
  getGemstoneVendorSession,
  getGemstoneVendorSessionCookieName,
} from "../../../lib/gemstone-marketplace"

export const setVendorNoStore = (res: MedusaResponse) => {
  res.setHeader(
    "Cache-Control",
    "no-store, no-cache, must-revalidate, proxy-revalidate"
  )
  res.setHeader("Pragma", "no-cache")
  res.setHeader("Expires", "0")
}

export const getVendorCookie = (req: MedusaRequest) => {
  const cookieName = getGemstoneVendorSessionCookieName()
  const cookies = (req as any).cookies || {}
  const direct = cookies[cookieName]

  if (direct) {
    return String(direct)
  }

  const header = String(req.headers.cookie || "")
  const match = header
    .split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${cookieName}=`))

  return match ? decodeURIComponent(match.slice(cookieName.length + 1)) : ""
}

export const requireGemstoneVendor = async (
  req: MedusaRequest,
  res: MedusaResponse
) => {
  const session = await getGemstoneVendorSession(getVendorCookie(req))

  if (!session) {
    res.status(401).json({
      ok: false,
      message: "Vendor login is required.",
    })
    return null
  }

  return session
}
