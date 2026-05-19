import {
  AuthenticatedMedusaRequest,
  MedusaResponse,
} from "@medusajs/framework/http"
import { Modules } from "@medusajs/framework/utils"

import {
  AI_USAGE_MODULE,
  AiUsagePayload,
  assertPayloadSize,
  createAiUsageId,
  ensureRecord,
  formatAiUsageLog,
  isAiUsageStorageMissing,
  parseNonNegativeNumber,
  parsePositiveInt,
  parseTags,
  sanitizeText,
} from "../../../lib/ai-usage"

const getCustomerEmail = async (
  req: AuthenticatedMedusaRequest,
  customerId: string
) => {
  try {
    const customerService = req.scope.resolve(Modules.CUSTOMER) as any
    const customer = await customerService.retrieveCustomer(customerId, {
      select: ["id", "email"],
    })

    return customer?.email || null
  } catch {
    return null
  }
}

const getCustomerId = (req: AuthenticatedMedusaRequest) =>
  (req as any).auth_context?.actor_type === "customer"
    ? (req as any).auth_context?.actor_id
    : null

export const POST = async (
  req: AuthenticatedMedusaRequest<AiUsagePayload>,
  res: MedusaResponse
) => {
  const customerId = getCustomerId(req)

  if (!customerId) {
    return res.status(401).json({
      message: "Sign in to save AI usage.",
    })
  }

  try {
    assertPayloadSize(req.body)

    const body = req.body || {}
    const tool = sanitizeText(body.tool, 80)

    if (!tool) {
      return res.status(400).json({
        message: "tool is required.",
      })
    }

    const input = ensureRecord(body.input, "input")
    const response = ensureRecord(body.response, "response")
    const metadata = body.metadata
      ? ensureRecord(body.metadata, "metadata")
      : {}
    const customerEmail = await getCustomerEmail(req, customerId)
    const aiUsageService = req.scope.resolve(AI_USAGE_MODULE) as any

    const usage = await aiUsageService.createAiUsageLogs({
      id: createAiUsageId(),
      customer_id: customerId,
      customer_email: customerEmail,
      tool,
      input_json: input,
      response_json: response,
      metadata_json: metadata,
      model: sanitizeText(body.model, 120) || null,
      prompt_tokens: Math.floor(parseNonNegativeNumber(body.prompt_tokens)),
      completion_tokens: Math.floor(
        parseNonNegativeNumber(body.completion_tokens)
      ),
      total_tokens: Math.floor(parseNonNegativeNumber(body.total_tokens)),
      estimated_cost_usd: Number(
        parseNonNegativeNumber(body.estimated_cost_usd).toFixed(6)
      ),
      estimated_cost_inr: Number(
        parseNonNegativeNumber(body.estimated_cost_inr).toFixed(4)
      ),
      expert_recommended: Boolean(body.expert_recommended),
      admin_status: "new",
      tags: parseTags(body.tags),
    })

    return res.status(201).json({
      synced: true,
      usage: formatAiUsageLog(usage),
    })
  } catch (error: any) {
    if (isAiUsageStorageMissing(error)) {
      return res.status(202).json({
        synced: false,
        message:
          "AI usage storage is not ready yet. Run backend database migrations.",
      })
    }

    const message = error?.message || "Unable to save AI usage."
    const status = message.includes("too large") ? 413 : 400

    return res.status(status).json({ message })
  }
}

export const GET = async (
  req: AuthenticatedMedusaRequest,
  res: MedusaResponse
) => {
  const customerId = getCustomerId(req)

  if (!customerId) {
    return res.status(401).json({
      message: "Sign in to view AI usage.",
      usage: [],
    })
  }

  const limit = parsePositiveInt(req.query.limit, 12)
  const toolPrefix = sanitizeText(req.query.tool_prefix, 80)
  const createdFrom = sanitizeText(req.query.created_from, 40)
  const createdTo = sanitizeText(req.query.created_to, 40)
  const filters: Record<string, unknown> = {
    customer_id: customerId,
  }

  if (toolPrefix) {
    filters.tool = { $like: `${toolPrefix}%` }
  }

  if (createdFrom || createdTo) {
    filters.created_at = {
      ...(createdFrom ? { $gte: new Date(createdFrom) } : {}),
      ...(createdTo ? { $lte: new Date(createdTo) } : {}),
    }
  }

  const aiUsageService = req.scope.resolve(AI_USAGE_MODULE) as any
  try {
    const usage = await aiUsageService.listAiUsageLogs(filters, {
      take: limit,
      order: {
        created_at: "DESC",
      },
    })

    return res.json({
      usage: usage.map(formatAiUsageLog),
    })
  } catch (error) {
    if (isAiUsageStorageMissing(error)) {
      return res.json({
        synced: false,
        message:
          "AI usage storage is not ready yet. Run backend database migrations.",
        usage: [],
      })
    }

    throw error
  }
}
