import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { sendShreemEmail } from "../../../../lib/email/shreem-mail"

type TestMailBody = {
  to?: string
}

export async function POST(req: MedusaRequest<TestMailBody>, res: MedusaResponse) {
  try {
    const body = req.body || {}

    const to =
      body.to ||
      process.env.ADMIN_NOTIFY_EMAIL ||
      process.env.SMTP_USER ||
      process.env.GMAIL_USER

    if (!to) {
      return res.status(400).json({
        ok: false,
        message: "Missing recipient email. Set ADMIN_NOTIFY_EMAIL or provide { to }.",
      })
    }

    await sendShreemEmail({
      to,
      subject: "Shreem Farms test email",
      text: "This is a test email from Shreem Farms admin panel.",
      html: `
        <div style="font-family:Arial,sans-serif;line-height:1.6;color:#1f2933">
          <h2 style="margin:0 0 12px">Shreem Farms</h2>
          <p>This is a test email from the Shreem Farms admin panel.</p>
          <p>If you received this, SMTP email is working correctly.</p>
        </div>
      `,
    })

    return res.status(200).json({
      ok: true,
      message: `Test email sent to ${to}`,
    })
  } catch (error: any) {
    return res.status(500).json({
      ok: false,
      message: error?.message || "Unable to send test email.",
    })
  }
}
