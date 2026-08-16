import {
  AuthenticatedMedusaRequest,
  MedusaResponse,
} from "@medusajs/framework/http"

import { getSiteAnalyticsSummary } from "../../../lib/site-analytics"

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

export const GET = async (
  req: AuthenticatedMedusaRequest,
  res: MedusaResponse
) => {
  res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate")
  res.setHeader("Pragma", "no-cache")
  res.setHeader("Expires", "0")

  if (!isAdminRequest(req)) {
    return res.status(401).json({
      message: "Admin authentication is required.",
    })
  }

  try {
    const days = Number(req.query.days || 7)
    const limit = Number(req.query.limit || 20)
    const start = typeof req.query.start === "string" ? req.query.start : null
    const end = typeof req.query.end === "string" ? req.query.end : null
    const summary = await getSiteAnalyticsSummary({ days, limit, start, end })

    return res.json(summary)
  } catch (error: any) {
    console.error("[admin/site-analytics] load failed", {
      message: error?.message,
    })

    return res.status(500).json({
      message:
        "User monitoring could not load right now. Check analytics database logs and refresh.",
    })
  }
}
