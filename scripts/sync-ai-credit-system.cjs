/* eslint-disable no-console */
const fs = require("fs")
const path = require("path")
const { Client } = require("pg")

const envPath = path.resolve(process.cwd(), ".env")
if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, "utf8").split(/\r?\n/)) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith("#") || !trimmed.includes("=")) continue
    const idx = trimmed.indexOf("=")
    const key = trimmed.slice(0, idx).trim()
    const value = trimmed.slice(idx + 1).trim().replace(/^['"]|['"]$/g, "")
    if (!process.env[key]) process.env[key] = value
  }
}

if (!process.env.DATABASE_URL) {
  console.error("DATABASE_URL missing from backend .env")
  process.exit(1)
}

const client = new Client({ connectionString: process.env.DATABASE_URL })

async function run() {
  await client.connect()

  try {
    await client.query("begin")

    const result = await client.query(`
      with latest_order_items as (
        select distinct on (oi.order_id, oi.item_id)
          oi.*
        from order_item oi
        where oi.deleted_at is null
        order by oi.order_id, oi.item_id, oi.version desc, oi.created_at desc
      ),
      credit_lines as (
        select
          o.id as order_id,
          o.display_id,
          o.email as customer_email,
          o.customer_id,
          o.created_at as order_created_at,
          oi.item_id,
          greatest(1, coalesce(oi.quantity, 1)::numeric)::integer as quantity,

          oli.title as line_title,
          oli.subtitle as line_subtitle,
          oli.product_title,
          oli.product_handle,
          oli.variant_title,
          oli.variant_sku as line_variant_sku,
          oli.variant_id,
          oli.product_id,
          coalesce(oli.metadata, '{}'::jsonb) as line_metadata,

          pv.sku as current_variant_sku,
          pv.title as current_variant_title,
          coalesce(pv.metadata, '{}'::jsonb) as variant_metadata,

          p.handle as current_product_handle,
          p.title as current_product_title,
          coalesce(p.metadata, '{}'::jsonb) as product_metadata,

          case
            when coalesce(
              oli.metadata->>'ai_credits',
              pv.metadata->>'ai_credits',
              p.metadata->>'ai_credits'
            ) ~ '^[0-9]+$'
              then coalesce(
                oli.metadata->>'ai_credits',
                pv.metadata->>'ai_credits',
                p.metadata->>'ai_credits'
              )::integer

            when upper(coalesce(pv.sku, oli.variant_sku, '')) = 'SHREEM-AI-CREDIT-30' then 30
            when upper(coalesce(pv.sku, oli.variant_sku, '')) = 'SHREEM-AI-CREDIT-10' then 10
            when upper(coalesce(pv.sku, oli.variant_sku, '')) = 'SHREEM-AI-CREDIT-5' then 5
            when upper(coalesce(pv.sku, oli.variant_sku, '')) = 'SHREEM-AI-CREDIT-2' then 2
            when upper(coalesce(pv.sku, oli.variant_sku, '')) = 'SHREEM-AI-CREDIT-1' then 1

            when lower(coalesce(oli.variant_title, oli.subtitle, pv.title, oli.title, oli.product_title, '')) ~ '(^|[^0-9])30\\s*credits?([^0-9]|$)' then 30
            when lower(coalesce(oli.variant_title, oli.subtitle, pv.title, oli.title, oli.product_title, '')) ~ '(^|[^0-9])10\\s*credits?([^0-9]|$)' then 10
            when lower(coalesce(oli.variant_title, oli.subtitle, pv.title, oli.title, oli.product_title, '')) ~ '(^|[^0-9])5\\s*credits?([^0-9]|$)' then 5
            when lower(coalesce(oli.variant_title, oli.subtitle, pv.title, oli.title, oli.product_title, '')) ~ '(^|[^0-9])2\\s*credits?([^0-9]|$)' then 2
            when lower(coalesce(oli.variant_title, oli.subtitle, pv.title, oli.title, oli.product_title, '')) ~ '(^|[^0-9])1\\s*credits?([^0-9]|$)' then 1

            else 0
          end as unit_credits,

          case
            when upper(coalesce(pv.sku, oli.variant_sku, '')) = 'SHREEM-AI-MONTHLY'
              or lower(coalesce(p.handle, oli.product_handle, '')) = 'shreem-ai-jyotish-monthly'
              or lower(coalesce(oli.title, oli.product_title, oli.variant_title, oli.subtitle, pv.title, p.title, '')) like '%monthly%'
              or coalesce(
                oli.metadata->>'ai_plan',
                pv.metadata->>'ai_plan',
                p.metadata->>'ai_plan'
              ) = 'premium'
            then true
            else false
          end as is_premium

        from latest_order_items oi
        join "order" o on o.id = oi.order_id
        join order_line_item oli on oli.id = oi.item_id
        left join product_variant pv on pv.id = oli.variant_id
        left join product p on p.id = coalesce(oli.product_id, pv.product_id)
        where o.customer_id is not null
          and (
            lower(coalesce(p.handle, oli.product_handle, '')) in ('shreem-ai-jyotish-credits', 'shreem-ai-jyotish-monthly')
            or upper(coalesce(pv.sku, oli.variant_sku, '')) like 'SHREEM-AI-%'
            or lower(coalesce(oli.title, oli.product_title, oli.variant_title, oli.subtitle, pv.title, p.title, '')) like '%credit%'
            or coalesce(oli.metadata, '{}'::jsonb)::text ilike '%ai_credit%'
            or coalesce(pv.metadata, '{}'::jsonb)::text ilike '%ai_credit%'
            or coalesce(p.metadata, '{}'::jsonb)::text ilike '%ai_credit%'
          )
      ),
      expected_by_order as (
        select
          order_id,
          display_id,
          customer_id,
          max(customer_email) as customer_email,
          max(order_created_at) as order_created_at,
          sum(unit_credits * quantity)::integer as expected_credits,
          bool_or(is_premium) as premium,
          jsonb_agg(
            jsonb_build_object(
              'item_id', item_id,
              'title', line_title,
              'subtitle', line_subtitle,
              'product_title', product_title,
              'product_handle', product_handle,
              'variant_title', variant_title,
              'line_variant_sku', line_variant_sku,
              'current_variant_sku', current_variant_sku,
              'quantity', quantity,
              'unit_credits', unit_credits,
              'is_premium', is_premium
            )
          ) as matched_items
        from credit_lines
        where unit_credits > 0 or is_premium = true
        group by order_id, display_id, customer_id
      ),
      ensure_wallets as (
        insert into ai_wallet (
          id,
          customer_id,
          customer_email,
          credit_balance,
          plan,
          pro_question_limit,
          metadata_json,
          created_at,
          updated_at
        )
        select
          'aiw_sync_' || substr(md5(customer_id || coalesce(max(customer_email), '') || now()::text), 1, 24),
          customer_id,
          max(customer_email),
          0,
          'free',
          0,
          '{}'::jsonb,
          now(),
          now()
        from expected_by_order e
        where not exists (
          select 1
          from ai_wallet w
          where w.customer_id = e.customer_id
            and w.deleted_at is null
        )
        group by customer_id
        on conflict do nothing
        returning customer_id
      ),
      already_credited as (
        select
          order_id,
          customer_id,
          coalesce(sum(credits), 0)::integer as already_credited
        from ai_credit_ledger
        where deleted_at is null
          and type = 'order_credit'
          and order_id is not null
        group by order_id, customer_id
      ),
      deltas as (
        select
          e.*,
          w.id as wallet_id,
          coalesce(a.already_credited, 0) as already_credited,
          (e.expected_credits - coalesce(a.already_credited, 0))::integer as delta
        from expected_by_order e
        join ai_wallet w on w.customer_id = e.customer_id and w.deleted_at is null
        left join already_credited a
          on a.order_id = e.order_id
         and a.customer_id = e.customer_id
      ),
      inserted_corrections as (
        insert into ai_credit_ledger (
          id,
          wallet_id,
          customer_id,
          customer_email,
          type,
          source,
          credits,
          balance_after,
          order_id,
          usage_id,
          note,
          metadata_json,
          created_at,
          updated_at
        )
        select
          'aicred_sync_' || substr(md5(order_id || customer_id || delta::text || now()::text || random()::text), 1, 24),
          wallet_id,
          customer_id,
          customer_email,
          'order_credit',
          'sync_credit_product_orders',
          delta,
          0,
          order_id,
          null,
          case
            when already_credited = 0 then 'Synced AI credits from credit-product order'
            else 'Corrected AI credits from credit-product order'
          end,
          jsonb_build_object(
            'sync', true,
            'display_id', display_id,
            'expected_total_order_credits', expected_credits,
            'already_credited_before_sync', already_credited,
            'delta', delta,
            'matched_items', matched_items
          ),
          now(),
          now()
        from deltas
        where delta <> 0
        returning *
      ),
      premium_updates as (
        update ai_wallet w
        set
          plan = case when e.premium then 'premium' else w.plan end,
          plan_expires_at = case
            when e.premium then greatest(
              coalesce(w.plan_expires_at, now()),
              e.order_created_at + interval '30 days'
            )
            else w.plan_expires_at
          end,
          pro_question_limit = case
            when e.premium then greatest(coalesce(w.pro_question_limit, 0), 30)
            else w.pro_question_limit
          end,
          updated_at = now()
        from expected_by_order e
        where w.customer_id = e.customer_id
          and w.deleted_at is null
          and e.premium = true
        returning w.customer_id
      ),
      wallet_totals as (
        select
          wallet_id,
          coalesce(sum(credits), 0)::integer as ledger_balance
        from ai_credit_ledger
        where deleted_at is null
        group by wallet_id
      ),
      reconciled_wallets as (
        update ai_wallet w
        set
          credit_balance = greatest(0, coalesce(t.ledger_balance, 0)),
          updated_at = now()
        from wallet_totals t
        where w.id = t.wallet_id
          and w.deleted_at is null
          and coalesce(w.credit_balance, 0)::integer <> greatest(0, coalesce(t.ledger_balance, 0))
        returning w.id, w.customer_id, w.credit_balance
      )
      select
        (select count(*) from expected_by_order) as credit_orders_found,
        (select count(*) from inserted_corrections) as correction_rows_inserted,
        coalesce((select sum(credits) from inserted_corrections), 0) as net_credits_inserted,
        (select count(*) from premium_updates) as premium_wallets_updated,
        (select count(*) from reconciled_wallets) as wallets_reconciled;
    `)

    await client.query("commit")

    console.log("\n=== AI CREDIT SYNC RESULT ===")
    console.table(result.rows)

    console.log("\n=== WALLETS AFTER SYNC ===")
    const wallets = await client.query(`
      select customer_email, customer_id, credit_balance, plan, plan_expires_at, pro_question_limit, updated_at
      from ai_wallet
      where deleted_at is null
      order by updated_at desc
      limit 50
    `)
    console.table(wallets.rows)

    console.log("\n=== LATEST CREDIT LEDGER ===")
    const ledger = await client.query(`
      select customer_email, customer_id, type, source, credits, order_id, note, metadata_json, created_at
      from ai_credit_ledger
      where deleted_at is null
      order by created_at desc
      limit 80
    `)
    console.table(ledger.rows)
  } catch (error) {
    try {
      await client.query("rollback")
    } catch {}
    console.error("\nAI credit sync failed:", error)
    process.exitCode = 1
  } finally {
    await client.end()
  }
}

run()
