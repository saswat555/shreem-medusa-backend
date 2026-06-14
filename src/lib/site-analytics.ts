import { Client } from "pg"

export type SiteAnalyticsEventInput = {
  event_type: string
  path: string
  title?: string | null
  referrer?: string | null
  session_id?: string | null
  customer_id?: string | null
  customer_email?: string | null
  is_logged_in?: boolean
  user_agent?: string | null
  ip_address?: string | null
  metadata?: Record<string, unknown>
}

const MAX_TEXT = 500

const sanitizeText = (value: unknown, fallback = "", max = MAX_TEXT) =>
  typeof value === "string" && value.trim()
    ? value.trim().slice(0, max)
    : fallback

const getClient = () =>
  new Client({
    connectionString: process.env.DATABASE_URL,
  })

export const ensureSiteAnalyticsTable = async (client: Client) => {
  await client.query(`
    CREATE TABLE IF NOT EXISTS site_analytics_event (
      id bigserial PRIMARY KEY,
      event_type text NOT NULL,
      path text NOT NULL,
      title text NULL,
      referrer text NULL,
      session_id text NULL,
      customer_id text NULL,
      customer_email text NULL,
      is_logged_in boolean NOT NULL DEFAULT false,
      user_agent text NULL,
      ip_address text NULL,
      metadata_json jsonb NOT NULL DEFAULT '{}'::jsonb,
      created_at timestamptz NOT NULL DEFAULT now()
    )
  `)

  await client.query(`
    CREATE INDEX IF NOT EXISTS idx_site_analytics_created_at
    ON site_analytics_event (created_at DESC)
  `)

  await client.query(`
    CREATE INDEX IF NOT EXISTS idx_site_analytics_path_created_at
    ON site_analytics_event (path, created_at DESC)
  `)

  await client.query(`
    CREATE INDEX IF NOT EXISTS idx_site_analytics_session_created_at
    ON site_analytics_event (session_id, created_at DESC)
  `)

  await client.query(`
    CREATE INDEX IF NOT EXISTS idx_site_analytics_event_type_created_at
    ON site_analytics_event (event_type, created_at DESC)
  `)
}

export const recordSiteAnalyticsEvent = async (
  input: SiteAnalyticsEventInput
) => {
  const client = getClient()

  await client.connect()

  try {
    await ensureSiteAnalyticsTable(client)

    const result = await client.query(
      `
      INSERT INTO site_analytics_event (
        event_type,
        path,
        title,
        referrer,
        session_id,
        customer_id,
        customer_email,
        is_logged_in,
        user_agent,
        ip_address,
        metadata_json
      )
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11::jsonb)
      RETURNING id, created_at
      `,
      [
        sanitizeText(input.event_type, "page_view", 80),
        sanitizeText(input.path, "/", 500),
        sanitizeText(input.title, "", 240) || null,
        sanitizeText(input.referrer, "", 500) || null,
        sanitizeText(input.session_id, "", 160) || null,
        sanitizeText(input.customer_id, "", 160) || null,
        sanitizeText(input.customer_email, "", 240) || null,
        Boolean(input.is_logged_in),
        sanitizeText(input.user_agent, "", 600) || null,
        sanitizeText(input.ip_address, "", 80) || null,
        JSON.stringify(input.metadata || {}),
      ]
    )

    return result.rows[0]
  } finally {
    await client.end().catch(() => undefined)
  }
}

export const getSiteAnalyticsSummary = async ({
  days = 7,
  limit = 20,
}: {
  days?: number
  limit?: number
}) => {
  const client = getClient()
  const safeDays = Math.min(Math.max(Math.floor(Number(days) || 7), 1), 90)
  const safeLimit = Math.min(Math.max(Math.floor(Number(limit) || 20), 5), 100)

  await client.connect()

  try {
    await ensureSiteAnalyticsTable(client)

    const params = [safeDays, safeLimit]
    const [
      overview,
      pages,
      daily,
      recent,
      online,
      referrers,
      funnel,
      friction,
      journeys,
    ] = await Promise.all([
      client.query(
        `
        SELECT
          count(*)::int AS visits,
          count(DISTINCT session_id)::int AS unique_sessions,
          count(DISTINCT customer_id) FILTER (WHERE customer_id IS NOT NULL)::int AS logged_in_users,
          count(*) FILTER (WHERE is_logged_in)::int AS logged_in_events
        FROM site_analytics_event
        WHERE created_at >= now() - ($1::int * interval '1 day')
        `,
        [safeDays]
      ),
      client.query(
        `
        SELECT
          path,
          count(*)::int AS visits,
          count(DISTINCT session_id)::int AS unique_sessions,
          count(*) FILTER (WHERE is_logged_in)::int AS logged_in_events
        FROM site_analytics_event
        WHERE created_at >= now() - ($1::int * interval '1 day')
        GROUP BY path
        ORDER BY visits DESC
        LIMIT $2
        `,
        params
      ),
      client.query(
        `
        SELECT
          date_trunc('day', created_at)::date AS day,
          count(*)::int AS visits,
          count(DISTINCT session_id)::int AS unique_sessions,
          count(*) FILTER (WHERE is_logged_in)::int AS logged_in_events
        FROM site_analytics_event
        WHERE created_at >= now() - ($1::int * interval '1 day')
        GROUP BY day
        ORDER BY day DESC
        LIMIT $2
        `,
        params
      ),
      client.query(
        `
        SELECT
          id,
          event_type,
          path,
          title,
          referrer,
          session_id,
          customer_email,
          is_logged_in,
          created_at
        FROM site_analytics_event
        WHERE created_at >= now() - ($1::int * interval '1 day')
        ORDER BY created_at DESC
        LIMIT $2
        `,
        params
      ),
      client.query(
        `
        WITH latest AS (
          SELECT DISTINCT ON (session_id)
            session_id,
            customer_email,
            is_logged_in,
            path,
            title,
            referrer,
            metadata_json,
            created_at
          FROM site_analytics_event
          WHERE session_id IS NOT NULL
            AND created_at >= now() - interval '5 minutes'
          ORDER BY session_id, created_at DESC
        )
        SELECT *
        FROM latest
        ORDER BY created_at DESC
        LIMIT $1
        `,
        [safeLimit]
      ),
      client.query(
        `
        SELECT
          COALESCE(NULLIF(referrer, ''), 'Direct / unknown') AS referrer,
          count(*)::int AS visits,
          count(DISTINCT session_id)::int AS unique_sessions
        FROM site_analytics_event
        WHERE created_at >= now() - ($1::int * interval '1 day')
          AND event_type = 'page_view'
        GROUP BY COALESCE(NULLIF(referrer, ''), 'Direct / unknown')
        ORDER BY visits DESC
        LIMIT $2
        `,
        params
      ),
      client.query(
        `
        SELECT
          count(DISTINCT session_id) FILTER (WHERE event_type = 'page_view')::int AS sessions,
          count(DISTINCT session_id) FILTER (WHERE is_logged_in)::int AS logged_in_sessions,
          count(DISTINCT session_id) FILTER (WHERE path LIKE '%/products/%')::int AS product_sessions,
          count(DISTINCT session_id) FILTER (WHERE path LIKE '%/cart%')::int AS cart_sessions,
          count(DISTINCT session_id) FILTER (WHERE path LIKE '%/checkout%')::int AS checkout_sessions,
          count(DISTINCT session_id) FILTER (WHERE event_type IN ('payment_success','order_confirmed') OR path LIKE '%/order/%confirmed%')::int AS purchase_sessions
        FROM site_analytics_event
        WHERE created_at >= now() - ($1::int * interval '1 day')
        `,
        [safeDays]
      ),
      client.query(
        `
        SELECT
          event_type,
          path,
          count(*)::int AS events,
          count(DISTINCT session_id)::int AS sessions
        FROM site_analytics_event
        WHERE created_at >= now() - ($1::int * interval '1 day')
          AND (
            event_type LIKE '%error%' OR
            event_type LIKE '%failed%' OR
            event_type LIKE '%abandon%' OR
            path LIKE '%cart%' OR
            path LIKE '%checkout%'
          )
        GROUP BY event_type, path
        ORDER BY events DESC
        LIMIT $2
        `,
        params
      ),
      client.query(
        `
        WITH ranked AS (
          SELECT
            session_id,
            customer_email,
            path,
            event_type,
            created_at,
            row_number() OVER (PARTITION BY session_id ORDER BY created_at DESC) AS rn
          FROM site_analytics_event
          WHERE created_at >= now() - ($1::int * interval '1 day')
            AND session_id IS NOT NULL
        )
        SELECT
          session_id,
          max(customer_email) AS customer_email,
          json_agg(json_build_object(
            'path', path,
            'event_type', event_type,
            'created_at', created_at
          ) ORDER BY created_at DESC) AS events
        FROM ranked
        WHERE rn <= 8
        GROUP BY session_id
        ORDER BY max(created_at) DESC
        LIMIT $2
        `,
        params
      ),
    ])

    return {
      days: safeDays,
      overview: overview.rows[0] || {
        visits: 0,
        unique_sessions: 0,
        logged_in_users: 0,
        logged_in_events: 0,
      },
      pages: pages.rows,
      daily: daily.rows,
      recent: recent.rows,
      online: online.rows,
      referrers: referrers.rows,
      funnel: funnel.rows[0] || {
        sessions: 0,
        logged_in_sessions: 0,
        product_sessions: 0,
        cart_sessions: 0,
        checkout_sessions: 0,
        purchase_sessions: 0,
      },
      friction: friction.rows,
      journeys: journeys.rows,
    }
  } finally {
    await client.end().catch(() => undefined)
  }
}
