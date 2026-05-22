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

const emptyCostSummary = () => ({
  sessions: 0,
  prompt_tokens: 0,
  completion_tokens: 0,
  total_tokens: 0,
  estimated_cost_usd: 0,
  estimated_cost_inr: 0,
})

const addUsageCost = (summary: ReturnType<typeof emptyCostSummary>, item: any) => {
  summary.sessions += 1
  summary.prompt_tokens += Math.floor(parseNonNegativeNumber(item.prompt_tokens))
  summary.completion_tokens += Math.floor(
    parseNonNegativeNumber(item.completion_tokens)
  )
  summary.total_tokens += Math.floor(parseNonNegativeNumber(item.total_tokens))
  summary.estimated_cost_usd = Number(
    (
      summary.estimated_cost_usd +
      parseNonNegativeNumber(item.estimated_cost_usd)
    ).toFixed(6)
  )
  summary.estimated_cost_inr = Number(
    (
      summary.estimated_cost_inr +
      parseNonNegativeNumber(item.estimated_cost_inr)
    ).toFixed(4)
  )
}

const getBillingBucket = (item: any) => {
  const metadata = item?.metadata_json || {}
  const mode = String(
    metadata.billing_mode ||
      metadata.access_reason ||
      metadata.wallet_charge?.billing_mode ||
      ""
  ).toLowerCase()

  if (["premium", "credit", "paid"].includes(mode)) {
    return "paid"
  }

  if (["free", "daily_free"].includes(mode)) {
    return "free"
  }

  return "unclassified"
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
      (acc: any, item: any) => {
        addUsageCost(acc, item)
        addUsageCost(acc[getBillingBucket(item)], item)

        return acc
      },
      {
        ...emptyCostSummary(),
        free: emptyCostSummary(),
        paid: emptyCostSummary(),
        unclassified: emptyCostSummary(),
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
