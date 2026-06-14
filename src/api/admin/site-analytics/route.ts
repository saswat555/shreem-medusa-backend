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
  if (!isAdminRequest(req)) {
    return res.status(401).json({
      message: "Admin authentication is required.",
    })
  }

  const days = Number(req.query.days || 7)
  const limit = Number(req.query.limit || 20)
  const summary = await getSiteAnalyticsSummary({ days, limit })

  return res.json(summary)
}
