import { model } from "@medusajs/framework/utils"

const AiCreditLedger = model.define("ai_credit_ledger", {
  id: model.id().primaryKey(),
  wallet_id: model.text(),
  customer_id: model.text(),
  customer_email: model.text().nullable(),
  type: model.text(),
  source: model.text().nullable(),
  credits: model.number().default(0),
  balance_after: model.number().default(0),
  order_id: model.text().nullable(),
  usage_id: model.text().nullable(),
  note: model.text().nullable(),
  metadata_json: model.json().default({}),
})

export default AiCreditLedger
