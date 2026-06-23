import {
  AuthenticatedMedusaRequest,
  MedusaResponse,
} from "@medusajs/framework/http"

import {
  getMarketingConfig,
  saveMarketingConfig,
} from "../../../lib/admin-marketing"

const isAdminRequest = (req: any) => {
  const authContext = req.auth_context || req.authContext || {}

  return (
    authContext.actor_type === "user" ||
    authContext.actorType === "user" ||
    Boolean(authContext.user_id) ||
    Boolean(authContext.userId) ||
    Boolean(authContext.actor_id) ||
    Boolean(authContext.actorId) ||
    Boolean(req.user?.id)
  )
}

const setNoStore = (res: MedusaResponse) => {
  res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate")
  res.setHeader("Pragma", "no-cache")
  res.setHeader("Expires", "0")
}

export const GET = async (
  req: AuthenticatedMedusaRequest,
  res: MedusaResponse
) => {
  setNoStore(res)

  if (!isAdminRequest(req)) {
    return res.status(401).json({
      message: "Admin authentication is required.",
    })
  }

  return res.json(await getMarketingConfig())
}

export const POST = async (
  req: AuthenticatedMedusaRequest<{
    meta_ad_account_id?: string
    meta_access_token?: string
    google_ads_customer_id?: string
    google_ads_token?: string
    daily_budget_inr?: number
    monthly_budget_inr?: number
    google_daily_budget_inr?: number
    meta_daily_budget_inr?: number
    max_cac_inr?: number
    target_roas?: number
    objective?: string
    creative_focus?: string
    target_product_handle?: string
    ai_targeting_enabled?: boolean
    content_approval_required?: boolean
    reels_per_week?: number
    engagement_mode?: string
    is_enabled?: boolean
  }>,
  res: MedusaResponse
) => {
  setNoStore(res)

  if (!isAdminRequest(req)) {
    return res.status(401).json({
      message: "Admin authentication is required.",
    })
  }

  return res.json(await saveMarketingConfig(req.body || {}))
}
