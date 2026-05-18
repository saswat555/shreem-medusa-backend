import {
  AuthenticatedMedusaRequest,
  MedusaResponse,
} from "@medusajs/framework/http"

import {
  AI_USAGE_MODULE,
  formatAiUsageLog,
  isAiUsageStorageMissing,
  parseNonNegativeNumber,
  parsePositiveInt,
  previewJson,
  sanitizeText,
} from "../../../lib/ai-usage"

const isAdminRequest = (req: AuthenticatedMedusaRequest) =>
  (req as any).auth_context?.actor_type === "user" &&
  Boolean((req as any).auth_context?.actor_id)

const toBooleanFilter = (value: unknown) => {
  if (value === "true" || value === true) {
    return true
  }

  if (value === "false" || value === false) {
    return false
  }

  return undefined
}

export const GET = async (
  req: AuthenticatedMedusaRequest,
  res: MedusaResponse
) => {
  if (!isAdminRequest(req)) {
    return res.status(401).json({
      message: "Admin authentication is required.",
      usage: [],
    })
  }

  const limit = parsePositiveInt(req.query.limit, 25, 100)
  const offset = Math.max(Number(req.query.offset || 0), 0)
  const filters: Record<string, unknown> = {}
  const customerId = sanitizeText(req.query.customer_id, 120)
  const customerEmail = sanitizeText(req.query.customer_email, 240)
  const tool = sanitizeText(req.query.tool, 80)
  const toolPrefix = sanitizeText(req.query.tool_prefix, 80)
  const adminStatus = sanitizeText(req.query.admin_status, 40)
  const createdFrom = sanitizeText(req.query.created_from, 40)
  const createdTo = sanitizeText(req.query.created_to, 40)
  const expertRecommended = toBooleanFilter(req.query.expert_recommended)

  if (customerId) {
    filters.customer_id = customerId
  }

  if (customerEmail) {
    filters.customer_email = customerEmail
  }

  if (tool) {
    filters.tool = tool
  } else if (toolPrefix) {
    filters.tool = { $like: `${toolPrefix}%` }
  }

  if (adminStatus) {
    filters.admin_status = adminStatus
  }

  if (typeof expertRecommended === "boolean") {
    filters.expert_recommended = expertRecommended
  }

  if (createdFrom || createdTo) {
    filters.created_at = {
      ...(createdFrom ? { $gte: new Date(createdFrom) } : {}),
      ...(createdTo ? { $lte: new Date(createdTo) } : {}),
    }
  }

  const aiUsageService = req.scope.resolve(AI_USAGE_MODULE) as any
  try {
    const [usage, count] = await aiUsageService.listAndCountAiUsageLogs(filters, {
      take: limit,
      skip: offset,
      order: {
        created_at: "DESC",
      },
    })
    const summaryRows = await aiUsageService.listAiUsageLogs(filters, {
      take: 5000,
      order: {
        created_at: "DESC",
      },
    })
    const summary = summaryRows.reduce(
      (acc: any, item: any) => ({
        sessions: acc.sessions + 1,
        prompt_tokens:
          acc.prompt_tokens +
          Math.floor(parseNonNegativeNumber(item.prompt_tokens)),
        completion_tokens:
          acc.completion_tokens +
          Math.floor(parseNonNegativeNumber(item.completion_tokens)),
        total_tokens:
          acc.total_tokens +
          Math.floor(parseNonNegativeNumber(item.total_tokens)),
        estimated_cost_usd: Number(
          (
            acc.estimated_cost_usd +
            parseNonNegativeNumber(item.estimated_cost_usd)
          ).toFixed(6)
        ),
      }),
      {
        sessions: 0,
        prompt_tokens: 0,
        completion_tokens: 0,
        total_tokens: 0,
        estimated_cost_usd: 0,
      }
    )

    return res.json({
      usage: usage.map((item: any) => ({
        ...formatAiUsageLog(item),
        input_preview: previewJson(item.input_json),
        response_preview: previewJson(item.response_json),
      })),
      summary: {
        ...summary,
        sampled: count > summaryRows.length,
      },
      count,
      limit,
      offset,
    })
  } catch (error) {
    if (isAiUsageStorageMissing(error)) {
      return res.json({
        usage: [],
        count: 0,
        limit,
        offset,
        setup_required: true,
        message:
          "AI usage table is missing. Run NODE_ENV=production npm run db:migrate on the backend server.",
      })
    }

    throw error
  }
}
