import crypto from "node:crypto"
import { Client } from "pg"

const getClient = () =>
  new Client({
    connectionString: process.env.DATABASE_URL,
  })

const getSecret = () =>
  crypto
    .createHash("sha256")
    .update(
      process.env.MARKETING_CONFIG_SECRET ||
        process.env.JWT_SECRET ||
        process.env.COOKIE_SECRET ||
        "shreem-marketing-config"
    )
    .digest()

const encrypt = (value: string) => {
  if (!value) {
    return ""
  }

  const iv = crypto.randomBytes(12)
  const cipher = crypto.createCipheriv("aes-256-gcm", getSecret(), iv)
  const encrypted = Buffer.concat([cipher.update(value, "utf8"), cipher.final()])
  const tag = cipher.getAuthTag()

  return `${iv.toString("base64")}:${tag.toString("base64")}:${encrypted.toString("base64")}`
}

const decrypt = (value: string) => {
  if (!value) {
    return ""
  }

  try {
    const [iv, tag, encrypted] = value.split(":").map((part) => Buffer.from(part, "base64"))
    const decipher = crypto.createDecipheriv("aes-256-gcm", getSecret(), iv)
    decipher.setAuthTag(tag)

    return Buffer.concat([decipher.update(encrypted), decipher.final()]).toString("utf8")
  } catch {
    return ""
  }
}

const ensureMarketingConfigTable = async (client: Client) => {
  await client.query(`
    CREATE TABLE IF NOT EXISTS admin_marketing_config (
      id text PRIMARY KEY DEFAULT 'default',
      meta_ad_account_id text NULL,
      meta_access_token_encrypted text NULL,
      google_ads_customer_id text NULL,
      google_ads_token_encrypted text NULL,
      daily_budget_inr numeric NOT NULL DEFAULT 0,
      monthly_budget_inr numeric NOT NULL DEFAULT 0,
      google_daily_budget_inr numeric NOT NULL DEFAULT 0,
      meta_daily_budget_inr numeric NOT NULL DEFAULT 0,
      max_cac_inr numeric NOT NULL DEFAULT 0,
      target_roas numeric NOT NULL DEFAULT 0,
      objective text NOT NULL DEFAULT 'sales',
      creative_focus text NOT NULL DEFAULT 'a2_ghee',
      target_product_handle text NULL,
      ai_targeting_enabled boolean NOT NULL DEFAULT true,
      content_approval_required boolean NOT NULL DEFAULT true,
      reels_per_week int NOT NULL DEFAULT 4,
      engagement_mode text NOT NULL DEFAULT 'manual_review',
      is_enabled boolean NOT NULL DEFAULT false,
      updated_at timestamptz NOT NULL DEFAULT now()
    )
  `)

  await client.query(`
    ALTER TABLE admin_marketing_config
      ADD COLUMN IF NOT EXISTS google_ads_customer_id text NULL,
      ADD COLUMN IF NOT EXISTS google_ads_token_encrypted text NULL,
      ADD COLUMN IF NOT EXISTS google_daily_budget_inr numeric NOT NULL DEFAULT 0,
      ADD COLUMN IF NOT EXISTS meta_daily_budget_inr numeric NOT NULL DEFAULT 0,
      ADD COLUMN IF NOT EXISTS max_cac_inr numeric NOT NULL DEFAULT 0,
      ADD COLUMN IF NOT EXISTS target_roas numeric NOT NULL DEFAULT 0,
      ADD COLUMN IF NOT EXISTS creative_focus text NOT NULL DEFAULT 'a2_ghee',
      ADD COLUMN IF NOT EXISTS target_product_handle text NULL,
      ADD COLUMN IF NOT EXISTS ai_targeting_enabled boolean NOT NULL DEFAULT true,
      ADD COLUMN IF NOT EXISTS content_approval_required boolean NOT NULL DEFAULT true,
      ADD COLUMN IF NOT EXISTS reels_per_week int NOT NULL DEFAULT 4,
      ADD COLUMN IF NOT EXISTS engagement_mode text NOT NULL DEFAULT 'manual_review'
  `)
}

export const getMarketingConfig = async () => {
  const client = getClient()

  await client.connect()

  try {
    await ensureMarketingConfigTable(client)

    const result = await client.query(`
      SELECT *
      FROM admin_marketing_config
      WHERE id = 'default'
      LIMIT 1
    `)
    const row = result.rows[0]

    if (!row) {
      return {
        meta_ad_account_id: "",
        has_meta_access_token: false,
        google_ads_customer_id: "",
        has_google_ads_token: false,
        daily_budget_inr: 0,
        monthly_budget_inr: 0,
        google_daily_budget_inr: 0,
        meta_daily_budget_inr: 0,
        max_cac_inr: 0,
        target_roas: 0,
        objective: "sales",
        creative_focus: "a2_ghee",
        target_product_handle: "",
        ai_targeting_enabled: true,
        content_approval_required: true,
        reels_per_week: 4,
        engagement_mode: "manual_review",
        is_enabled: false,
      }
    }

    return {
      meta_ad_account_id: row.meta_ad_account_id || "",
      has_meta_access_token: Boolean(decrypt(row.meta_access_token_encrypted || "")),
      google_ads_customer_id: row.google_ads_customer_id || "",
      has_google_ads_token: Boolean(decrypt(row.google_ads_token_encrypted || "")),
      daily_budget_inr: Number(row.daily_budget_inr || 0),
      monthly_budget_inr: Number(row.monthly_budget_inr || 0),
      google_daily_budget_inr: Number(row.google_daily_budget_inr || 0),
      meta_daily_budget_inr: Number(row.meta_daily_budget_inr || 0),
      max_cac_inr: Number(row.max_cac_inr || 0),
      target_roas: Number(row.target_roas || 0),
      objective: row.objective || "sales",
      creative_focus: row.creative_focus || "a2_ghee",
      target_product_handle: row.target_product_handle || "",
      ai_targeting_enabled: Boolean(row.ai_targeting_enabled),
      content_approval_required: Boolean(row.content_approval_required),
      reels_per_week: Number(row.reels_per_week || 4),
      engagement_mode: row.engagement_mode || "manual_review",
      is_enabled: Boolean(row.is_enabled),
      updated_at: row.updated_at,
    }
  } finally {
    await client.end().catch(() => undefined)
  }
}

export const saveMarketingConfig = async (input: {
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
}) => {
  const client = getClient()

  await client.connect()

  try {
    await ensureMarketingConfigTable(client)

    const current = await client.query(`
      SELECT meta_access_token_encrypted, google_ads_token_encrypted
      FROM admin_marketing_config
      WHERE id = 'default'
      LIMIT 1
    `)
    const existingToken = current.rows[0]?.meta_access_token_encrypted || ""
    const existingGoogleToken = current.rows[0]?.google_ads_token_encrypted || ""
    const token =
      typeof input.meta_access_token === "string" && input.meta_access_token.trim()
        ? encrypt(input.meta_access_token.trim())
        : existingToken
    const googleToken =
      typeof input.google_ads_token === "string" && input.google_ads_token.trim()
        ? encrypt(input.google_ads_token.trim())
        : existingGoogleToken

    await client.query(
      `
      INSERT INTO admin_marketing_config (
        id,
        meta_ad_account_id,
        meta_access_token_encrypted,
        google_ads_customer_id,
        google_ads_token_encrypted,
        daily_budget_inr,
        monthly_budget_inr,
        google_daily_budget_inr,
        meta_daily_budget_inr,
        max_cac_inr,
        target_roas,
        objective,
        creative_focus,
        target_product_handle,
        ai_targeting_enabled,
        content_approval_required,
        reels_per_week,
        engagement_mode,
        is_enabled,
        updated_at
      )
      VALUES ('default', $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, now())
      ON CONFLICT (id) DO UPDATE SET
        meta_ad_account_id = EXCLUDED.meta_ad_account_id,
        meta_access_token_encrypted = EXCLUDED.meta_access_token_encrypted,
        google_ads_customer_id = EXCLUDED.google_ads_customer_id,
        google_ads_token_encrypted = EXCLUDED.google_ads_token_encrypted,
        daily_budget_inr = EXCLUDED.daily_budget_inr,
        monthly_budget_inr = EXCLUDED.monthly_budget_inr,
        google_daily_budget_inr = EXCLUDED.google_daily_budget_inr,
        meta_daily_budget_inr = EXCLUDED.meta_daily_budget_inr,
        max_cac_inr = EXCLUDED.max_cac_inr,
        target_roas = EXCLUDED.target_roas,
        objective = EXCLUDED.objective,
        creative_focus = EXCLUDED.creative_focus,
        target_product_handle = EXCLUDED.target_product_handle,
        ai_targeting_enabled = EXCLUDED.ai_targeting_enabled,
        content_approval_required = EXCLUDED.content_approval_required,
        reels_per_week = EXCLUDED.reels_per_week,
        engagement_mode = EXCLUDED.engagement_mode,
        is_enabled = EXCLUDED.is_enabled,
        updated_at = now()
      `,
      [
        String(input.meta_ad_account_id || "").trim(),
        token,
        String(input.google_ads_customer_id || "").trim(),
        googleToken,
        Math.max(Number(input.daily_budget_inr || 0), 0),
        Math.max(Number(input.monthly_budget_inr || 0), 0),
        Math.max(Number(input.google_daily_budget_inr || 0), 0),
        Math.max(Number(input.meta_daily_budget_inr || 0), 0),
        Math.max(Number(input.max_cac_inr || 0), 0),
        Math.max(Number(input.target_roas || 0), 0),
        String(input.objective || "sales").slice(0, 80),
        String(input.creative_focus || "a2_ghee").slice(0, 120),
        String(input.target_product_handle || "").slice(0, 180),
        input.ai_targeting_enabled !== false,
        input.content_approval_required !== false,
        Math.min(Math.max(Math.floor(Number(input.reels_per_week || 4)), 0), 21),
        String(input.engagement_mode || "manual_review").slice(0, 80),
        Boolean(input.is_enabled),
      ]
    )

    return getMarketingConfig()
  } finally {
    await client.end().catch(() => undefined)
  }
}
