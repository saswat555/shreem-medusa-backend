import { existsSync, readFileSync } from "node:fs"
import { basename, extname, join, resolve } from "node:path"
import tls from "node:tls"

type SendEmailInput = {
  to: string
  subject: string
  html: string
  text: string
  replyTo?: string
}

type MailConfig = {
  host: string
  port: number
  secure: boolean
  user: string
  pass: string
  from: string
  fromName: string
  replyTo: string
  siteUrl: string
}

type InlineAttachment = {
  contentId: string
  contentType: string
  filename: string
  contentBase64: string
}

const DEFAULT_FROM = "brajsavitrikrishisansthan@gmail.com"
const LOGO_SRC_TOKEN = "__SHREEM_LOGO_SRC__"

const normalizeLineEndings = (value: string) =>
  value.replace(/\r?\n/g, "\r\n").replace(/^\./gm, "..")

const encodeHeader = (value: string) =>
  /[^\x20-\x7e]/.test(value)
    ? `=?UTF-8?B?${Buffer.from(value, "utf8").toString("base64")}?=`
    : value

const getMailConfig = (): MailConfig => {
  const user = process.env.SMTP_USER || process.env.GMAIL_USER || ""
  const pass =
    process.env.SMTP_PASS ||
    process.env.SMTP_PASSWORD ||
    process.env.GMAIL_APP_PASSWORD ||
    ""

  if (!user || !pass) {
    throw new Error(
      "SMTP_USER and SMTP_PASS are required to send Shreem emails."
    )
  }

  return {
    host: process.env.SMTP_HOST || "smtp.gmail.com",
    port: Number(process.env.SMTP_PORT || 465),
    secure: (process.env.SMTP_SECURE || "true") !== "false",
    user,
    pass,
    from: process.env.SMTP_FROM || user || DEFAULT_FROM,
    fromName: process.env.SMTP_FROM_NAME || "Shreem Farms",
    replyTo: process.env.SMTP_REPLY_TO || DEFAULT_FROM,
    siteUrl:
      process.env.SHREEM_SITE_URL ||
      process.env.MEDUSA_BACKEND_URL ||
      "https://shreemfarms.in",
  }
}

const inferImageContentType = (filePath: string) => {
  const extension = extname(filePath).toLowerCase()

  if (extension === ".png") {
    return "image/png"
  }

  if (extension === ".webp") {
    return "image/webp"
  }

  return "image/jpeg"
}

const splitBase64Lines = (value: string) =>
  value.match(/.{1,76}/g)?.join("\r\n") || value

const findLogoPath = () => {
  const configuredPath = process.env.SHREEM_LOGO_PATH

  const candidates = [
    configuredPath ? resolve(configuredPath) : "",
    join(process.cwd(), "static", "logo.jpeg"),
    join(process.cwd(), "static", "logo.jpg"),
    join(process.cwd(), "static", "logo.png"),
    join(process.cwd(), "public", "logo.jpeg"),
    resolve(process.cwd(), "..", "frontend", "public", "logo.jpeg"),
    "/opt/shreem/frontend/public/logo.jpeg",
  ].filter(Boolean)

  return candidates.find((candidate) => existsSync(candidate)) || null
}

const getLogoAttachment = (): InlineAttachment | null => {
  const logoPath = findLogoPath()

  if (!logoPath) {
    return null
  }

  try {
    return {
      contentId: "shreem-logo",
      contentType: inferImageContentType(logoPath),
      filename: basename(logoPath),
      contentBase64: splitBase64Lines(readFileSync(logoPath).toString("base64")),
    }
  } catch {
    return null
  }
}

const readSmtpResponse = (socket: tls.TLSSocket): Promise<string> =>
  new Promise((resolve, reject) => {
    let buffer = ""

    const cleanup = () => {
      socket.off("data", onData)
      socket.off("error", onError)
    }

    const onError = (error: Error) => {
      cleanup()
      reject(error)
    }

    const onData = (chunk: Buffer) => {
      buffer += chunk.toString("utf8")
      const lines = buffer.split(/\r?\n/).filter(Boolean)
      const lastLine = lines[lines.length - 1]

      if (/^\d{3}\s/.test(lastLine || "")) {
        cleanup()
        resolve(buffer)
      }
    }

    socket.on("data", onData)
    socket.on("error", onError)
  })

const sendSmtpCommand = async (
  socket: tls.TLSSocket,
  command: string,
  expectedPrefix: string | string[]
) => {
  socket.write(`${command}\r\n`)
  const response = await readSmtpResponse(socket)
  const prefixes = Array.isArray(expectedPrefix)
    ? expectedPrefix
    : [expectedPrefix]

  if (!prefixes.some((prefix) => response.startsWith(prefix))) {
    throw new Error(`SMTP command failed: ${response.trim()}`)
  }

  return response
}

const createMessage = (
  config: MailConfig,
  { to, subject, html, text, replyTo }: SendEmailInput
) => {
  const boundary = `shreem-${Date.now()}-${Math.random()
    .toString(16)
    .slice(2)}`
  const alternativeBoundary = `${boundary}-alt`
  const logoAttachment = getLogoAttachment()
  const htmlWithLogo = html.replaceAll(
    LOGO_SRC_TOKEN,
    logoAttachment ? `cid:${logoAttachment.contentId}` : getLogoUrl()
  )
  const from = `${encodeHeader(config.fromName)} <${config.from}>`
  const safeReplyTo = replyTo || config.replyTo

  if (logoAttachment) {
    return normalizeLineEndings(`From: ${from}
To: ${to}
Reply-To: ${safeReplyTo}
Subject: ${encodeHeader(subject)}
MIME-Version: 1.0
Content-Type: multipart/related; boundary="${boundary}"

--${boundary}
Content-Type: multipart/alternative; boundary="${alternativeBoundary}"

--${alternativeBoundary}
Content-Type: text/plain; charset="UTF-8"
Content-Transfer-Encoding: 8bit

${text}

--${alternativeBoundary}
Content-Type: text/html; charset="UTF-8"
Content-Transfer-Encoding: 8bit

${htmlWithLogo}

--${alternativeBoundary}--

--${boundary}
Content-Type: ${logoAttachment.contentType}; name="${logoAttachment.filename}"
Content-Transfer-Encoding: base64
Content-ID: <${logoAttachment.contentId}>
Content-Disposition: inline; filename="${logoAttachment.filename}"

${logoAttachment.contentBase64}

--${boundary}--`)
  }

  return normalizeLineEndings(`From: ${from}
To: ${to}
Reply-To: ${safeReplyTo}
Subject: ${encodeHeader(subject)}
MIME-Version: 1.0
Content-Type: multipart/alternative; boundary="${boundary}"

--${boundary}
Content-Type: text/plain; charset="UTF-8"
Content-Transfer-Encoding: 8bit

${text}

--${boundary}
Content-Type: text/html; charset="UTF-8"
Content-Transfer-Encoding: 8bit

${htmlWithLogo}

--${boundary}--`)
}

export const sendShreemEmail = async (input: SendEmailInput) => {
  const config = getMailConfig()

  if (!config.secure) {
    throw new Error("Only secure SMTP over TLS is enabled for Shreem emails.")
  }

  const socket = tls.connect({
    host: config.host,
    port: config.port,
    servername: config.host,
  })

  await new Promise<void>((resolve, reject) => {
    socket.once("secureConnect", () => resolve())
    socket.once("error", reject)
  })

  try {
    await readSmtpResponse(socket)
    await sendSmtpCommand(socket, `EHLO ${config.host}`, "250")
    await sendSmtpCommand(
      socket,
      `AUTH PLAIN ${Buffer.from(
        `\u0000${config.user}\u0000${config.pass}`,
        "utf8"
      ).toString("base64")}`,
      "235"
    )
    await sendSmtpCommand(socket, `MAIL FROM:<${config.from}>`, "250")
    await sendSmtpCommand(socket, `RCPT TO:<${input.to}>`, ["250", "251"])
    await sendSmtpCommand(socket, "DATA", "354")
    socket.write(`${createMessage(config, input)}\r\n.\r\n`)
    const dataResponse = await readSmtpResponse(socket)

    if (!dataResponse.startsWith("250")) {
      throw new Error(`SMTP DATA failed: ${dataResponse.trim()}`)
    }

    await sendSmtpCommand(socket, "QUIT", "221").catch(() => undefined)
  } finally {
    socket.end()
  }
}

const getLogoUrl = () =>
  process.env.SHREEM_LOGO_URL ||
  `${(process.env.SHREEM_SITE_URL || "https://shreemfarms.in").replace(
    /\/$/,
    ""
  )}/logo.jpeg`

const baseEmail = ({
  title,
  intro,
  actionUrl,
  actionLabel,
  note,
}: {
  title: string
  intro: string
  actionUrl: string
  actionLabel: string
  note: string
}) => {
  const text = `${title}\n\n${intro}\n\n${actionLabel}: ${actionUrl}\n\n${note}\n\nShreem Farms`
  const html = `
    <div style="margin:0;background:#f5efdf;padding:32px 14px;font-family:Arial,Helvetica,sans-serif;color:#092636">
      <div style="max-width:640px;margin:0 auto;background:#fffdf7;border:1px solid #ead7a7;border-radius:28px;overflow:hidden;box-shadow:0 24px 70px rgba(9,38,54,.12)">
        <div style="padding:30px;background:linear-gradient(135deg,#083848 0%,#0d817e 62%,#5a341b 100%);color:#fff">
          <div style="display:flex;align-items:center;gap:14px">
            <img src="${LOGO_SRC_TOKEN}" alt="Shreem Farms" width="64" height="64" style="display:block;width:64px;height:64px;object-fit:contain;border-radius:18px;background:rgba(255,255,255,.12);border:1px solid rgba(255,255,255,.18);padding:6px" />
            <div>
              <p style="margin:0 0 7px;letter-spacing:.24em;text-transform:uppercase;color:#f6d36b;font-size:11px;font-weight:700">Shreem Farms</p>
              <p style="margin:0;color:rgba(255,255,255,.74);font-size:13px;line-height:1.5">Desi-cow products, ritual living, and guided care</p>
            </div>
          </div>
          <h1 style="margin:26px 0 0;font-family:Georgia,'Times New Roman',serif;font-size:34px;line-height:1.05;font-weight:700;letter-spacing:0">${title}</h1>
        </div>
        <div style="padding:30px">
          <p style="font-size:16px;line-height:1.75;margin:0 0 24px;color:#385965">${intro}</p>
          <a href="${actionUrl}" style="display:inline-block;background:linear-gradient(135deg,#0d817e,#123f63);color:#fff;text-decoration:none;padding:15px 24px;border-radius:999px;font-weight:700;box-shadow:0 14px 28px rgba(13,129,126,.22)">${actionLabel}</a>
          <p style="font-size:13px;line-height:1.75;color:#60737b;margin:26px 0 0">${note}</p>
          <div style="margin-top:26px;padding-top:18px;border-top:1px solid #eadfcb;color:#8a6a2e;font-size:12px;line-height:1.6">
            Shreem Cow Products · Bilona ghee · Neem dhoop · Jeevamrut · Natural care
          </div>
        </div>
      </div>
    </div>`

  return { html, text }
}

export const buildVerificationEmail = (actionUrl: string) =>
  baseEmail({
    title: "Verify your Shreem account",
    intro:
      "Please confirm this email address so your Shreem Farms account, order history, AI usage history, and checkout details stay protected.",
    actionUrl,
    actionLabel: "Verify email",
    note: "This verification link expires in 24 hours. If you did not create a Shreem account, you can ignore this email.",
  })

export const buildPasswordResetEmail = (actionUrl: string) =>
  baseEmail({
    title: "Reset your Shreem password",
    intro:
      "We received a request to reset your Shreem Farms account password. Use the secure link below to choose a new password.",
    actionUrl,
    actionLabel: "Reset password",
    note: "This reset link expires in 15 minutes. If you did not request it, your password has not been changed.",
  })

export const buildMailTestEmail = (actionUrl: string) =>
  baseEmail({
    title: "Shreem mail server is ready",
    intro:
      "This is a live test from the Shreem Farms admin panel. Gmail SMTP is connected, branded templates are rendering, and customer auth emails can now be delivered from the official Shreem mailbox.",
    actionUrl,
    actionLabel: "Open Shreem Farms",
    note: "If this arrived in your inbox, the production mail credentials are working. Keep the Gmail App Password private and never commit it to Git.",
  })

export const buildOrderStatusEmail = ({
  title,
  intro,
  orderUrl,
  note,
  actionLabel = "View order",
}: {
  title: string
  intro: string
  orderUrl: string
  note: string
  actionLabel?: string
}) =>
  baseEmail({
    title,
    intro,
    actionUrl: orderUrl,
    actionLabel,
    note,
  })

export const buildCustomerOrderPlacedEmail = ({
  order,
  orderUrl,
}: {
  order: any
  orderUrl: string
}) => {
  const displayId = order?.display_id ? `#${order.display_id}` : order?.id || "your order"
  const rawTotal = Number(order?.total || 0)
  const currency = String(order?.currency_code || "INR").toUpperCase()
  const total = new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency,
  }).format(rawTotal / 100)
  const items = Array.isArray(order?.items) ? order.items : []
  const itemSummary = items
    .map((item: any) => `${item?.quantity || 1} x ${item?.title || item?.product_title || "Item"}`)
    .join(", ")

  return baseEmail({
    title: `Payment received for ${displayId}`,
    intro: `Thank you for ordering from Shreem Farms. We have received your payment of ${total}. ${
      itemSummary ? `Your order contains ${itemSummary}. ` : ""
    }You can track the order from your account.`,
    actionUrl: orderUrl,
    actionLabel: "Open order",
    note:
      "For physical products, dispatch details will be updated after packing. Digital AI credits and plans are activated automatically after successful order completion.",
  })
}

export const buildAiWalletActivatedEmail = ({
  credits,
  balance,
  plan,
  planExpiresAt,
  accountUrl,
}: {
  credits: number
  balance: number
  plan?: string | null
  planExpiresAt?: string | Date | null
  accountUrl: string
}) => {
  const hasPlan = Boolean(plan && plan !== "free")
  const expiry = planExpiresAt
    ? new Intl.DateTimeFormat("en-IN", {
        dateStyle: "medium",
        timeZone: "Asia/Kolkata",
      }).format(new Date(planExpiresAt))
    : ""

  return baseEmail({
    title: hasPlan ? "Your Shreem AI plan is active" : "Your AI credits are ready",
    intro: hasPlan
      ? `Your ${plan} AI Jyotish plan is active${expiry ? ` until ${expiry}` : ""}. ${
          credits ? `${credits} credits were also added. ` : ""
        }Your current wallet balance is ${balance} credits.`
      : `${credits} AI Jyotish credit${credits === 1 ? "" : "s"} were added to your wallet. Your current balance is ${balance} credits.`,
    actionUrl: accountUrl,
    actionLabel: "Open AI wallet",
    note:
      "Credits are consumed only after a successful AI reading. Failed AI generations should not reduce the wallet balance.",
  })
}

const escapeHtml = (value: unknown) =>
  String(value ?? "").replace(/[&<>"']/g, (char) => {
    const entities: Record<string, string> = {
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#039;",
    }

    return entities[char] || char
  })

export const buildStakeholderOrderEmail = ({
  order,
  adminOrderUrl,
  storefrontOrderUrl,
}: {
  order: any
  adminOrderUrl: string
  storefrontOrderUrl: string
}) => {
  const displayId = order?.display_id ? `#${order.display_id}` : order?.id || "new order"
  const items = Array.isArray(order?.items) ? order.items : []
  const itemLines = items
    .map((item: any) => {
      const quantity = item?.quantity || 1
      const title = item?.title || item?.product_title || "Item"

      return `${quantity} x ${title}`
    })
    .join("\n")
  const itemRows = items
    .map((item: any) => {
      const quantity = item?.quantity || 1
      const title = item?.title || item?.product_title || "Item"

      return `<tr><td style="padding:10px;border-bottom:1px solid #eadfcb">${escapeHtml(
        title
      )}</td><td style="padding:10px;border-bottom:1px solid #eadfcb;text-align:right">${escapeHtml(
        quantity
      )}</td></tr>`
    })
    .join("")
  const shippingAddress = order?.shipping_address
  const address = shippingAddress
    ? [
        `${shippingAddress.first_name || ""} ${shippingAddress.last_name || ""}`.trim(),
        shippingAddress.address_1,
        shippingAddress.address_2,
        shippingAddress.city,
        shippingAddress.province,
        shippingAddress.postal_code,
        shippingAddress.country_code,
        shippingAddress.phone,
      ]
        .filter(Boolean)
        .join(", ")
    : "No shipping address found."
  const rawTotal = Number(order?.total || 0)
  const currency = String(order?.currency_code || "INR").toUpperCase()
  const total = new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency,
  }).format(rawTotal / 100)

  const text = `New Shreem order ${displayId}

Customer: ${order?.email || "No email"}
Total: ${total}
Items:
${itemLines || "No items found"}

Shipping:
${address}

Admin order: ${adminOrderUrl}
Customer order: ${storefrontOrderUrl}
`

  const html = `
    <div style="margin:0;background:#f5efdf;padding:32px 14px;font-family:Arial,Helvetica,sans-serif;color:#092636">
      <div style="max-width:720px;margin:0 auto;background:#fffdf7;border:1px solid #ead7a7;border-radius:24px;overflow:hidden">
        <div style="padding:26px;background:linear-gradient(135deg,#083848 0%,#0d817e 62%,#5a341b 100%);color:#fff">
          <p style="margin:0 0 8px;letter-spacing:.22em;text-transform:uppercase;color:#f6d36b;font-size:11px;font-weight:700">New Shreem order</p>
          <h1 style="margin:0;font-family:Georgia,'Times New Roman',serif;font-size:32px">${escapeHtml(
            displayId
          )}</h1>
        </div>
        <div style="padding:26px">
          <p style="margin:0 0 10px;font-size:15px;line-height:1.6"><strong>Customer:</strong> ${escapeHtml(
            order?.email || "No email"
          )}</p>
          <p style="margin:0 0 18px;font-size:15px;line-height:1.6"><strong>Total:</strong> ${escapeHtml(
            total
          )}</p>
          <h2 style="font-size:16px;margin:24px 0 8px;color:#7a5412">Items</h2>
          <table style="width:100%;border-collapse:collapse;background:#fff;border:1px solid #eadfcb">
            <thead><tr><th style="padding:10px;text-align:left;background:#fff4d8;color:#7a5412">Item</th><th style="padding:10px;text-align:right;background:#fff4d8;color:#7a5412">Qty</th></tr></thead>
            <tbody>${itemRows || `<tr><td colspan="2" style="padding:10px">No items found.</td></tr>`}</tbody>
          </table>
          <h2 style="font-size:16px;margin:24px 0 8px;color:#7a5412">Shipping</h2>
          <p style="margin:0 0 20px;font-size:14px;line-height:1.7;color:#385965">${escapeHtml(
            address
          )}</p>
          <a href="${adminOrderUrl}" style="display:inline-block;background:linear-gradient(135deg,#0d817e,#123f63);color:#fff;text-decoration:none;padding:13px 20px;border-radius:999px;font-weight:700">Open order in admin</a>
          <p style="margin:18px 0 0;font-size:12px;color:#60737b">Customer order URL: <a href="${storefrontOrderUrl}">${storefrontOrderUrl}</a></p>
        </div>
      </div>
    </div>`

  return {
    subject: `New Shreem order ${displayId}`,
    text,
    html,
  }
}
