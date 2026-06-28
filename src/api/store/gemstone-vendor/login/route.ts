import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"

import {
  getGemstoneVendorSessionCookieName,
  loginGemstoneVendor,
} from "../../../../lib/gemstone-marketplace"

type Body = {
  email?: string
  password?: string
}

const setNoStore = (res: MedusaResponse) => {
  res.setHeader("Cache-Control", "no-store")
}

export const POST = async (req: MedusaRequest<Body>, res: MedusaResponse) => {
  setNoStore(res)

  try {
    const session = await loginGemstoneVendor(req.body || {})
    const cookieName = getGemstoneVendorSessionCookieName()

    res.cookie(cookieName, session.token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      expires: new Date(session.expires_at),
    })

    return res.json({
      ok: true,
      user: session.user,
      expires_at: session.expires_at,
    })
  } catch (error: any) {
    return res.status(401).json({
      ok: false,
      message: error?.message || "Vendor login failed.",
    })
  }
}
