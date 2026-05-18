import { model } from "@medusajs/framework/utils"

const AiUsageLog = model.define("ai_usage_log", {
  id: model.id().primaryKey(),
  customer_id: model.text(),
  customer_email: model.text().nullable(),
  tool: model.text(),
  input_json: model.json().default({}),
  response_json: model.json().default({}),
  metadata_json: model.json().default({}),
  model: model.text().nullable(),
  prompt_tokens: model.number().default(0),
  completion_tokens: model.number().default(0),
  total_tokens: model.number().default(0),
  estimated_cost_usd: model.number().default(0),
  expert_recommended: model.boolean().default(false),
  admin_status: model.text().default("new"),
  admin_notes: model.text().nullable(),
  tags: model.json().default({}),
})

export default AiUsageLog
