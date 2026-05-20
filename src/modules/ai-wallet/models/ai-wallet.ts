import { model } from "@medusajs/framework/utils"

const AiWallet = model.define("ai_wallet", {
  id: model.id().primaryKey(),
  customer_id: model.text(),
  customer_email: model.text().nullable(),
  credit_balance: model.number().default(0),
  plan: model.text().default("free"),
  plan_expires_at: model.dateTime().nullable(),
  pro_question_limit: model.number().default(0),
  metadata_json: model.json().default({}),
})

export default AiWallet
