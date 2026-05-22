import { model } from "@medusajs/framework/utils"

export const ExpertCall = model.define("expert_call", {
  id: model.id().primaryKey(),
  order_id: model.text(),
  customer_id: model.text().nullable(),
  phone_number: model.text(),
  email: model.text(),
  scheduled_at: model.dateTime(),
  status: model.enum(["pending", "confirmed", "completed", "cancelled"]).default("pending"),
  notes: model.text().nullable(),
})