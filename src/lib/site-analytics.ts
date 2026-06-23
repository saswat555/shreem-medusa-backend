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
  start,
  end,
}: {
  days?: number
  limit?: number
  start?: string | Date | null
  end?: string | Date | null
}) => {
  const client = getClient()
  const safeDays = Math.min(Math.max(Math.floor(Number(days) || 7), 1), 90)
  const safeLimit = Math.min(Math.max(Math.floor(Number(limit) || 20), 5), 100)
  const parsedStart = start ? new Date(start) : null
  const parsedEnd = end ? new Date(end) : null
  const rangeEnd =
    parsedEnd && Number.isFinite(parsedEnd.getTime()) ? parsedEnd : new Date()
  const rangeStart =
    parsedStart && Number.isFinite(parsedStart.getTime())
      ? parsedStart
      : new Date(rangeEnd.getTime() - safeDays * 24 * 60 * 60 * 1000)

  await client.connect()

  try {
    await ensureSiteAnalyticsTable(client)

    const params = [rangeStart, rangeEnd, safeLimit]
    const overview = await client.query(
        `
        SELECT
          count(*)::int AS visits,
          count(DISTINCT session_id)::int AS unique_sessions,
          count(DISTINCT customer_id) FILTER (WHERE customer_id IS NOT NULL)::int AS logged_in_users,
          count(*) FILTER (WHERE is_logged_in)::int AS logged_in_events
        FROM site_analytics_event
        WHERE created_at >= $1::timestamptz AND created_at < $2::timestamptz
        `,
        [rangeStart, rangeEnd]
      )
    const pages = await client.query(
        `
        SELECT
          path,
          count(*)::int AS visits,
          count(DISTINCT session_id)::int AS unique_sessions,
          count(*) FILTER (WHERE is_logged_in)::int AS logged_in_events
        FROM site_analytics_event
        WHERE created_at >= $1::timestamptz AND created_at < $2::timestamptz
        GROUP BY path
        ORDER BY visits DESC
        LIMIT $3
        `,
        params
      )
    const daily = await client.query(
        `
        SELECT
          date_trunc('day', created_at)::date AS day,
          count(*)::int AS visits,
          count(DISTINCT session_id)::int AS unique_sessions,
          count(*) FILTER (WHERE is_logged_in)::int AS logged_in_events
        FROM site_analytics_event
        WHERE created_at >= $1::timestamptz AND created_at < $2::timestamptz
        GROUP BY day
        ORDER BY day DESC
        LIMIT $3
        `,
        params
      )
    const recent = await client.query(
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
          metadata_json,
          created_at
        FROM site_analytics_event
        WHERE created_at >= $1::timestamptz AND created_at < $2::timestamptz
        ORDER BY created_at DESC
        LIMIT $3
        `,
        params
      )
    const online = await client.query(
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
      )
    const mapPoints = await client.query(
        `
        WITH latest AS (
          SELECT DISTINCT ON (session_id)
            session_id,
            customer_email,
            is_logged_in,
            path,
            event_type,
            metadata_json,
            created_at
          FROM site_analytics_event
          WHERE session_id IS NOT NULL
            AND created_at >= $1::timestamptz
            AND created_at < $2::timestamptz
            AND event_type IN ('page_view', 'heartbeat', 'commerce_intent_click', 'payment_started', 'payment_failed', 'checkout_error')
          ORDER BY session_id, created_at DESC
        )
        SELECT *
        FROM latest
        ORDER BY created_at DESC
        LIMIT $3
        `,
        [rangeStart, rangeEnd, Math.max(safeLimit, 100)]
      )
    const referrers = await client.query(
        `
        SELECT
          COALESCE(NULLIF(metadata_json->>'referrer_host', ''), NULLIF(referrer, ''), 'Direct / unknown') AS referrer,
          count(*)::int AS visits,
          count(DISTINCT session_id)::int AS unique_sessions
        FROM site_analytics_event
        WHERE created_at >= $1::timestamptz AND created_at < $2::timestamptz
          AND event_type = 'page_view'
        GROUP BY COALESCE(NULLIF(metadata_json->>'referrer_host', ''), NULLIF(referrer, ''), 'Direct / unknown')
        ORDER BY visits DESC
        LIMIT $3
        `,
        params
      )
    const sources = await client.query(
        `
        SELECT
          COALESCE(NULLIF(metadata_json->>'traffic_source', ''), 'direct') AS source,
          count(*)::int AS visits,
          count(DISTINCT session_id)::int AS unique_sessions
        FROM site_analytics_event
        WHERE created_at >= $1::timestamptz AND created_at < $2::timestamptz
          AND event_type = 'page_view'
        GROUP BY COALESCE(NULLIF(metadata_json->>'traffic_source', ''), 'direct')
        ORDER BY visits DESC
        LIMIT $3
        `,
        params
      )
    const locations = await client.query(
        `
        SELECT
          COALESCE(NULLIF(metadata_json #>> '{request_location,country}', ''), 'Unknown') AS country,
          COALESCE(NULLIF(metadata_json #>> '{request_location,region}', ''), '') AS region,
          COALESCE(NULLIF(metadata_json #>> '{request_location,city}', ''), '') AS city,
          count(*)::int AS visits,
          count(DISTINCT session_id)::int AS unique_sessions
        FROM site_analytics_event
        WHERE created_at >= $1::timestamptz AND created_at < $2::timestamptz
          AND event_type IN ('page_view', 'heartbeat')
        GROUP BY
          COALESCE(NULLIF(metadata_json #>> '{request_location,country}', ''), 'Unknown'),
          COALESCE(NULLIF(metadata_json #>> '{request_location,region}', ''), ''),
          COALESCE(NULLIF(metadata_json #>> '{request_location,city}', ''), '')
        ORDER BY unique_sessions DESC, visits DESC
        LIMIT $3
        `,
        params
      )
    const funnel = await client.query(
        `
        SELECT
          count(DISTINCT session_id) FILTER (WHERE event_type = 'page_view')::int AS sessions,
          count(DISTINCT session_id) FILTER (WHERE is_logged_in)::int AS logged_in_sessions,
          count(DISTINCT session_id) FILTER (WHERE path LIKE '%/products/%')::int AS product_sessions,
          count(DISTINCT session_id) FILTER (WHERE path LIKE '%/cart%')::int AS cart_sessions,
          count(DISTINCT session_id) FILTER (WHERE path LIKE '%/checkout%')::int AS checkout_sessions,
          count(DISTINCT session_id) FILTER (WHERE event_type IN ('payment_success','order_confirmed') OR path LIKE '%/order/%confirmed%')::int AS purchase_sessions
        FROM site_analytics_event
        WHERE created_at >= $1::timestamptz AND created_at < $2::timestamptz
        `,
        [rangeStart, rangeEnd]
      )
    const friction = await client.query(
        `
        SELECT
          event_type,
          path,
          count(*)::int AS events,
          count(DISTINCT session_id)::int AS sessions
        FROM site_analytics_event
        WHERE created_at >= $1::timestamptz AND created_at < $2::timestamptz
          AND (
            event_type LIKE '%error%' OR
            event_type LIKE '%failed%' OR
            event_type LIKE '%abandon%' OR
            path LIKE '%cart%' OR
            path LIKE '%checkout%'
          )
        GROUP BY event_type, path
        ORDER BY events DESC
        LIMIT $3
        `,
        params
      )
    const sales = await client.query(
        `
        WITH latest_orders AS (
          SELECT DISTINCT ON (o.id)
            o.id,
            COALESCE(
              NULLIF((os.totals->>'paid_total')::numeric, 0),
              NULLIF((os.totals->>'current_order_total')::numeric, 0),
              NULLIF((os.totals->>'original_order_total')::numeric, 0),
              0
            ) AS total
          FROM "order" o
          LEFT JOIN order_summary os ON os.order_id = o.id
          WHERE o.deleted_at IS NULL
            AND o.created_at >= $1::timestamptz
            AND o.created_at < $2::timestamptz
          ORDER BY o.id, os.version DESC NULLS LAST, o.version DESC
        ),
        payment_events AS (
          SELECT
            count(DISTINCT session_id) FILTER (WHERE event_type = 'payment_started')::int AS payment_started_sessions,
            count(DISTINCT session_id) FILTER (WHERE event_type = 'payment_failed')::int AS payment_failed_sessions,
            count(DISTINCT session_id) FILTER (WHERE event_type = 'checkout_error')::int AS checkout_error_sessions,
            count(*) FILTER (WHERE event_type = 'payment_failed')::int AS payment_failed_events,
            count(*) FILTER (WHERE event_type = 'checkout_error')::int AS checkout_error_events
          FROM site_analytics_event
          WHERE created_at >= $1::timestamptz
            AND created_at < $2::timestamptz
        )
        SELECT
          count(lo.id)::int AS orders,
          COALESCE(sum(lo.total), 0)::numeric AS revenue,
          COALESCE(avg(NULLIF(lo.total, 0)), 0)::numeric AS average_order_value,
          count(lo.id) FILTER (WHERE lo.total > 0)::int AS paid_orders,
          pe.payment_started_sessions,
          pe.payment_failed_sessions,
          pe.checkout_error_sessions,
          pe.payment_failed_events,
          pe.checkout_error_events
        FROM payment_events pe
        LEFT JOIN latest_orders lo ON true
        GROUP BY
          pe.payment_started_sessions,
          pe.payment_failed_sessions,
          pe.checkout_error_sessions,
          pe.payment_failed_events,
          pe.checkout_error_events
        `,
        [rangeStart, rangeEnd]
      )
    const topProducts = await client.query(
        `
        WITH latest_orders AS (
          SELECT DISTINCT ON (o.id) o.id, o.created_at
          FROM "order" o
          LEFT JOIN order_summary os ON os.order_id = o.id
          WHERE o.deleted_at IS NULL
            AND o.created_at >= $1::timestamptz
            AND o.created_at < $2::timestamptz
          ORDER BY o.id, os.version DESC NULLS LAST, o.version DESC
        ),
        latest_items AS (
          SELECT DISTINCT ON (oi.order_id, oi.item_id)
            oi.order_id,
            oi.item_id,
            oi.quantity,
            oi.unit_price
          FROM order_item oi
          WHERE oi.deleted_at IS NULL
          ORDER BY oi.order_id, oi.item_id, oi.version DESC
        )
        SELECT
          COALESCE(oli.product_title, oli.title, 'Unknown product') AS product,
          COALESCE(oli.product_handle, '') AS handle,
          sum(li.quantity)::numeric AS quantity,
          sum(li.quantity * COALESCE(NULLIF(li.unit_price, 0), oli.unit_price, 0))::numeric AS revenue
        FROM latest_orders lo
        JOIN latest_items li ON li.order_id = lo.id
        JOIN order_line_item oli ON oli.id = li.item_id AND oli.deleted_at IS NULL
        GROUP BY COALESCE(oli.product_title, oli.title, 'Unknown product'), COALESCE(oli.product_handle, '')
        ORDER BY revenue DESC, quantity DESC
        LIMIT $3
        `,
        params
      )
    const productCatalog = await client.query(
      `
      SELECT
        p.id,
        p.title,
        p.handle,
        COALESCE(p.subtitle, '') AS subtitle,
        COALESCE(p.description, '') AS description,
        COALESCE(p.thumbnail, '') AS thumbnail,
        COALESCE(pt.value, '') AS type,
        COALESCE(pc.title, '') AS collection,
        COALESCE(array_agg(DISTINCT tag.value) FILTER (WHERE tag.value IS NOT NULL), '{}') AS tags,
        count(DISTINCT pv.id) FILTER (WHERE pv.deleted_at IS NULL)::int AS variants
      FROM product p
      LEFT JOIN product_type pt ON pt.id = p.type_id
      LEFT JOIN product_collection pc ON pc.id = p.collection_id
      LEFT JOIN product_variant pv ON pv.product_id = p.id
      LEFT JOIN product_tags ptag ON ptag.product_id = p.id
      LEFT JOIN product_tag tag ON tag.id = ptag.product_tag_id
      WHERE p.deleted_at IS NULL
        AND p.status = 'published'
      GROUP BY p.id, p.title, p.handle, p.subtitle, p.description, p.thumbnail, pt.value, pc.title
      ORDER BY p.created_at DESC
      LIMIT 100
      `
    )
    const productDemand = await client.query(
      `
      WITH catalog AS (
        SELECT title, handle
        FROM product
        WHERE deleted_at IS NULL
          AND status = 'published'
      ),
      views AS (
        SELECT
          c.handle,
          count(*)::int AS visits,
          count(DISTINCT e.session_id)::int AS sessions,
          count(DISTINCT e.session_id) FILTER (WHERE e.is_logged_in)::int AS logged_in_sessions
        FROM catalog c
        JOIN site_analytics_event e
          ON e.path LIKE '%/products/' || c.handle || '%'
        WHERE e.created_at >= $1::timestamptz
          AND e.created_at < $2::timestamptz
          AND e.event_type IN ('page_view', 'heartbeat', 'commerce_intent_click')
        GROUP BY c.handle
      ),
      ordered AS (
        WITH latest_orders AS (
          SELECT DISTINCT ON (o.id) o.id, o.created_at
          FROM "order" o
          LEFT JOIN order_summary os ON os.order_id = o.id
          WHERE o.deleted_at IS NULL
            AND o.created_at >= $1::timestamptz
            AND o.created_at < $2::timestamptz
          ORDER BY o.id, os.version DESC NULLS LAST, o.version DESC
        ),
        latest_items AS (
          SELECT DISTINCT ON (oi.order_id, oi.item_id)
            oi.order_id,
            oi.item_id,
            oi.quantity,
            oi.unit_price
          FROM order_item oi
          WHERE oi.deleted_at IS NULL
          ORDER BY oi.order_id, oi.item_id, oi.version DESC
        )
        SELECT
          COALESCE(oli.product_handle, '') AS handle,
          sum(li.quantity)::numeric AS quantity,
          sum(li.quantity * COALESCE(NULLIF(li.unit_price, 0), oli.unit_price, 0))::numeric AS revenue
        FROM latest_orders lo
        JOIN latest_items li ON li.order_id = lo.id
        JOIN order_line_item oli ON oli.id = li.item_id AND oli.deleted_at IS NULL
        GROUP BY COALESCE(oli.product_handle, '')
      )
      SELECT
        c.title AS product,
        c.handle,
        COALESCE(v.visits, 0)::int AS visits,
        COALESCE(v.sessions, 0)::int AS sessions,
        COALESCE(v.logged_in_sessions, 0)::int AS logged_in_sessions,
        COALESCE(o.quantity, 0)::numeric AS quantity,
        COALESCE(o.revenue, 0)::numeric AS revenue
      FROM catalog c
      LEFT JOIN views v ON v.handle = c.handle
      LEFT JOIN ordered o ON o.handle = c.handle
      ORDER BY COALESCE(o.revenue, 0) DESC, COALESCE(v.sessions, 0) DESC, c.title ASC
      LIMIT $3
      `,
      params
    )
    const salesBySource = await client.query(
        `
        SELECT
          COALESCE(NULLIF(metadata_json->>'traffic_source', ''), 'direct') AS source,
          count(DISTINCT session_id) FILTER (WHERE event_type = 'page_view')::int AS sessions,
          count(DISTINCT session_id) FILTER (WHERE path LIKE '%/cart%')::int AS cart_sessions,
          count(DISTINCT session_id) FILTER (WHERE path LIKE '%/checkout%')::int AS checkout_sessions,
          count(DISTINCT session_id) FILTER (WHERE event_type IN ('payment_failed','checkout_error'))::int AS problem_sessions
        FROM site_analytics_event
        WHERE created_at >= $1::timestamptz
          AND created_at < $2::timestamptz
          AND session_id IS NOT NULL
        GROUP BY COALESCE(NULLIF(metadata_json->>'traffic_source', ''), 'direct')
        ORDER BY checkout_sessions DESC, sessions DESC
        LIMIT $3
        `,
        params
      )
    const journeys = await client.query(
        `
        WITH ranked AS (
          SELECT
            session_id,
            customer_email,
            path,
            event_type,
            metadata_json,
            created_at,
            row_number() OVER (PARTITION BY session_id ORDER BY created_at DESC) AS rn
          FROM site_analytics_event
          WHERE created_at >= $1::timestamptz
            AND created_at < $2::timestamptz
            AND session_id IS NOT NULL
        )
        SELECT
          session_id,
          max(customer_email) AS customer_email,
          json_agg(json_build_object(
            'path', path,
            'event_type', event_type,
            'source', metadata_json->>'traffic_source',
            'location', metadata_json->'request_location',
            'landing_page', metadata_json #>> '{attribution,landing_page}',
            'created_at', created_at
          ) ORDER BY created_at DESC) AS events
        FROM ranked
        WHERE rn <= 8
        GROUP BY session_id
        ORDER BY max(created_at) DESC
        LIMIT $3
        `,
        params
      )

    return {
      days: safeDays,
      range: {
        start: rangeStart.toISOString(),
        end: rangeEnd.toISOString(),
      },
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
      map_points: mapPoints.rows,
      referrers: referrers.rows,
      sources: sources.rows,
      locations: locations.rows,
      sales: sales.rows[0] || {
        orders: 0,
        revenue: 0,
        average_order_value: 0,
        paid_orders: 0,
        payment_started_sessions: 0,
        payment_failed_sessions: 0,
        checkout_error_sessions: 0,
        payment_failed_events: 0,
        checkout_error_events: 0,
      },
      top_products: topProducts.rows,
      product_catalog: productCatalog.rows,
      product_demand: productDemand.rows,
      sales_by_source: salesBySource.rows,
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
