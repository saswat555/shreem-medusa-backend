import type { SubscriberArgs, SubscriberConfig } from "@medusajs/framework"

import {
  buildPasswordResetEmail,
  sendShreemEmail,
} from "../lib/email/shreem-mail"

type PasswordResetEvent = {
  entity_id: string
  actor_type: string
  token: string
  metadata?: {
    country_code?: string
    reset_url?: string
  }
}

const safeCountryCode = (value?: string) =>
  (value || "in").toLowerCase().replace(/[^a-z]/g, "").slice(0, 4) || "in"

const getSiteUrl = () =>
  (process.env.SHREEM_SITE_URL || "https://shreemfarms.in").replace(/\/$/, "")

export default async function passwordResetEmailHandler({
  event,
}: SubscriberArgs<PasswordResetEvent>) {
  const data = event.data

  if (data.actor_type !== "customer" || !data.entity_id || !data.token) {
    return
  }

  const countryCode = safeCountryCode(data.metadata?.country_code)
  const baseUrl =
    data.metadata?.reset_url ||
    `${getSiteUrl()}/${countryCode}/reset-password`
  const separator = baseUrl.includes("?") ? "&" : "?"
  const resetUrl = `${baseUrl}${separator}token=${encodeURIComponent(
    data.token
  )}&email=${encodeURIComponent(data.entity_id)}`
  const email = buildPasswordResetEmail(resetUrl)

  await sendShreemEmail({
    to: data.entity_id,
    subject: "Reset your Shreem Farms password",
    ...email,
  })
}

export const config: SubscriberConfig = {
  event: "auth.password_reset",
}
