import { randomUUID } from "crypto"

export const AI_USAGE_MODULE = "aiUsage"

export const MAX_AI_USAGE_PAYLOAD_CHARS = 160_000
export const MAX_AI_USAGE_LIMIT = 50

export type AiUsagePayload = {
  tool?: unknown
  input?: unknown
  response?: unknown
  metadata?: unknown
  model?: unknown
  expert_recommended?: unknown
  tags?: unknown
}

export type AiUsageLogRecord = {
  id: string
  customer_id: string
  customer_email?: string | null
  tool: string
  input_json?: Record<string, unknown>
  response_json?: Record<string, unknown>
  metadata_json?: Record<string, unknown>
  model?: string | null
  expert_recommended?: boolean
  admin_status?: string
  admin_notes?: string | null
  tags?: unknown
  created_at?: string | Date
  updated_at?: string | Date
}

const SENSITIVE_KEY_PATTERN =
  /(dataurl|data_url|base64|image_data|inline_data|file_data|raw_image|bytes|buffer)/i

const looksLikeBase64 = (value: string) =>
  value.length > 800 &&
  /^[A-Za-z0-9+/=\s]+$/.test(value) &&
  !value.includes(" ")

export const createAiUsageId = () => `aiuse_${randomUUID().replace(/-/g, "")}`

export const parsePositiveInt = (
  value: unknown,
  fallback: number,
  max = MAX_AI_USAGE_LIMIT
) => {
  const parsed = Number(value)

  if (!Number.isFinite(parsed) || parsed <= 0) {
    return fallback
  }

  return Math.min(Math.floor(parsed), max)
}

export const sanitizeText = (value: unknown, maxLength: number) =>
  typeof value === "string" ? value.trim().slice(0, maxLength) : ""

export const assertPayloadSize = (payload: unknown) => {
  const size = JSON.stringify(payload ?? {}).length

  if (size > MAX_AI_USAGE_PAYLOAD_CHARS) {
    throw new Error("AI usage payload is too large")
  }
}

export const sanitizeJson = (
  value: unknown,
  parentKey = "",
  depth = 0
): unknown => {
  if (depth > 8) {
    return "[max-depth-stripped]"
  }

  if (value === null || value === undefined) {
    return value
  }

  if (typeof value === "string") {
    if (
      value.startsWith("data:image/") ||
      SENSITIVE_KEY_PATTERN.test(parentKey) ||
      looksLikeBase64(value)
    ) {
      return `[stripped:${Math.min(value.length, 999999)} chars]`
    }

    return value.length > 8000 ? `${value.slice(0, 8000)}...` : value
  }

  if (typeof value === "number" || typeof value === "boolean") {
    return value
  }

  if (Array.isArray(value)) {
    return value.slice(0, 80).map((item) => sanitizeJson(item, parentKey, depth + 1))
  }

  if (typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([key, item]) => [
        key,
        sanitizeJson(item, key, depth + 1),
      ])
    )
  }

  return String(value)
}

export const ensureRecord = (value: unknown, fieldName: string) => {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${fieldName} must be a JSON object`)
  }

  return sanitizeJson(value) as Record<string, unknown>
}

export const parseTags = (value: unknown) =>
  Array.isArray(value)
    ? value
        .map((item) => sanitizeText(item, 40))
        .filter(Boolean)
        .slice(0, 12)
    : []

export const isAiUsageStorageMissing = (error: unknown) => {
  const code = (error as { code?: string })?.code
  const message =
    error instanceof Error
      ? error.message
      : typeof error === "object" && error
      ? String((error as { message?: unknown }).message || "")
      : String(error || "")

  return (
    code === "42P01" ||
    message.includes('relation "ai_usage_log" does not exist') ||
    message.includes("ai_usage_log") && message.includes("does not exist")
  )
}

export const formatAiUsageLog = (log: AiUsageLogRecord) => ({
  id: log.id,
  customer_id: log.customer_id,
  customer_email: log.customer_email,
  tool: log.tool,
  input: log.input_json || {},
  response: log.response_json || {},
  metadata: log.metadata_json || {},
  model: log.model || null,
  expert_recommended: Boolean(log.expert_recommended),
  admin_status: log.admin_status || "new",
  admin_notes: log.admin_notes || null,
  tags: Array.isArray(log.tags) ? log.tags : [],
  created_at: log.created_at,
  updated_at: log.updated_at,
})

export const previewJson = (value: unknown, fallback = "No preview") => {
  if (!value || typeof value !== "object") {
    return fallback
  }

  const record = value as Record<string, unknown>
  const preferred =
    record.question ||
    record.answer ||
    record.summary ||
    record.chart_summary ||
    record.case_summary ||
    record.likely_condition ||
    record.name ||
    record.subject ||
    record.messages

  const text =
    typeof preferred === "string"
      ? preferred
      : JSON.stringify(preferred || record).replace(/\s+/g, " ")

  return text.slice(0, 180)
}
