import {
  randomUUID,
  createHash,
  randomBytes,
  pbkdf2Sync,
  timingSafeEqual,
} from "node:crypto"
import { Client } from "pg"

export type GemstoneVendorInput = {
  id?: string
  name?: string
  handle?: string
  contact_email?: string
  contact_phone?: string
  city?: string
  state?: string
  bio?: string
  trust_notes?: string
  banner_url?: string
  logo_url?: string
  commission_rate_bps?: number
  active?: boolean
  vendor_token?: string
  metadata?: Record<string, unknown>
}

export type GemstoneProductInput = {
  id?: string
  vendor_id?: string
  medusa_variant_id?: string
  medusa_product_id?: string
  title?: string
  handle?: string
  stone_name?: string
  planet?: string
  rashi?: string
  metal?: string
  item_type?: string
  cut?: string
  origin?: string
  treatment?: string
  certification?: string
  quality_grade?: string
  color_grade?: string
  clarity?: string
  shape?: string
  sku?: string
  lot_number?: string
  purpose?: string
  lab_report_url?: string
  variant_options?: GemstoneVariantOptionInput[]
  weight_carats?: number
  weight_ratti?: number
  size?: string
  price_inr?: number
  inventory_quantity?: number
  image_urls?: string[]
  description?: string
  recommendation_notes?: string
  active?: boolean
  metadata?: Record<string, unknown>
}

export type GemstoneVariantOptionInput = {
  id?: string
  label?: string
  medusa_variant_id?: string
  form?: string
  metal?: string
  size?: string
  quality_grade?: string
  weight_carats?: number
  weight_ratti?: number
  making_charge_inr?: number
  stone_price_inr?: number
  total_price_inr?: number
  inventory_quantity?: number
  active?: boolean
}

export type GemstoneVendorUserInput = {
  id?: string
  vendor_id?: string
  email?: string
  name?: string
  password?: string
  active?: boolean
}

const DEFAULT_COMMISSION_BPS = 2000
const VENDOR_SESSION_COOKIE = "shreem_gem_vendor_session"
const VENDOR_SESSION_DAYS = 14

const getClient = () =>
  new Client({
    connectionString: process.env.DATABASE_URL,
  })

const id = (prefix: string) => `${prefix}_${randomUUID().replace(/-/g, "")}`

const slugify = (value: unknown, fallback: string) =>
  String(value || fallback)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "")
    .slice(0, 96) || fallback

const sanitizeText = (value: unknown, max = 1200) =>
  typeof value === "string" ? value.trim().slice(0, max) : ""

const parseBoolean = (value: unknown, fallback = true) =>
  value === undefined ? fallback : value === true || value === "true" || value === 1

const parseNumber = (value: unknown, fallback = 0) => {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : fallback
}

const normalizeImages = (value: unknown) => {
  if (Array.isArray(value)) {
    return value.map((item) => sanitizeText(item, 1000)).filter(Boolean)
  }

  return String(value || "")
    .split(/[\n,]+/)
    .map((item) => item.trim())
    .filter(Boolean)
}

const normalizeVariantOptions = (value: unknown): GemstoneVariantOptionInput[] => {
  const rows = Array.isArray(value) ? value : []

  return rows
    .map((item: any, index) => {
      const form = sanitizeText(item?.form, 80)
      const metal = sanitizeText(item?.metal, 80)
      const size = sanitizeText(item?.size, 80)
      const quality = sanitizeText(item?.quality_grade, 120)
      const stonePrice = parseNumber(item?.stone_price_inr)
      const makingCharge = parseNumber(item?.making_charge_inr)
      const totalPrice = parseNumber(
        item?.total_price_inr || stonePrice + makingCharge
      )
      const label =
        sanitizeText(item?.label, 180) ||
        [form, metal, size ? `size ${size}` : "", quality]
          .filter(Boolean)
          .join(" · ") ||
        `Option ${index + 1}`

      return {
        id: sanitizeText(item?.id, 80) || id("gemopt"),
        label,
        medusa_variant_id: sanitizeText(item?.medusa_variant_id, 120),
        form,
        metal,
        size,
        quality_grade: quality,
        weight_carats: parseNumber(item?.weight_carats),
        weight_ratti: parseNumber(item?.weight_ratti),
        stone_price_inr: stonePrice,
        making_charge_inr: makingCharge,
        total_price_inr: totalPrice,
        inventory_quantity: Math.max(
          0,
          Math.trunc(parseNumber(item?.inventory_quantity))
        ),
        active: parseBoolean(item?.active, true),
      }
    })
    .filter((item) => item.label || item.medusa_variant_id)
}

const hashToken = (token: string) =>
  createHash("sha256")
    .update(`${process.env.JWT_SECRET || "shreem"}:${token}`)
    .digest("hex")

const normalizeEmail = (value: unknown) => sanitizeText(value, 180).toLowerCase()

const hashPassword = (password: string) => {
  const salt = randomBytes(16).toString("hex")
  const hash = pbkdf2Sync(password, salt, 160000, 32, "sha256").toString("hex")
  return `${salt}:${hash}`
}

const verifyPassword = (password: string, stored: string) => {
  const [salt, hash] = String(stored || "").split(":")

  if (!salt || !hash) {
    return false
  }

  const candidate = pbkdf2Sync(password, salt, 160000, 32, "sha256")
  const expected = Buffer.from(hash, "hex")

  return (
    candidate.length === expected.length && timingSafeEqual(candidate, expected)
  )
}

const sessionHash = (token: string) => hashToken(`vendor-session:${token}`)

export const getGemstoneVendorSessionCookieName = () => VENDOR_SESSION_COOKIE

export const ensureGemstoneMarketplaceTables = async (client: Client) => {
  await client.query(`
    create table if not exists gemstone_vendor (
      id text primary key,
      name text not null,
      handle text not null unique,
      contact_email text,
      contact_phone text,
      city text,
      state text,
      bio text,
      trust_notes text,
      banner_url text,
      logo_url text,
      commission_rate_bps integer not null default 2000,
      active boolean not null default true,
      vendor_token_hash text,
      metadata_json jsonb not null default '{}'::jsonb,
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now(),
      deleted_at timestamptz
    )
  `)

  await client.query(`
    create table if not exists gemstone_product (
      id text primary key,
      vendor_id text not null references gemstone_vendor(id),
      medusa_variant_id text,
      medusa_product_id text,
      title text not null,
      handle text not null unique,
      stone_name text not null,
      planet text,
      rashi text,
      metal text,
      item_type text,
      cut text,
      origin text,
      treatment text,
      certification text,
      quality_grade text,
      color_grade text,
      clarity text,
      shape text,
      sku text,
      lot_number text,
      purpose text,
      lab_report_url text,
      variant_options jsonb not null default '[]'::jsonb,
      weight_carats numeric,
      weight_ratti numeric,
      size text,
      price_inr numeric,
      inventory_quantity integer not null default 0,
      image_urls jsonb not null default '[]'::jsonb,
      description text,
      recommendation_notes text,
      active boolean not null default true,
      metadata_json jsonb not null default '{}'::jsonb,
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now(),
      deleted_at timestamptz
    )
  `)

  await client.query(`
    alter table gemstone_product
      add column if not exists quality_grade text,
      add column if not exists color_grade text,
      add column if not exists clarity text,
      add column if not exists shape text,
      add column if not exists sku text,
      add column if not exists lot_number text,
      add column if not exists purpose text,
      add column if not exists lab_report_url text,
      add column if not exists variant_options jsonb not null default '[]'::jsonb
  `)

  await client.query(`
    create table if not exists gemstone_vendor_commission (
      id text primary key,
      vendor_id text not null references gemstone_vendor(id),
      product_id text references gemstone_product(id),
      order_id text not null,
      order_display_id text,
      line_item_id text not null,
      customer_email text,
      quantity integer not null default 1,
      gross_amount_inr numeric not null default 0,
      commission_rate_bps integer not null default 2000,
      commission_amount_inr numeric not null default 0,
      vendor_amount_inr numeric not null default 0,
      payout_status text not null default 'pending',
      note text,
      metadata_json jsonb not null default '{}'::jsonb,
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now(),
      deleted_at timestamptz,
      unique(order_id, line_item_id)
    )
  `)

  await client.query(`
    create table if not exists gemstone_vendor_user (
      id text primary key,
      vendor_id text not null references gemstone_vendor(id),
      email text not null unique,
      name text,
      password_hash text not null,
      active boolean not null default true,
      last_login_at timestamptz,
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now(),
      deleted_at timestamptz
    )
  `)

  await client.query(`
    create table if not exists gemstone_vendor_session (
      id text primary key,
      vendor_user_id text not null references gemstone_vendor_user(id),
      session_hash text not null unique,
      expires_at timestamptz not null,
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now(),
      revoked_at timestamptz
    )
  `)
}

export const withGemstoneClient = async <T>(
  fn: (client: Client) => Promise<T>
) => {
  const client = getClient()
  await client.connect()

  try {
    await ensureGemstoneMarketplaceTables(client)
    return await fn(client)
  } finally {
    await client.end().catch(() => undefined)
  }
}

export const formatVendor = (row: any) => ({
  id: row.id,
  name: row.name,
  handle: row.handle,
  contact_email: row.contact_email || "",
  contact_phone: row.contact_phone || "",
  city: row.city || "",
  state: row.state || "",
  bio: row.bio || "",
  trust_notes: row.trust_notes || "",
  banner_url: row.banner_url || "",
  logo_url: row.logo_url || "",
  commission_rate_bps: Number(row.commission_rate_bps || DEFAULT_COMMISSION_BPS),
  commission_percent: Number(row.commission_rate_bps || DEFAULT_COMMISSION_BPS) / 100,
  active: row.active !== false,
  metadata: row.metadata_json || {},
  created_at: row.created_at,
  updated_at: row.updated_at,
})

export const formatGemstoneProduct = (row: any) => ({
  id: row.id,
  vendor_id: row.vendor_id,
  vendor_name: row.vendor_name || "",
  vendor_handle: row.vendor_handle || "",
  medusa_variant_id: row.medusa_variant_id || "",
  medusa_product_id: row.medusa_product_id || "",
  title: row.title,
  handle: row.handle,
  stone_name: row.stone_name,
  planet: row.planet || "",
  rashi: row.rashi || "",
  metal: row.metal || "",
  item_type: row.item_type || "",
  cut: row.cut || "",
  origin: row.origin || "",
  treatment: row.treatment || "",
  certification: row.certification || "",
  quality_grade: row.quality_grade || "",
  color_grade: row.color_grade || "",
  clarity: row.clarity || "",
  shape: row.shape || "",
  sku: row.sku || "",
  lot_number: row.lot_number || "",
  purpose: row.purpose || "",
  lab_report_url: row.lab_report_url || "",
  variant_options: Array.isArray(row.variant_options) ? row.variant_options : [],
  weight_carats: Number(row.weight_carats || 0),
  weight_ratti: Number(row.weight_ratti || 0),
  size: row.size || "",
  price_inr: Number(row.price_inr || 0),
  inventory_quantity: Number(row.inventory_quantity || 0),
  image_urls: Array.isArray(row.image_urls) ? row.image_urls : [],
  description: row.description || "",
  recommendation_notes: row.recommendation_notes || "",
  active: row.active !== false,
  metadata: row.metadata_json || {},
  created_at: row.created_at,
  updated_at: row.updated_at,
})

export const upsertGemstoneVendor = async (input: GemstoneVendorInput) =>
  withGemstoneClient(async (client) => {
    const vendorId = input.id || id("gemvend")
    const handle = slugify(input.handle || input.name, "gemstone-vendor")
    const tokenHash = input.vendor_token
      ? hashToken(String(input.vendor_token))
      : undefined

    const result = await client.query(
      `
        insert into gemstone_vendor (
          id, name, handle, contact_email, contact_phone, city, state, bio,
          trust_notes, banner_url, logo_url, commission_rate_bps, active,
          vendor_token_hash, metadata_json, created_at, updated_at
        )
        values (
          $1, $2, $3, $4, $5, $6, $7, $8,
          $9, $10, $11, $12, $13,
          $14, $15::jsonb, now(), now()
        )
        on conflict (id) do update set
          name = excluded.name,
          handle = excluded.handle,
          contact_email = excluded.contact_email,
          contact_phone = excluded.contact_phone,
          city = excluded.city,
          state = excluded.state,
          bio = excluded.bio,
          trust_notes = excluded.trust_notes,
          banner_url = excluded.banner_url,
          logo_url = excluded.logo_url,
          commission_rate_bps = excluded.commission_rate_bps,
          active = excluded.active,
          vendor_token_hash = coalesce(excluded.vendor_token_hash, gemstone_vendor.vendor_token_hash),
          metadata_json = excluded.metadata_json,
          updated_at = now()
        returning *
      `,
      [
        vendorId,
        sanitizeText(input.name, 180) || "Gemstone Vendor",
        handle,
        sanitizeText(input.contact_email, 180),
        sanitizeText(input.contact_phone, 80),
        sanitizeText(input.city, 120),
        sanitizeText(input.state, 120),
        sanitizeText(input.bio, 2400),
        sanitizeText(input.trust_notes, 1600),
        sanitizeText(input.banner_url, 1000),
        sanitizeText(input.logo_url, 1000),
        Math.max(0, Math.min(9000, Math.trunc(parseNumber(input.commission_rate_bps, DEFAULT_COMMISSION_BPS)))),
        parseBoolean(input.active, true),
        tokenHash || null,
        JSON.stringify(input.metadata || {}),
      ]
    )

    return formatVendor(result.rows[0])
  })

export const upsertGemstoneProduct = async (input: GemstoneProductInput) =>
  withGemstoneClient(async (client) => {
    if (!input.vendor_id) {
      throw new Error("Select a vendor before saving a gemstone product.")
    }

    const handle = slugify(input.handle || input.title || input.stone_name, "gemstone")
    const existingByHandle = !input.id
      ? await client.query(
          `
            select id
            from gemstone_product
            where vendor_id = $1
              and handle = $2
              and deleted_at is null
            limit 1
          `,
          [input.vendor_id, handle]
        )
      : null
    const productId = input.id || existingByHandle?.rows?.[0]?.id || id("gemprod")
    const result = await client.query(
      `
        insert into gemstone_product (
          id, vendor_id, medusa_variant_id, medusa_product_id, title, handle,
          stone_name, planet, rashi, metal, item_type, cut, origin, treatment,
          certification, quality_grade, color_grade, clarity, shape, sku,
          lot_number, purpose, lab_report_url, variant_options, weight_carats, weight_ratti, size, price_inr,
          inventory_quantity, image_urls, description, recommendation_notes,
          active, metadata_json, created_at, updated_at
        )
        values (
          $1, $2, $3, $4, $5, $6,
          $7, $8, $9, $10, $11, $12, $13, $14,
          $15, $16, $17, $18, $19, $20,
          $21, $22, $23, $24::jsonb, $25, $26, $27, $28,
          $29, $30::jsonb, $31, $32,
          $33, $34::jsonb, now(), now()
        )
        on conflict (id) do update set
          vendor_id = excluded.vendor_id,
          medusa_variant_id = excluded.medusa_variant_id,
          medusa_product_id = excluded.medusa_product_id,
          title = excluded.title,
          handle = excluded.handle,
          stone_name = excluded.stone_name,
          planet = excluded.planet,
          rashi = excluded.rashi,
          metal = excluded.metal,
          item_type = excluded.item_type,
          cut = excluded.cut,
          origin = excluded.origin,
          treatment = excluded.treatment,
          certification = excluded.certification,
          quality_grade = excluded.quality_grade,
          color_grade = excluded.color_grade,
          clarity = excluded.clarity,
          shape = excluded.shape,
          sku = excluded.sku,
          lot_number = excluded.lot_number,
          purpose = excluded.purpose,
          lab_report_url = excluded.lab_report_url,
          variant_options = excluded.variant_options,
          weight_carats = excluded.weight_carats,
          weight_ratti = excluded.weight_ratti,
          size = excluded.size,
          price_inr = excluded.price_inr,
          inventory_quantity = excluded.inventory_quantity,
          image_urls = excluded.image_urls,
          description = excluded.description,
          recommendation_notes = excluded.recommendation_notes,
          active = excluded.active,
          metadata_json = excluded.metadata_json,
          updated_at = now()
        returning *
      `,
      [
        productId,
        input.vendor_id,
        sanitizeText(input.medusa_variant_id, 120),
        sanitizeText(input.medusa_product_id, 120),
        sanitizeText(input.title, 240) || sanitizeText(input.stone_name, 180) || "Gemstone",
        handle,
        sanitizeText(input.stone_name, 160) || "Gemstone",
        sanitizeText(input.planet, 80),
        sanitizeText(input.rashi, 80),
        sanitizeText(input.metal, 160),
        sanitizeText(input.item_type, 160),
        sanitizeText(input.cut, 160),
        sanitizeText(input.origin, 160),
        sanitizeText(input.treatment, 160),
        sanitizeText(input.certification, 240),
        sanitizeText(input.quality_grade, 160),
        sanitizeText(input.color_grade, 160),
        sanitizeText(input.clarity, 160),
        sanitizeText(input.shape, 160),
        sanitizeText(input.sku, 160),
        sanitizeText(input.lot_number, 160),
        sanitizeText(input.purpose, 240),
        sanitizeText(input.lab_report_url, 1000),
        JSON.stringify(normalizeVariantOptions(input.variant_options)),
        parseNumber(input.weight_carats),
        parseNumber(input.weight_ratti),
        sanitizeText(input.size, 160),
        parseNumber(input.price_inr),
        Math.max(0, Math.trunc(parseNumber(input.inventory_quantity))),
        JSON.stringify(normalizeImages(input.image_urls)),
        sanitizeText(input.description, 3000),
        sanitizeText(input.recommendation_notes, 2000),
        parseBoolean(input.active, true),
        JSON.stringify(input.metadata || {}),
      ]
    )

    return formatGemstoneProduct(result.rows[0])
  })

export const listGemstoneVendors = async ({ publicOnly = false } = {}) =>
  withGemstoneClient(async (client) => {
    const result = await client.query(
      `
        select *
        from gemstone_vendor
        where deleted_at is null
          and ($1::boolean = false or active = true)
        order by active desc, updated_at desc
      `,
      [publicOnly]
    )

    return result.rows.map(formatVendor)
  })

export const listGemstoneProducts = async ({
  publicOnly = false,
  vendorHandle = "",
  stone = "",
}: {
  publicOnly?: boolean
  vendorHandle?: string
  stone?: string
} = {}) =>
  withGemstoneClient(async (client) => {
    const result = await client.query(
      `
        select gp.*, gv.name as vendor_name, gv.handle as vendor_handle
        from gemstone_product gp
        join gemstone_vendor gv on gv.id = gp.vendor_id
        where gp.deleted_at is null
          and gv.deleted_at is null
          and ($1::boolean = false or (gp.active = true and gv.active = true))
          and ($2::text = '' or gv.handle = $2::text)
          and (
            $3::text = ''
            or lower(gp.stone_name) like '%' || lower($3::text) || '%'
            or lower(gp.title) like '%' || lower($3::text) || '%'
            or lower(gp.planet) like '%' || lower($3::text) || '%'
            or lower(gp.rashi) like '%' || lower($3::text) || '%'
            or lower(gp.metal) like '%' || lower($3::text) || '%'
            or lower(gp.certification) like '%' || lower($3::text) || '%'
            or lower(gp.quality_grade) like '%' || lower($3::text) || '%'
            or lower(gp.color_grade) like '%' || lower($3::text) || '%'
            or lower(gp.clarity) like '%' || lower($3::text) || '%'
            or lower(gp.sku) like '%' || lower($3::text) || '%'
            or lower(gp.lot_number) like '%' || lower($3::text) || '%'
            or lower(gp.purpose) like '%' || lower($3::text) || '%'
            or lower(gp.variant_options::text) like '%' || lower($3::text) || '%'
          )
        order by gv.name asc, gp.active desc, gp.updated_at desc
      `,
      [publicOnly, vendorHandle, stone]
    )

    return result.rows.map(formatGemstoneProduct)
  })

export const listGemstoneCommissions = async () =>
  withGemstoneClient(async (client) => {
    const result = await client.query(`
      select gc.*, gv.name as vendor_name, gp.title as product_title
      from gemstone_vendor_commission gc
      join gemstone_vendor gv on gv.id = gc.vendor_id
      left join gemstone_product gp on gp.id = gc.product_id
      where gc.deleted_at is null
      order by gc.created_at desc
      limit 500
    `)

    return result.rows.map((row) => ({
      id: row.id,
      vendor_id: row.vendor_id,
      vendor_name: row.vendor_name,
      product_id: row.product_id,
      product_title: row.product_title || "",
      order_id: row.order_id,
      order_display_id: row.order_display_id || "",
      line_item_id: row.line_item_id,
      customer_email: row.customer_email || "",
      quantity: Number(row.quantity || 0),
      gross_amount_inr: Number(row.gross_amount_inr || 0),
      commission_rate_bps: Number(row.commission_rate_bps || DEFAULT_COMMISSION_BPS),
      commission_amount_inr: Number(row.commission_amount_inr || 0),
      vendor_amount_inr: Number(row.vendor_amount_inr || 0),
      payout_status: row.payout_status || "pending",
      note: row.note || "",
      metadata: row.metadata_json || {},
      created_at: row.created_at,
      updated_at: row.updated_at,
    }))
  })

export const updateGemstoneCommissionPayout = async ({
  id: commissionId,
  payout_status,
  note,
}: {
  id: string
  payout_status?: string
  note?: string
}) =>
  withGemstoneClient(async (client) => {
    const result = await client.query(
      `
        update gemstone_vendor_commission
        set
          payout_status = coalesce(nullif($2::text, ''), payout_status),
          note = coalesce($3::text, note),
          updated_at = now()
        where id = $1
          and deleted_at is null
        returning *
      `,
      [commissionId, sanitizeText(payout_status, 80), sanitizeText(note, 600)]
    )

    return result.rows[0] || null
  })

export const seedRatnaSagarVendor = async () =>
  upsertGemstoneVendor({
    name: "Ratna Sagar",
    handle: "ratna-sagar",
    city: "Rewa",
    state: "Madhya Pradesh",
    bio: "Ratna Sagar gemstone partner for Shreem Jyotish recommendations. Add certified stones, rings, pendants and metal options here before promoting products live.",
    trust_notes:
      "Vendor must upload clear stone images, certificate details, weight, metal, size and treatment notes before products are made active.",
    commission_rate_bps: DEFAULT_COMMISSION_BPS,
    active: true,
  })

export const recordGemstoneCommissionForOrder = async ({
  order,
}: {
  order: any
}) =>
  withGemstoneClient(async (client) => {
    const lines = Array.isArray(order?.items) ? order.items : []

    if (!order?.id || !lines.length) {
      return []
    }

    const recorded: any[] = []

    for (const line of lines) {
      const variantId =
        line?.variant_id ||
        line?.variant?.id ||
        line?.metadata?.variant_id ||
        ""

      if (!variantId) {
        continue
      }

      const productResult = await client.query(
        `
          select gp.*, gv.commission_rate_bps
          from gemstone_product gp
          join gemstone_vendor gv on gv.id = gp.vendor_id
          where gp.deleted_at is null
            and gv.deleted_at is null
            and (
              gp.medusa_variant_id = $1
              or exists (
                select 1
                from jsonb_array_elements(gp.variant_options) as opt
                where opt->>'medusa_variant_id' = $1
              )
            )
          limit 1
        `,
        [variantId]
      )
      const gemstone = productResult.rows[0]

      if (!gemstone) {
        continue
      }

      const quantity = Math.max(1, Math.trunc(Number(line?.quantity || 1)))
      const grossPaise = Number(
        line?.total ??
          line?.subtotal ??
          (Number(line?.unit_price || 0) > 0
            ? Number(line.unit_price) * quantity
            : Number(gemstone.price_inr || 0) * 100 * quantity)
      )
      const grossInr = Math.max(0, grossPaise / 100)
      const commissionRateBps = Number(
        gemstone.commission_rate_bps || DEFAULT_COMMISSION_BPS
      )
      const commission = Number(((grossInr * commissionRateBps) / 10000).toFixed(2))
      const vendorAmount = Number((grossInr - commission).toFixed(2))

      const result = await client.query(
        `
          insert into gemstone_vendor_commission (
            id, vendor_id, product_id, order_id, order_display_id, line_item_id,
            customer_email, quantity, gross_amount_inr, commission_rate_bps,
            commission_amount_inr, vendor_amount_inr, payout_status, note,
            metadata_json, created_at, updated_at
          )
          values (
            $1, $2, $3, $4, $5, $6,
            $7, $8, $9, $10,
            $11, $12, 'pending', $13,
            $14::jsonb, now(), now()
          )
          on conflict(order_id, line_item_id) do update set
            gross_amount_inr = excluded.gross_amount_inr,
            commission_rate_bps = excluded.commission_rate_bps,
            commission_amount_inr = excluded.commission_amount_inr,
            vendor_amount_inr = excluded.vendor_amount_inr,
            metadata_json = gemstone_vendor_commission.metadata_json || excluded.metadata_json,
            updated_at = now()
          returning *
        `,
        [
          id("gemcomm"),
          gemstone.vendor_id,
          gemstone.id,
          order.id,
          order.display_id ? String(order.display_id) : "",
          line.id,
          order.email || "",
          quantity,
          grossInr,
          commissionRateBps,
          commission,
          vendorAmount,
          "20% Shreem commission retained; vendor payout is manual after fulfillment/return window.",
          JSON.stringify({
            variant_id: variantId,
            product_title: line?.product_title || line?.title || gemstone.title,
            order_total: order.total || null,
          }),
        ]
      )

      recorded.push(result.rows[0])
    }

    return recorded
  })

export const createOrUpdateGemstoneVendorUser = async (
  input: GemstoneVendorUserInput
) =>
  withGemstoneClient(async (client) => {
    const email = normalizeEmail(input.email)
    const password = String(input.password || "")

    if (!input.vendor_id) {
      throw new Error("Select a vendor for this login.")
    }

    if (!email) {
      throw new Error("Vendor login email is required.")
    }

    if (!input.id && password.length < 8) {
      throw new Error("New vendor password must be at least 8 characters.")
    }

    const existing = input.id
      ? await client.query(
          `select * from gemstone_vendor_user where id = $1 and deleted_at is null`,
          [input.id]
        )
      : await client.query(
          `select * from gemstone_vendor_user where email = $1 and deleted_at is null`,
          [email]
        )
    const current = existing.rows[0]
    const userId = current?.id || input.id || id("gemuser")
    const passwordHash = password ? hashPassword(password) : current?.password_hash

    if (!passwordHash) {
      throw new Error("Password is required.")
    }

    const result = await client.query(
      `
        insert into gemstone_vendor_user (
          id, vendor_id, email, name, password_hash, active, created_at, updated_at
        )
        values ($1, $2, $3, $4, $5, $6, now(), now())
        on conflict (email) do update set
          vendor_id = excluded.vendor_id,
          name = excluded.name,
          password_hash = excluded.password_hash,
          active = excluded.active,
          updated_at = now()
        returning id, vendor_id, email, name, active, created_at, updated_at
      `,
      [
        userId,
        input.vendor_id,
        email,
        sanitizeText(input.name, 160),
        passwordHash,
        parseBoolean(input.active, true),
      ]
    )

    return result.rows[0]
  })

export const listGemstoneVendorUsers = async () =>
  withGemstoneClient(async (client) => {
    const result = await client.query(`
      select gu.id, gu.vendor_id, gv.name as vendor_name, gu.email, gu.name,
        gu.active, gu.last_login_at, gu.created_at, gu.updated_at
      from gemstone_vendor_user gu
      join gemstone_vendor gv on gv.id = gu.vendor_id
      where gu.deleted_at is null
      order by gu.updated_at desc
    `)

    return result.rows
  })

export const loginGemstoneVendor = async ({
  email,
  password,
}: {
  email?: string
  password?: string
}) =>
  withGemstoneClient(async (client) => {
    const normalizedEmail = normalizeEmail(email)
    const result = await client.query(
      `
        select gu.*, gv.name as vendor_name, gv.handle as vendor_handle, gv.active as vendor_active
        from gemstone_vendor_user gu
        join gemstone_vendor gv on gv.id = gu.vendor_id
        where gu.email = $1
          and gu.deleted_at is null
        limit 1
      `,
      [normalizedEmail]
    )
    const user = result.rows[0]

    if (
      !user ||
      user.active === false ||
      user.vendor_active === false ||
      !verifyPassword(String(password || ""), user.password_hash)
    ) {
      throw new Error("Invalid vendor email or password.")
    }

    const token = randomBytes(32).toString("hex")
    const expiresAt = new Date(
      Date.now() + VENDOR_SESSION_DAYS * 24 * 60 * 60 * 1000
    )

    await client.query(
      `
        insert into gemstone_vendor_session (
          id, vendor_user_id, session_hash, expires_at, created_at, updated_at
        )
        values ($1, $2, $3, $4, now(), now())
      `,
      [id("gemsess"), user.id, sessionHash(token), expiresAt]
    )
    await client.query(
      `update gemstone_vendor_user set last_login_at = now(), updated_at = now() where id = $1`,
      [user.id]
    )

    return {
      token,
      expires_at: expiresAt,
      user: {
        id: user.id,
        email: user.email,
        name: user.name || "",
        vendor_id: user.vendor_id,
        vendor_name: user.vendor_name,
        vendor_handle: user.vendor_handle,
      },
    }
  })

export const getGemstoneVendorSession = async (token?: string | null) =>
  withGemstoneClient(async (client) => {
    if (!token) {
      return null
    }

    const result = await client.query(
      `
        select gu.id, gu.email, gu.name, gu.vendor_id,
          gv.name as vendor_name, gv.handle as vendor_handle
        from gemstone_vendor_session gs
        join gemstone_vendor_user gu on gu.id = gs.vendor_user_id
        join gemstone_vendor gv on gv.id = gu.vendor_id
        where gs.session_hash = $1
          and gs.revoked_at is null
          and gs.expires_at > now()
          and gu.active = true
          and gu.deleted_at is null
          and gv.active = true
          and gv.deleted_at is null
        limit 1
      `,
      [sessionHash(token)]
    )

    const user = result.rows[0]

    return user
      ? {
          id: user.id,
          email: user.email,
          name: user.name || "",
          vendor_id: user.vendor_id,
          vendor_name: user.vendor_name,
          vendor_handle: user.vendor_handle,
        }
      : null
  })

export const logoutGemstoneVendor = async (token?: string | null) =>
  withGemstoneClient(async (client) => {
    if (!token) {
      return false
    }

    await client.query(
      `
        update gemstone_vendor_session
        set revoked_at = now(), updated_at = now()
        where session_hash = $1
          and revoked_at is null
      `,
      [sessionHash(token)]
    )

    return true
  })

export const changeGemstoneVendorPassword = async ({
  userId,
  currentPassword,
  newPassword,
}: {
  userId: string
  currentPassword?: string
  newPassword?: string
}) =>
  withGemstoneClient(async (client) => {
    if (String(newPassword || "").length < 8) {
      throw new Error("New password must be at least 8 characters.")
    }

    const result = await client.query(
      `select id, password_hash from gemstone_vendor_user where id = $1 and deleted_at is null`,
      [userId]
    )
    const user = result.rows[0]

    if (!user || !verifyPassword(String(currentPassword || ""), user.password_hash)) {
      throw new Error("Current password is incorrect.")
    }

    await client.query(
      `
        update gemstone_vendor_user
        set password_hash = $2, updated_at = now()
        where id = $1
      `,
      [userId, hashPassword(String(newPassword))]
    )

    return true
  })

export const saveGemstoneProductForVendor = async (
  vendorId: string,
  input: GemstoneProductInput
) =>
  upsertGemstoneProduct({
    ...input,
    vendor_id: vendorId,
  })

export const listGemstoneProductsForVendor = async (vendorId: string) =>
  withGemstoneClient(async (client) => {
    const result = await client.query(
      `
        select gp.*, gv.name as vendor_name, gv.handle as vendor_handle
        from gemstone_product gp
        join gemstone_vendor gv on gv.id = gp.vendor_id
        where gp.deleted_at is null
          and gp.vendor_id = $1
        order by gp.active desc, gp.updated_at desc
      `,
      [vendorId]
    )

    return result.rows.map(formatGemstoneProduct)
  })

export const getGemstoneVendorProfile = async (vendorId: string) =>
  withGemstoneClient(async (client) => {
    const result = await client.query(
      `
        select *
        from gemstone_vendor
        where id = $1
          and deleted_at is null
        limit 1
      `,
      [vendorId]
    )

    return result.rows[0] ? formatVendor(result.rows[0]) : null
  })

export const updateGemstoneVendorProfileForVendor = async (
  vendorId: string,
  input: GemstoneVendorInput
) =>
  withGemstoneClient(async (client) => {
    const current = await client.query(
      `select * from gemstone_vendor where id = $1 and deleted_at is null limit 1`,
      [vendorId]
    )
    const existing = current.rows[0]

    if (!existing) {
      throw new Error("Vendor profile not found.")
    }

    return upsertGemstoneVendor({
      ...formatVendor(existing),
      ...input,
      id: vendorId,
      contact_phone: "",
      commission_rate_bps: Number(
        existing.commission_rate_bps || DEFAULT_COMMISSION_BPS
      ),
    })
  })
