import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { Client } from "pg"

const DIGITAL_HANDLES = ["shreem-ai-jyotish-credits", "shreem-ai-jyotish-monthly"]

const connect = async () => {
  const client = new Client({
    connectionString: process.env.DATABASE_URL,
  })

  await client.connect()
  return client
}

const isDigitalAiCart = async (client: Client, cartId: string) => {
  const result = await client.query(
    `
      select
        count(*)::integer as item_count,
        count(*) filter (
          where
            lower(coalesce(cli.product_handle, p.handle, '')) = any($2::text[])
            or coalesce(cli.metadata, '{}'::jsonb)->>'digital_product' = 'true'
            or coalesce(cli.metadata, '{}'::jsonb)->>'no_shipping' = 'true'
            or coalesce(cli.metadata, '{}'::jsonb)->>'requires_shipping' = 'false'
            or coalesce(p.metadata, '{}'::jsonb)->>'digital_product' = 'true'
            or coalesce(p.metadata, '{}'::jsonb)->>'no_shipping' = 'true'
            or coalesce(p.metadata, '{}'::jsonb)->>'requires_shipping' = 'false'
            or coalesce(pv.metadata, '{}'::jsonb)->>'digital_product' = 'true'
            or coalesce(pv.metadata, '{}'::jsonb)->>'no_shipping' = 'true'
            or coalesce(pv.metadata, '{}'::jsonb)->>'requires_shipping' = 'false'
            or lower(coalesce(cli.variant_sku, pv.sku, '')) like 'shreem-ai-%'
        )::integer as digital_count
      from cart_line_item cli
      left join product p on p.id = cli.product_id
      left join product_variant pv on pv.id = cli.variant_id
      where cli.cart_id = $1
        and cli.deleted_at is null
    `,
    [cartId, DIGITAL_HANDLES]
  )
  const row = result.rows[0] || {}
  const itemCount = Number(row.item_count || 0)
  const digitalCount = Number(row.digital_count || 0)

  return itemCount > 0 && itemCount === digitalCount
}

export const POST = async (req: MedusaRequest, res: MedusaResponse) => {
  const cartId = String(req.params?.id || "").trim()

  if (!cartId.startsWith("cart_")) {
    return res.status(400).json({
      ok: false,
      message: "Valid cart id is required.",
    })
  }

  const client = await connect()

  try {
    const digitalOnly = await isDigitalAiCart(client, cartId)

    if (!digitalOnly) {
      return res.json({
        ok: true,
        digital_only: false,
        removed_shipping_methods: 0,
      })
    }

    await client.query("begin")

    await client.query(
      `
        update cart_line_item
        set
          requires_shipping = false,
          metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object(
            'digital', true,
            'digital_product', true,
            'no_shipping', true,
            'requires_shipping', false,
            'fulfillment_type', 'digital'
          ),
          updated_at = now()
        where cart_id = $1
          and deleted_at is null
      `,
      [cartId]
    )

    const shippingMethods = await client.query(
      `
        select id
        from cart_shipping_method
        where cart_id = $1
          and deleted_at is null
      `,
      [cartId]
    )
    const shippingMethodIds = shippingMethods.rows.map((row) => row.id)

    if (shippingMethodIds.length) {
      await client.query(
        `
          update cart_shipping_method_tax_line
          set deleted_at = now()
          where shipping_method_id = any($1::text[])
            and deleted_at is null
        `,
        [shippingMethodIds]
      )
      await client.query(
        `
          update cart_shipping_method_adjustment
          set deleted_at = now()
          where shipping_method_id = any($1::text[])
            and deleted_at is null
        `,
        [shippingMethodIds]
      )
      await client.query(
        `
          update cart_shipping_method
          set deleted_at = now(), updated_at = now()
          where id = any($1::text[])
            and deleted_at is null
        `,
        [shippingMethodIds]
      )
    }

    await client.query(
      `
        update cart
        set
          metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object(
            'digital_delivery', true,
            'shipping_cleanup_at', now()
          ),
          updated_at = now()
        where id = $1
      `,
      [cartId]
    )

    await client.query("commit")

    return res.json({
      ok: true,
      digital_only: true,
      removed_shipping_methods: shippingMethodIds.length,
    })
  } catch (error: any) {
    await client.query("rollback").catch(() => undefined)

    return res.status(500).json({
      ok: false,
      message: error?.message || "Could not clean digital cart shipping.",
    })
  } finally {
    await client.end().catch(() => undefined)
  }
}
