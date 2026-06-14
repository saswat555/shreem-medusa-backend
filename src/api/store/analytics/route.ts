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
      metadata: body.metadata || {},
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
