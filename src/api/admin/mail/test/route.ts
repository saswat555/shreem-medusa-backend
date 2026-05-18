import {
  AuthenticatedMedusaRequest,
  MedusaResponse,
} from "@medusajs/framework/http"

import {
  buildMailTestEmail,
  sendShreemEmail,
} from "../../../../lib/email/shreem-mail"

type MailTestBody = {
  to?: string
}

const isAdminRequest = (req: AuthenticatedMedusaRequest) =>
  (req as any).auth_context?.actor_type === "user" &&
  Boolean((req as any).auth_context?.actor_id)

const getSiteUrl = () =>
  (process.env.SHREEM_SITE_URL || "https://shreemfarms.in").replace(/\/$/, "")

const getRecipient = (body?: MailTestBody) =>
  (body?.to ||
    process.env.ADMIN_NOTIFY_EMAIL ||
    process.env.SMTP_REPLY_TO ||
    process.env.SMTP_FROM ||
    process.env.SMTP_USER ||
    "brajsavitrikrishisansthan@gmail.com")
    .trim()
    .toLowerCase()

export const POST = async (
  req: AuthenticatedMedusaRequest<MailTestBody>,
  res: MedusaResponse
) => {
  if (!isAdminRequest(req)) {
    return res.status(401).json({
      message: "Admin authentication is required.",
    })
  }

  const to = getRecipient(req.body)

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to)) {
    return res.status(400).json({
      message: "Enter a valid email address.",
    })
  }

  try {
    const email = buildMailTestEmail(getSiteUrl())

    await sendShreemEmail({
      to,
      subject: "Shreem Farms mail test",
      ...email,
    })

    return res.json({
      ok: true,
      to,
      message: `Test email sent to ${to}.`,
    })
  } catch (error: any) {
    return res.status(500).json({
      ok: false,
      message: error?.message || "Unable to send test email.",
    })
  }
}
