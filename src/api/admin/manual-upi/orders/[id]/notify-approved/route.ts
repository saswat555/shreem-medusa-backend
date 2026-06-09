import { sendShreemEmail } from "../../../../../../lib/email/shreem-mail"
import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http"

type NotifyApprovedBody = {
  email?: unknown
  display_id?: unknown
  payment_reference?: unknown
  amount?: unknown
  currency_code?: unknown
}

type Params = {
  id: string
}

const isAdminRequest = (req: AuthenticatedMedusaRequest) =>
  (req as any).auth_context?.actor_type === "user" &&
  Boolean((req as any).auth_context?.actor_id)

const sanitizeText = (value: unknown, fallback = "") =>
  typeof value === "string" ? value.trim().slice(0, 500) || fallback : fallback

const isValidEmail = (value: string) =>
  /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)

const escapeHtml = (value: string) =>
  value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;")

export const POST = async (
  req: AuthenticatedMedusaRequest<NotifyApprovedBody, Params>,
  res: MedusaResponse
) => {
  if (!isAdminRequest(req)) {
    return res.status(401).json({
      ok: false,
      message: "Admin authentication is required.",
    })
  }

  const email = sanitizeText(req.body?.email).toLowerCase()

  if (!email || !isValidEmail(email)) {
    return res.status(400).json({
      ok: false,
      message: "A valid customer email is required to send payment approval mail.",
    })
  }

  const displayId = sanitizeText(req.body?.display_id, req.params.id)
  const paymentReference = sanitizeText(req.body?.payment_reference, "UPI payment")
  const amount = sanitizeText(req.body?.amount)
  const currencyCode = sanitizeText(req.body?.currency_code, "INR").toUpperCase()
  const siteUrl = (process.env.SHREEM_SITE_URL || "https://www.shreemfarms.in").replace(
    /\/+$/,
    ""
  )
  const orderUrl = `${siteUrl}/account/orders/details/${encodeURIComponent(
    req.params.id
  )}`

  const subject = `Payment approved for Shreem order ${displayId}`
  const amountLine = amount ? `${currencyCode} ${amount}` : "your order amount"
  const text = `Your manual UPI payment for Shreem order ${displayId} has been verified. Reference: ${paymentReference}. Amount: ${amountLine}. We will now process the order. View order: ${orderUrl}`
  const html = `
    <div style="margin:0;background:#f5efdf;padding:28px 14px;font-family:Arial,Helvetica,sans-serif;color:#092636">
      <div style="max-width:620px;margin:0 auto;background:#fffdf7;border:1px solid #ead7a7;border-radius:24px;overflow:hidden">
        <div style="padding:26px;background:linear-gradient(135deg,#083848,#0d817e);color:#fff">
          <p style="margin:0 0 8px;letter-spacing:.22em;text-transform:uppercase;color:#f6d36b;font-size:11px;font-weight:700">Shreem Farms</p>
          <h1 style="margin:0;font-family:Georgia,'Times New Roman',serif;font-size:30px;line-height:1.1">Payment verified</h1>
        </div>
        <div style="padding:26px">
          <p style="font-size:16px;line-height:1.7;margin:0 0 18px;color:#385965">Your manual UPI payment for order <strong>${escapeHtml(
            displayId
          )}</strong> has been verified by Shreem Farms.</p>
          <div style="background:#f9f3e5;border:1px solid #ead7a7;border-radius:16px;padding:16px;margin:0 0 20px;color:#385965;line-height:1.7">
            <div><strong>Reference:</strong> ${escapeHtml(paymentReference)}</div>
            <div><strong>Amount:</strong> ${escapeHtml(amountLine)}</div>
          </div>
          <p style="font-size:15px;line-height:1.7;margin:0 0 20px;color:#385965">We will now process the order and share further updates from the Shreem Farms team.</p>
          <a href="${orderUrl}" style="display:inline-block;background:linear-gradient(135deg,#0d817e,#123f63);color:#fff;text-decoration:none;padding:13px 20px;border-radius:999px;font-weight:700">View order</a>
        </div>
      </div>
    </div>`

  try {
    let emailWarning = ""

    await sendShreemEmail({
      to: email,
      subject,
      html,
      text,
    }).catch((error) => {
      emailWarning = error?.message || "Payment approval email could not be sent."
      console.error("Manual UPI payment approval email failed", error)
    })
return res.json({
      ok: true,
      message: [
        emailWarning ? emailWarning : "Payment approval email sent.",
        "Payment approval email sent.",
      ].join(" "),
email_warning: emailWarning || undefined,
})
  } catch (error: any) {
    return res.status(502).json({
      ok: false,
      message: error?.message || "Payment captured, but email could not be sent.",
    })
  }
}
