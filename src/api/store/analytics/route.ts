import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"

import { recordSiteAnalyticsEvent } from "../../../lib/site-analytics"

type Body = {
  event_type?: string
  path?: string
  title?: string
  referrer?: string
  session_id?: string
  customer_id?: string
  customer_email?: string
  is_logged_in?: boolean
  metadata?: Record<string, unknown>
}

const getIp = (req: MedusaRequest) =>
  String(
    req.headers["cf-connecting-ip"] ||
      req.headers["x-forwarded-for"] ||
      req.socket?.remoteAddress ||
      ""
  )
    .split(",")[0]
    .trim()

const getHeader = (req: MedusaRequest, key: string) =>
  String(req.headers[key.toLowerCase()] || req.headers[key] || "").trim()

const decodeHeaderValue = (value: string) => {
  try {
    return decodeURIComponent(value.replace(/\+/g, " "))
  } catch {
    return value
  }
}

const getRequestLocation = (req: MedusaRequest) => ({
  country: getHeader(req, "cf-ipcountry") || getHeader(req, "x-vercel-ip-country"),
  region: decodeHeaderValue(
    getHeader(req, "cf-region") ||
      getHeader(req, "cf-region-code") ||
      getHeader(req, "x-vercel-ip-country-region")
  ),
  city: decodeHeaderValue(
    getHeader(req, "cf-ipcity") ||
      getHeader(req, "cf-city") ||
      getHeader(req, "x-vercel-ip-city")
  ),
  postal_code:
    getHeader(req, "cf-postal-code") || getHeader(req, "x-vercel-ip-postal-code"),
  timezone: getHeader(req, "cf-timezone") || getHeader(req, "x-vercel-ip-timezone"),
  latitude:
    getHeader(req, "cf-iplatitude") ||
    getHeader(req, "cf-latitude") ||
    getHeader(req, "x-vercel-ip-latitude"),
  longitude:
    getHeader(req, "cf-iplongitude") ||
    getHeader(req, "cf-longitude") ||
    getHeader(req, "x-vercel-ip-longitude"),
  colo: getHeader(req, "cf-ray").split("-")[1] || "",
})

const getReferrerHost = (referrer?: string) => {
  try {
    return referrer ? new URL(referrer).hostname : ""
  } catch {
    return ""
  }
}

const getTrafficSource = (body: Body) => {
  const metadata = body.metadata || {}
  const attribution = (metadata.attribution || {}) as Record<string, any>
  const utm = (attribution.utm || {}) as Record<string, any>

  if (utm.utm_source) {
    return String(utm.utm_source).slice(0, 120)
  }

  const host = getReferrerHost(body.referrer)

  if (!host) {
    return "direct"
  }

  if (host.includes("google")) {
    return "google"
  }

  if (host.includes("instagram")) {
    return "instagram"
  }

  if (host.includes("facebook") || host.includes("fb.")) {
    return "facebook"
  }

  if (host.includes("youtube")) {
    return "youtube"
  }

  return host
}

export const POST = async (req: MedusaRequest<Body>, res: MedusaResponse) => {
  try {
    const body = req.body || {}

    if (!body.path) {
      return res.status(400).json({
        ok: false,
        message: "path is required.",
      })
    }

    const event = await recordSiteAnalyticsEvent({
      event_type: body.event_type || "page_view",
      path: body.path,
      title: body.title || null,
      referrer: body.referrer || null,
      session_id: body.session_id || null,
      customer_id: body.customer_id || null,
      customer_email: body.customer_email || null,
      is_logged_in: Boolean(body.is_logged_in),
      user_agent: String(req.headers["user-agent"] || ""),
      ip_address: getIp(req),
      metadata: {
        ...(body.metadata || {}),
        request_location: getRequestLocation(req),
        referrer_host: getReferrerHost(body.referrer),
        traffic_source: getTrafficSource(body),
      },
    })

    return res.status(201).json({
      ok: true,
      id: event.id,
      created_at: event.created_at,
    })
  } catch (error: any) {
    console.error("[site-analytics] record failed", {
      message: error?.message,
    })

    return res.status(500).json({
      ok: false,
      message: "Unable to record analytics event.",
    })
  }
}
