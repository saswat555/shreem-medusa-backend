import type { SubscriberArgs, SubscriberConfig } from "@medusajs/framework"

type ProductEventData = Record<string, any>

const PRODUCT_EVENTS = [
  "product.created",
  "product.updated",
  "product.deleted",
  "product-variant.created",
  "product-variant.updated",
  "product-variant.deleted",
  "product.product.created",
  "product.product.updated",
  "product.product.deleted",
  "product.product-variant.created",
  "product.product-variant.updated",
  "product.product-variant.deleted",
]

const asString = (value: unknown) =>
  typeof value === "string" ? value.trim() : ""

const unique = (values: string[]) => Array.from(new Set(values.filter(Boolean)))

const getRevalidateUrl = () => {
  const explicit = asString(process.env.STOREFRONT_REVALIDATE_URL)
  if (explicit) {
    return explicit
  }

  const base = asString(
    process.env.STOREFRONT_URL ||
      process.env.FRONTEND_URL ||
      process.env.NEXT_PUBLIC_STOREFRONT_URL
  )

  return base ? `${base.replace(/\/+$/, "")}/api/revalidate` : ""
}

const getCountryCodes = () =>
  (
    process.env.STOREFRONT_REVALIDATE_COUNTRIES ||
    process.env.REVALIDATE_COUNTRY_CODES ||
    "in"
  )
    .split(",")
    .map((countryCode) => countryCode.trim().toLowerCase())
    .filter(Boolean)

const collectProductIds = (data: ProductEventData) => {
  const ids = [
    data.id,
    data.product_id,
    data.product?.id,
    data.product?.product_id,
    ...(Array.isArray(data.ids) ? data.ids : []),
    ...(Array.isArray(data.product_ids) ? data.product_ids : []),
    ...(Array.isArray(data.products)
      ? data.products.map((product) => product?.id || product?.product_id)
      : []),
    ...(Array.isArray(data.variants)
      ? data.variants.map((variant) => variant?.product_id)
      : []),
  ]

  return unique(ids.map(asString))
}

const collectHandles = (data: ProductEventData) => {
  const handles = [
    data.handle,
    data.product?.handle,
    ...(Array.isArray(data.handles) ? data.handles : []),
    ...(Array.isArray(data.products)
      ? data.products.map((product) => product?.handle)
      : []),
  ]

  return unique(handles.map(asString))
}

const getProductHandles = async (
  container: SubscriberArgs["container"],
  productIds: string[]
) => {
  if (!productIds.length) {
    return []
  }

  try {
    const query = container.resolve("query") as any
    const { data } = await query.graph({
      entity: "product",
      fields: ["id", "handle"],
      filters: { id: productIds },
    })

    return unique((data || []).map((product: any) => asString(product?.handle)))
  } catch (error) {
    console.warn("Storefront product revalidate handle lookup failed", {
      productIds,
      error: error instanceof Error ? error.message : error,
    })
    return []
  }
}

export default async function storefrontProductRevalidateHandler({
  event,
  container,
}: SubscriberArgs<ProductEventData>) {
  const eventName =
    asString((event as any).name) ||
    asString((event as any).eventName) ||
    "product.changed"
  const url = getRevalidateUrl()
  const secret =
    asString(process.env.STOREFRONT_REVALIDATE_SECRET) ||
    asString(process.env.REVALIDATE_SECRET)

  if (!url || !secret) {
    console.warn("Storefront product revalidation is not configured", {
      has_url: Boolean(url),
      has_secret: Boolean(secret),
      event: eventName,
    })
    return
  }

  const productIds = collectProductIds(event.data || {})
  const handles = unique([
    ...collectHandles(event.data || {}),
    ...(await getProductHandles(container, productIds)),
  ])

  try {
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-revalidate-secret": secret,
      },
      body: JSON.stringify({
        tags: ["products", "collections", "categories"],
        handles,
        countryCodes: getCountryCodes(),
        productIds,
        event: eventName,
      }),
    })

    if (!response.ok) {
      const body = await response.text().catch(() => "")
      console.warn("Storefront product revalidation failed", {
        status: response.status,
        status_text: response.statusText,
        body: body.slice(0, 500),
        event: eventName,
        productIds,
        handles,
      })
    } else {
      console.info("Storefront product revalidated", {
        event: eventName,
        productIds,
        handles,
      })
    }
  } catch (error) {
    console.warn("Storefront product revalidation request failed", {
      event: eventName,
      productIds,
      handles,
      error: error instanceof Error ? error.message : error,
    })
  }
}

export const config: SubscriberConfig = {
  event: PRODUCT_EVENTS,
}
