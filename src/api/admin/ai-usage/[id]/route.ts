import {
  AuthenticatedMedusaRequest,
  MedusaResponse,
} from "@medusajs/framework/http"

import {
  AI_USAGE_MODULE,
  formatAiUsageLog,
  isAiUsageStorageMissing,
  parseTags,
  sanitizeText,
} from "../../../../lib/ai-usage"

const isAuthenticatedAdminRequest = (req: any) => {
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

const ALLOWED_STATUSES = new Set([
  "new",
  "reviewed",
  "follow_up",
  "resolved",
  "archived",
])

export const GET = async (
  req: AuthenticatedMedusaRequest<unknown, { id: string }>,
  res: MedusaResponse
) => {
  if (!isAuthenticatedAdminRequest(req)) {
    return res.status(401).json({
      message: "Unauthorized admin request",
    })
  }

  const aiUsageService = req.scope.resolve(AI_USAGE_MODULE) as any

  try {
    const usage = await aiUsageService.retrieveAiUsageLog(req.params.id)

    return res.json({
      usage: formatAiUsageLog(usage),
    })
  } catch (error) {
    if (isAiUsageStorageMissing(error)) {
      return res.status(503).json({
        message: "AI usage table is missing. Run backend database migrations.",
      })
    }

    throw error
  }
}

export const PATCH = async (
  req: AuthenticatedMedusaRequest<
    {
      admin_status?: unknown
      admin_notes?: unknown
      tags?: unknown
    },
    { id: string }
  >,
  res: MedusaResponse
) => {
  if (!isAuthenticatedAdminRequest(req)) {
    return res.status(401).json({
      message: "Unauthorized admin request",
    })
  }

  const body = req.body || {}
  const update: Record<string, unknown> = {}
  const adminStatus = sanitizeText(body.admin_status, 40)

  if (adminStatus) {
    if (!ALLOWED_STATUSES.has(adminStatus)) {
      return res.status(400).json({
        message: "Invalid admin_status.",
      })
    }

    update.admin_status = adminStatus
  }

  if (typeof body.admin_notes !== "undefined") {
    update.admin_notes = sanitizeText(body.admin_notes, 4000) || null
  }

  if (typeof body.tags !== "undefined") {
    update.tags = parseTags(body.tags)
  }

  const aiUsageService = req.scope.resolve(AI_USAGE_MODULE) as any

  try {
    const usage = await aiUsageService.updateAiUsageLogs(req.params.id, update)

    return res.json({
      usage: formatAiUsageLog(usage),
    })
  } catch (error) {
    if (isAiUsageStorageMissing(error)) {
      return res.status(503).json({
        message: "AI usage table is missing. Run backend database migrations.",
      })
    }

    throw error
  }
}
