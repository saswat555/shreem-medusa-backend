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

const getAuthContext = (req: AuthenticatedMedusaRequest) =>
  (req as any).auth_context || (req as any).authContext || {}

const getCustomerId = (req: AuthenticatedMedusaRequest) => {
  const authContext = getAuthContext(req)

  if (
    authContext.actor_type === "customer" ||
    authContext.actorType === "customer"
  ) {
    return authContext.actor_id || authContext.actorId || null
  }

  return null
}

const getCustomerEmail = async (
  req: AuthenticatedMedusaRequest,
  customerId: string
) => {
  if (!customerId || customerId.startsWith("guest_")) {
    return null
  }

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

const getGuestCustomerId = (body: AiUsagePayload) => {
  const metadata =
    body.metadata && typeof body.metadata === "object" && !Array.isArray(body.metadata)
      ? (body.metadata as Record<string, unknown>)
      : {}

  const input =
    body.input && typeof body.input === "object" && !Array.isArray(body.input)
      ? (body.input as Record<string, unknown>)
      : {}

  const possibleId =
    sanitizeText(metadata.customer_id, 120) ||
    sanitizeText(metadata.customerId, 120) ||
    sanitizeText(input.customer_id, 120) ||
    sanitizeText(input.customerId, 120)

  if (possibleId) {
    return possibleId
  }

  const possibleEmail =
    sanitizeText(metadata.customer_email, 240) ||
    sanitizeText(metadata.customerEmail, 240) ||
    sanitizeText(input.customer_email, 240) ||
    sanitizeText(input.customerEmail, 240) ||
    sanitizeText(input.email, 240)

  if (possibleEmail) {
    return `guest_${possibleEmail.toLowerCase().replace(/[^a-z0-9]+/g, "_").slice(0, 80)}`
  }

  return "guest_unknown"
}

const getGuestCustomerEmail = (body: AiUsagePayload) => {
  const metadata =
    body.metadata && typeof body.metadata === "object" && !Array.isArray(body.metadata)
      ? (body.metadata as Record<string, unknown>)
      : {}

  const input =
    body.input && typeof body.input === "object" && !Array.isArray(body.input)
      ? (body.input as Record<string, unknown>)
      : {}

  return (
    sanitizeText(metadata.customer_email, 240) ||
    sanitizeText(metadata.customerEmail, 240) ||
    sanitizeText(input.customer_email, 240) ||
    sanitizeText(input.customerEmail, 240) ||
    sanitizeText(input.email, 240) ||
    null
  )
}

const toValidDate = (value: string | undefined) => {
  if (!value) {
    return undefined
  }

  const date = new Date(value)

  if (Number.isNaN(date.getTime())) {
    return undefined
  }

  return date
}

export const POST = async (
  req: AuthenticatedMedusaRequest<AiUsagePayload>,
  res: MedusaResponse
) => {
  try {
    assertPayloadSize(req.body)

    const body = req.body || {}
    const tool = sanitizeText(body.tool, 80)

    if (!tool) {
      return res.status(400).json({
        synced: false,
        message: "tool is required.",
      })
    }

    const input = ensureRecord(body.input, "input")
    const response = ensureRecord(body.response, "response")
    const metadata = body.metadata
      ? ensureRecord(body.metadata, "metadata")
      : {}

    const authenticatedCustomerId = getCustomerId(req)
    const customerId = authenticatedCustomerId || getGuestCustomerId(body)
    const customerEmail = authenticatedCustomerId
      ? await getCustomerEmail(req, authenticatedCustomerId)
      : getGuestCustomerEmail(body)

    const aiUsageService = req.scope.resolve(AI_USAGE_MODULE) as any

    const usage = await aiUsageService.createAiUsageLogs({
      id: createAiUsageId(),
      customer_id: customerId,
      customer_email: customerEmail,
      tool,
      input_json: input,
      response_json: response,
      metadata_json: {
        ...metadata,
        auth_source: authenticatedCustomerId ? "customer" : "guest_or_server",
      },
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

    console.log("[store/ai-usage] saved", {
      id: usage.id,
      tool,
      customer_id: customerId,
      customer_email: customerEmail,
      auth_source: authenticatedCustomerId ? "customer" : "guest_or_server",
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

    console.error("[store/ai-usage] save failed", {
      message,
      status,
    })

    return res.status(status).json({
      synced: false,
      message,
    })
  }
}

export const GET = async (
  req: AuthenticatedMedusaRequest,
  res: MedusaResponse
) => {
  const customerId = getCustomerId(req)

  if (!customerId) {
    return res.status(401).json({
      synced: false,
      message: "Sign in to view AI usage.",
      usage: [],
    })
  }

  const limit = parsePositiveInt(req.query.limit, 12)
  const toolPrefix = sanitizeText(req.query.tool_prefix, 80)
  const createdFromRaw = sanitizeText(req.query.created_from, 40)
  const createdToRaw = sanitizeText(req.query.created_to, 40)
  const createdFrom = toValidDate(createdFromRaw)
  const createdTo = toValidDate(createdToRaw)

  const filters: Record<string, unknown> = {
    customer_id: customerId,
  }

  if (toolPrefix) {
    filters.tool = { $like: `${toolPrefix}%` }
  }

  if (createdFrom || createdTo) {
    filters.created_at = {
      ...(createdFrom ? { $gte: createdFrom } : {}),
      ...(createdTo ? { $lte: createdTo } : {}),
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
      synced: true,
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
