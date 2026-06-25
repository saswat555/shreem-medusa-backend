import type {
  AuthenticatedMedusaRequest,
  MedusaResponse,
} from "@medusajs/framework/http"

import {
  getMailSettings,
  saveMailSettings,
} from "../../../../lib/admin-mail-settings"

const isAdminRequest = (req: any) => {
  const authContext = req.auth_context || req.authContext || {}

  return (
    authContext.actor_type === "user" ||
    authContext.actorType === "user" ||
    Boolean(authContext.user_id) ||
    Boolean(authContext.userId) ||
    Boolean(authContext.actor_id) ||
    Boolean(authContext.actorId) ||
    Boolean(req.user?.id)
  )
}

const setNoStore = (res: MedusaResponse) => {
  res.setHeader(
    "Cache-Control",
    "no-store, no-cache, must-revalidate, proxy-revalidate"
  )
  res.setHeader("Pragma", "no-cache")
  res.setHeader("Expires", "0")
}

export const GET = async (
  req: AuthenticatedMedusaRequest,
  res: MedusaResponse
) => {
  setNoStore(res)

  if (!isAdminRequest(req)) {
    return res.status(401).json({
      message: "Admin authentication is required.",
    })
  }

  return res.json(await getMailSettings())
}

export const POST = async (
  req: AuthenticatedMedusaRequest<{
    order_stakeholder_recipients?: string[] | string
    order_stakeholder_enabled?: boolean
    customer_order_enabled?: boolean
    ai_wallet_enabled?: boolean
  }>,
  res: MedusaResponse
) => {
  setNoStore(res)

  if (!isAdminRequest(req)) {
    return res.status(401).json({
      message: "Admin authentication is required.",
    })
  }

  try {
    return res.json(await saveMailSettings(req.body || {}))
  } catch (error: any) {
    return res.status(400).json({
      message: error?.message || "Unable to save mail settings.",
    })
  }
}
