import { useEffect, useMemo, useState } from "react"
import { defineRouteConfig } from "@medusajs/admin-sdk"
import { Users } from "@medusajs/icons"
import {
  Badge,
  Button,
  Container,
  Heading,
  Input,
  Select,
  Table,
  Text,
} from "@medusajs/ui"

import { sdk } from "../../lib/sdk"

type Metadata = Record<string, any>

type AnalyticsEvent = {
  id?: number
  session_id?: string
  customer_email?: string | null
  is_logged_in: boolean
  event_type?: string
  path: string
  title?: string | null
  referrer?: string | null
  metadata_json?: Metadata
  created_at: string
}

type AnalyticsSummary = {
  days: number
  range?: {
    start: string
    end: string
  }
  overview: {
    visits: number
    unique_sessions: number
    logged_in_users: number
    logged_in_events: number
  }
  sales: {
    orders: number
    revenue: number | string
    average_order_value: number | string
    paid_orders: number
    payment_started_sessions: number
    payment_failed_sessions: number
    checkout_error_sessions: number
    payment_failed_events: number
    checkout_error_events: number
  }
  funnel: {
    sessions: number
    logged_in_sessions: number
    product_sessions: number
    cart_sessions: number
    checkout_sessions: number
    purchase_sessions: number
  }
  online: AnalyticsEvent[]
  map_points: AnalyticsEvent[]
  referrers: Array<{
    referrer: string
    visits: number
    unique_sessions: number
  }>
  sources: Array<{
    source: string
    visits: number
    unique_sessions: number
  }>
  locations: Array<{
    country: string
    region?: string
    city?: string
    visits: number
    unique_sessions: number
  }>
  sales_by_source: Array<{
    source: string
    sessions: number
    cart_sessions: number
    checkout_sessions: number
    problem_sessions: number
  }>
  top_products: Array<{
    product: string
    handle?: string
    quantity: number | string
    revenue: number | string
  }>
  product_catalog: Array<{
    id: string
    title: string
    handle: string
    subtitle?: string
    description?: string
    thumbnail?: string
    type?: string
    collection?: string
    tags?: string[]
    variants?: number
  }>
  product_demand: Array<{
    product: string
    handle: string
    visits: number
    sessions: number
    logged_in_sessions: number
    quantity: number | string
    revenue: number | string
  }>
  friction: Array<{
    event_type: string
    path: string
    events: number
    sessions: number
  }>
  journeys: Array<{
    session_id: string
    customer_email?: string | null
    events: Array<{
      path: string
      event_type: string
      source?: string
      landing_page?: string
      location?: Metadata
      created_at: string
    }>
  }>
  pages: Array<{
    path: string
    visits: number
    unique_sessions: number
    logged_in_events: number
  }>
  daily: Array<{
    day: string
    visits: number
    unique_sessions: number
    logged_in_events: number
  }>
  recent: AnalyticsEvent[]
}

type MarketingConfig = {
  meta_ad_account_id: string
  has_meta_access_token: boolean
  google_ads_customer_id: string
  has_google_ads_token: boolean
  daily_budget_inr: number
  monthly_budget_inr: number
  google_daily_budget_inr: number
  meta_daily_budget_inr: number
  max_cac_inr: number
  target_roas: number
  objective: string
  creative_focus: string
  target_product_handle: string
  ai_targeting_enabled: boolean
  content_approval_required: boolean
  reels_per_week: number
  engagement_mode: string
  is_enabled: boolean
  updated_at?: string
}

const defaultMarketingConfig: MarketingConfig = {
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

const number = (value: unknown) =>
  new Intl.NumberFormat("en-IN").format(Number(value || 0))

const currency = (value: unknown) =>
  new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(Number(value || 0))

const dateTime = (value: string) =>
  new Intl.DateTimeFormat("en-IN", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value))

const percent = (value: unknown, total: unknown) => {
  const numerator = Number(value || 0)
  const denominator = Number(total || 0)

  if (!denominator) {
    return "0%"
  }

  return `${Math.round((numerator / denominator) * 100)}%`
}

const getSourceLabel = (metadata?: Metadata) =>
  String(metadata?.traffic_source || metadata?.referrer_host || "direct")

const shortSession = (value?: string | null) =>
  value ? value.slice(0, 8) : "unknown"

const toDateTimeLocal = (date: Date) =>
  new Date(date.getTime() - date.getTimezoneOffset() * 60_000)
    .toISOString()
    .slice(0, 16)

const buildSalesActions = (summary: AnalyticsSummary | null) => {
  if (!summary) {
    return []
  }

  const actions: Array<{ label: string; detail: string; tone: "red" | "orange" | "green" | "blue" }> = []
  const sessions = Number(summary.funnel.sessions || 0)
  const product = Number(summary.funnel.product_sessions || 0)
  const cart = Number(summary.funnel.cart_sessions || 0)
  const checkout = Number(summary.funnel.checkout_sessions || 0)
  const orders = Number(summary.sales.orders || 0)
  const failures =
    Number(summary.sales.payment_failed_sessions || 0) +
    Number(summary.sales.checkout_error_sessions || 0)

  if (checkout > orders) {
    actions.push({
      label: "Recover checkout intent",
      detail: `${number(checkout - orders)} checkout sessions did not become orders. Call/WhatsApp known users and inspect payment friction.`,
      tone: "red",
    })
  }

  if (cart > checkout) {
    actions.push({
      label: "Fix cart-to-checkout drop",
      detail: `${number(cart - checkout)} cart sessions stopped before checkout. Delivery timeline, total price, or trust proof may be the objection.`,
      tone: "orange",
    })
  }

  if (product > cart) {
    actions.push({
      label: "Strengthen product close",
      detail: `${number(product - cart)} product sessions did not reach cart. Add proof, FAQ, delivery promise, and sharper CTA on top products.`,
      tone: "blue",
    })
  }

  if (failures) {
    actions.push({
      label: "Payment blocker alert",
      detail: `${number(failures)} sessions hit payment failure or checkout error. Treat this as lost revenue until reviewed.`,
      tone: "red",
    })
  }

  if (sessions && !orders) {
    actions.push({
      label: "No sale in this window",
      detail: "Traffic is not converting yet. Prioritize offer clarity, delivery confidence, and direct follow-up for logged-in visitors.",
      tone: "orange",
    })
  }

  if (!actions.length) {
    actions.push({
      label: "Sales motion healthy",
      detail: "Keep watching source quality and repeat the channels that bring cart and checkout sessions.",
      tone: "green",
    })
  }

  return actions.slice(0, 4)
}

const getTopLocationLabel = (summary: AnalyticsSummary | null) => {
  const location = summary?.locations?.find((item) => item.country !== "Unknown")

  if (!location) {
    return "Unknown"
  }

  return [location.city, location.region, location.country]
    .filter(Boolean)
    .join(", ")
}

const getTopSourceLabel = (summary: AnalyticsSummary | null) =>
  summary?.sales_by_source?.[0]?.source || summary?.sources?.[0]?.source || "direct"

const getKnownBuyerCount = (summary: AnalyticsSummary | null) => {
  const known = new Set<string>()

  for (const event of summary?.recent || []) {
    if (event.customer_email) {
      known.add(event.customer_email)
    }
  }

  return known.size
}

const getTopProductLabel = (summary: AnalyticsSummary | null) =>
  summary?.top_products?.[0]?.product || "A2 Bilona Ghee"

const getSelectedProduct = (
  summary: AnalyticsSummary | null,
  marketing: MarketingConfig
) => {
  const catalog = summary?.product_catalog || []
  const preferredHandle =
    marketing.target_product_handle ||
    summary?.top_products?.[0]?.handle ||
    catalog.find((product) => product.handle === "shreem-a2-bilona-ghee")?.handle ||
    catalog[0]?.handle

  return (
    catalog.find((product) => product.handle === preferredHandle) ||
    catalog[0] || {
      id: "",
      title: "A2 Bilona Ghee",
      handle: "shreem-a2-bilona-ghee",
      description: "Traditional Shreem product.",
      tags: [],
    }
  )
}

const getProductDemand = (
  summary: AnalyticsSummary | null,
  handle?: string
) =>
  (summary?.product_demand || []).find((item) => item.handle === handle) || {
    product: "",
    handle: handle || "",
    visits: 0,
    sessions: 0,
    logged_in_sessions: 0,
    quantity: 0,
    revenue: 0,
  }

const getProductSalesProfile = (product: ReturnType<typeof getSelectedProduct>) => {
  const haystack = [
    product.title,
    product.handle,
    product.subtitle,
    product.description,
    product.type,
    product.collection,
    ...(product.tags || []),
  ]
    .join(" ")
    .toLowerCase()

  if (haystack.includes("ghee") || haystack.includes("bilona")) {
    return {
      buyer: "premium Indian families, parents, pooja buyers, and health-conscious cooking households",
      promise: "traditional bilona process, aroma, purity confidence, and safe delivery",
      keywords: ["A2 bilona ghee", "desi cow ghee online", "traditional ghee", "pure ghee India"],
      objections: ["price vs normal ghee", "purity proof", "leakage in delivery", "shelf life"],
      hooks: ["show texture and aroma", "show packing before dispatch", "explain bilona simply"],
    }
  }

  if (haystack.includes("dhoop") || haystack.includes("pooja") || haystack.includes("cow dung")) {
    return {
      buyer: "pooja households, temples, ritual buyers, and natural fragrance customers",
      promise: "traditional ritual use, earthy aroma, simple packaging, and daily pooja fit",
      keywords: ["natural dhoop", "cow dung cakes for havan", "pooja dhoop online", "havan samagri"],
      objections: ["smoke level", "fragrance strength", "how to use safely", "pack quantity"],
      hooks: ["morning pooja setup", "havan use case", "before-after fragrance story"],
    }
  }

  if (haystack.includes("vermicompost") || haystack.includes("jeevamrut") || haystack.includes("plant")) {
    return {
      buyer: "kitchen gardeners, terrace growers, nurseries, and natural farming users",
      promise: "living soil support, easy home gardening use, and natural farm input clarity",
      keywords: ["vermicompost online", "organic manure", "kitchen garden compost", "natural farming input"],
      objections: ["how much to use", "delivery weight", "plant suitability", "repeat use"],
      hooks: ["plant growth routine", "soil texture demo", "kitchen garden result story"],
    }
  }

  if (haystack.includes("jyotish") || haystack.includes("astrology") || haystack.includes("kundli")) {
    return {
      buyer: "people seeking kundli clarity, marriage/career timing, and expert astrology review",
      promise: "clear AI reading, wallet-controlled usage, and expert call upgrade when needed",
      keywords: ["AI kundli", "online jyotish consultation", "expert astrologer call", "kundli reading"],
      objections: ["accuracy", "privacy", "when to choose expert", "wallet credits"],
      hooks: ["sample reading walkthrough", "AI vs expert use case", "privacy and credit clarity"],
    }
  }

  return {
    buyer: "India buyers who care about trust, authenticity, and clear delivery",
    promise: "clear product details, fair pricing, and reliable order support",
    keywords: [product.title, `${product.title} online`, "Shreem Farms product"],
    objections: ["trust", "delivery time", "price", "how to use"],
    hooks: ["product use demo", "packing and dispatch proof", "customer question answer"],
  }
}

const getBudgetSplit = (marketing: MarketingConfig) => {
  const totalDaily =
    Number(marketing.daily_budget_inr || 0) ||
    Number(marketing.google_daily_budget_inr || 0) +
      Number(marketing.meta_daily_budget_inr || 0)

  const google =
    Number(marketing.google_daily_budget_inr || 0) ||
    Math.round(totalDaily * 0.55)
  const meta =
    Number(marketing.meta_daily_budget_inr || 0) ||
    Math.max(totalDaily - google, 0)

  return { totalDaily, google, meta }
}

const buildAudienceSegments = (
  summary: AnalyticsSummary | null,
  marketing: MarketingConfig,
  product: ReturnType<typeof getSelectedProduct>
) => {
  const topSource = getTopSourceLabel(summary)
  const topLocation = getTopLocationLabel(summary)
  const profile = getProductSalesProfile(product)
  const maxCac = Number(marketing.max_cac_inr || 0)
  const productUrl = `/products/${product.handle}`

  return [
    {
      label: "Google Search buyers",
      platform: "Google Ads",
      intent: "High intent",
      detail: `Target exact and phrase searches for ${profile.keywords.join(", ")}. Land only on ${productUrl}. Start with ${topLocation}.`,
      guardrail: maxCac ? `Pause keywords above ${currency(maxCac)} CAC.` : "Set max CAC before scaling.",
    },
    {
      label: "Instagram trust builders",
      platform: "Instagram",
      intent: "Warm discovery",
      detail: `Run reels for ${product.title}: ${profile.hooks.join(", ")}. Retarget video viewers to ${productUrl}.`,
      guardrail: "Keep reels education-first; push sale only after engagement.",
    },
    {
      label: "Facebook family buyers",
      platform: "Facebook",
      intent: "Household purchase",
      detail: `Use ${profile.buyer}. Message around ${profile.promise}. Exclude low-engagement cities until cart intent appears.`,
      guardrail: `Scale only sources beating current top source: ${topSource}.`,
    },
    {
      label: "Cart and checkout retargeting",
      platform: "Meta + Google",
      intent: "Recovery",
      detail: `Retarget ${product.title} viewers, cart users, and checkout users with objection answers: ${profile.objections.join(", ")}.`,
      guardrail: "Never spend more than 20% daily budget on cold ads while checkout recovery exists.",
    },
  ]
}

const buildContentQueue = (
  summary: AnalyticsSummary | null,
  marketing: MarketingConfig,
  product: ReturnType<typeof getSelectedProduct>
) => {
  const focus = marketing.creative_focus || "a2_ghee"
  const topLocation = getTopLocationLabel(summary)
  const profile = getProductSalesProfile(product)

  return [
    {
      format: "Reel",
      title: `${product.title} proof in 20 seconds`,
      channel: "Instagram + Facebook",
      brief: `${profile.hooks[0]}. Show product, use case, packaging, and CTA to /products/${product.handle}. Mention delivery to ${topLocation}.`,
    },
    {
      format: "Story",
      title: "Objection answer",
      channel: "Instagram",
      brief: `Answer ${profile.objections.slice(0, 3).join(", ")}. Use poll/question sticker and link to product.`,
    },
    {
      format: "Search ad",
      title: "High-intent keywords",
      channel: "Google",
      brief: `Use ${profile.keywords.join(", ")} with price/trust extensions and product landing page.`,
    },
    {
      format: "Engagement",
      title: `${focus.replace(/_/g, " ")} objection replies`,
      channel: "Instagram comments",
      brief: "Prepare replies for price, purity, delivery, shelf life, and why Shreem is different.",
    },
  ]
}

const SalesDashboardPage = () => {
  const [rangeMode, setRangeMode] = useState("7")
  const [customStart, setCustomStart] = useState(() =>
    toDateTimeLocal(new Date(Date.now() - 7 * 24 * 60 * 60 * 1000))
  )
  const [customEnd, setCustomEnd] = useState(() => toDateTimeLocal(new Date()))
  const [loading, setLoading] = useState(false)
  const [savingMarketing, setSavingMarketing] = useState(false)
  const [error, setError] = useState("")
  const [marketingMessage, setMarketingMessage] = useState("")
  const [summary, setSummary] = useState<AnalyticsSummary | null>(null)
  const [marketing, setMarketing] = useState<MarketingConfig>(defaultMarketingConfig)
  const [metaToken, setMetaToken] = useState("")
  const [googleToken, setGoogleToken] = useState("")

  const selectedWindow = useMemo(() => {
    if (rangeMode === "custom") {
      return {
        days: "90",
        start: customStart ? new Date(customStart).toISOString() : undefined,
        end: customEnd ? new Date(customEnd).toISOString() : undefined,
      }
    }

    if (rangeMode === "live") {
      return {
        days: "1",
        start: new Date(Date.now() - 5 * 60 * 1000).toISOString(),
        end: new Date().toISOString(),
      }
    }

    return {
      days: rangeMode,
      start: undefined,
      end: undefined,
    }
  }, [customEnd, customStart, rangeMode])

  const loadAnalytics = async () => {
    setLoading(true)
    setError("")

    try {
      const result = await sdk.client.fetch<AnalyticsSummary>(
        "/admin/sales-dashboard",
        {
          method: "GET",
          query: {
            days: selectedWindow.days,
            start: selectedWindow.start,
            end: selectedWindow.end,
            limit: 50,
            _ts: Date.now(),
          },
          cache: "no-store",
        }
      )

      setSummary(result)
    } catch (error: any) {
      setError(
        error?.message ||
          "Unable to load sales monitoring. Refresh admin login and try again."
      )
    } finally {
      setLoading(false)
    }
  }

  const loadMarketing = async () => {
    try {
      const result = await sdk.client.fetch<MarketingConfig>(
        "/admin/marketing-config",
        {
          method: "GET",
          query: { _ts: Date.now() },
          cache: "no-store",
        }
      )

      setMarketing({ ...defaultMarketingConfig, ...result })
    } catch {
      setMarketingMessage("Marketing config could not be loaded.")
    }
  }

  const saveMarketing = async () => {
    setSavingMarketing(true)
    setMarketingMessage("")

    try {
      const result = await sdk.client.fetch<MarketingConfig>(
        "/admin/marketing-config",
        {
          method: "POST",
          body: {
            ...marketing,
            meta_access_token: metaToken,
            google_ads_token: googleToken,
          },
          cache: "no-store",
        }
      )

      setMarketing({ ...defaultMarketingConfig, ...result })
      setMetaToken("")
      setGoogleToken("")
      setMarketingMessage("Sales and marketing settings saved.")
    } catch (error: any) {
      setMarketingMessage(error?.message || "Unable to save marketing settings.")
    } finally {
      setSavingMarketing(false)
    }
  }

  useEffect(() => {
    loadAnalytics()
    const interval = window.setInterval(loadAnalytics, rangeMode === "live" ? 10_000 : 30_000)

    return () => window.clearInterval(interval)
  }, [selectedWindow.days, selectedWindow.end, selectedWindow.start, rangeMode])

  useEffect(() => {
    loadMarketing()
  }, [])

  const actions = buildSalesActions(summary)
  const conversion = percent(summary?.sales.orders, summary?.funnel.sessions)
  const checkoutClose = percent(summary?.sales.orders, summary?.funnel.checkout_sessions)
  const knownBuyerCount = getKnownBuyerCount(summary)
  const topSource = getTopSourceLabel(summary)
  const topLocation = getTopLocationLabel(summary)
  const loginRate = percent(summary?.funnel.logged_in_sessions, summary?.funnel.sessions)
  const productToCartRate = percent(summary?.funnel.cart_sessions, summary?.funnel.product_sessions)
  const cartToCheckoutRate = percent(summary?.funnel.checkout_sessions, summary?.funnel.cart_sessions)
  const paymentIssueRate = percent(
    Number(summary?.sales.payment_failed_sessions || 0) +
      Number(summary?.sales.checkout_error_sessions || 0),
    summary?.sales.payment_started_sessions
  )
  const selectedProduct = getSelectedProduct(summary, marketing)
  const selectedProductDemand = getProductDemand(summary, selectedProduct.handle)
  const selectedProductProfile = getProductSalesProfile(selectedProduct)
  const budgetSplit = getBudgetSplit(marketing)
  const audienceSegments = buildAudienceSegments(summary, marketing, selectedProduct)
  const contentQueue = buildContentQueue(summary, marketing, selectedProduct)

  return (
    <Container className="divide-y p-0">
      <div className="flex flex-wrap items-center justify-between gap-3 px-6 py-5">
        <div>
          <Heading>Sales Dashboard</Heading>
          <Text className="text-ui-fg-subtle">
            Revenue, source quality, product demand, payment health, and conversion leaks.
          </Text>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Select value={rangeMode} onValueChange={setRangeMode}>
            <Select.Trigger className="w-[150px]">
              <Select.Value />
            </Select.Trigger>
            <Select.Content>
              <Select.Item value="live">Live now</Select.Item>
              <Select.Item value="1">Last 24 hours</Select.Item>
              <Select.Item value="7">Last 7 days</Select.Item>
              <Select.Item value="30">Last 30 days</Select.Item>
              <Select.Item value="90">Last 90 days</Select.Item>
              <Select.Item value="custom">Custom</Select.Item>
            </Select.Content>
          </Select>
          {rangeMode === "custom" && (
            <>
              <Input
                type="datetime-local"
                value={customStart}
                onChange={(event) => setCustomStart(event.target.value)}
                className="w-[190px]"
              />
              <Input
                type="datetime-local"
                value={customEnd}
                onChange={(event) => setCustomEnd(event.target.value)}
                className="w-[190px]"
              />
            </>
          )}
          <Button variant="secondary" onClick={loadAnalytics} isLoading={loading}>
            Refresh
          </Button>
        </div>
      </div>

      <div className="grid gap-3 px-6 py-5 md:grid-cols-4">
        {[
          ["Revenue", currency(summary?.sales.revenue), `${number(summary?.sales.orders)} orders`],
          ["Conversion", conversion, `${number(summary?.funnel.sessions)} sessions`],
          ["Checkout close", checkoutClose, `${number(summary?.funnel.checkout_sessions)} checkout sessions`],
          ["Paid orders", number(summary?.sales.paid_orders), "orders with captured value"],
        ].map(([label, value, detail]) => (
          <div key={String(label)} className="rounded-lg border p-4">
            <Text size="small" className="text-ui-fg-subtle">
              {label}
            </Text>
            <Text size="xlarge" weight="plus">
              {value}
            </Text>
            <Text size="small" className="text-ui-fg-subtle">
              {detail}
            </Text>
          </div>
        ))}
      </div>

      <div className="grid gap-5 px-6 py-5 xl:grid-cols-[0.85fr_1.15fr]">
        <div className="rounded-lg border p-4">
          <Heading level="h2">Target Product</Heading>
          <Text className="mt-1 text-ui-fg-subtle">
            Pick the product for today&apos;s sales push. Audience, ads, content, and follow-up actions update from API data.
          </Text>
          <label className="mt-4 grid gap-1">
            <Text size="small" className="text-ui-fg-subtle">Product</Text>
            <Select
              value={selectedProduct.handle}
              onValueChange={(value) =>
                setMarketing((current) => ({
                  ...current,
                  target_product_handle: value,
                }))
              }
            >
              <Select.Trigger>
                <Select.Value />
              </Select.Trigger>
              <Select.Content>
                {(summary?.product_catalog?.length
                  ? summary.product_catalog
                  : [selectedProduct]
                ).map((product) => (
                  <Select.Item key={product.handle} value={product.handle}>
                    {product.title}
                  </Select.Item>
                ))}
              </Select.Content>
            </Select>
          </label>
          <div className="mt-4 grid gap-2">
            <Text weight="plus">{selectedProduct.title}</Text>
            <Text size="small" className="text-ui-fg-subtle">
              /products/{selectedProduct.handle}
            </Text>
            <Text size="small" className="text-ui-fg-subtle">
              {(selectedProduct.description || selectedProduct.subtitle || "")
                .slice(0, 220)}
            </Text>
          </div>
          <div className="mt-4 flex flex-wrap gap-2">
            {(selectedProduct.tags || []).slice(0, 6).map((tag) => (
              <Badge key={tag} color="grey">{tag}</Badge>
            ))}
            {selectedProduct.type && <Badge color="blue">{selectedProduct.type}</Badge>}
            {selectedProduct.collection && <Badge color="green">{selectedProduct.collection}</Badge>}
          </div>
        </div>

        <div className="rounded-lg border p-4">
          <Heading level="h2">Product Sales Plan</Heading>
          <div className="mt-4 grid gap-3 md:grid-cols-4">
            {[
              ["Product sessions", number(selectedProductDemand.sessions), "people who viewed this product"],
              ["Logged-in intent", number(selectedProductDemand.logged_in_sessions), "reachable sessions"],
              ["Sold qty", number(selectedProductDemand.quantity), "orders in selected range"],
              ["Revenue", currency(selectedProductDemand.revenue), "product revenue"],
            ].map(([label, value, detail]) => (
              <div key={label} className="rounded-lg border p-3">
                <Text size="small" className="text-ui-fg-subtle">{label}</Text>
                <Text weight="plus">{value}</Text>
                <Text size="small" className="text-ui-fg-subtle">{detail}</Text>
              </div>
            ))}
          </div>
          <div className="mt-4 grid gap-3 md:grid-cols-2">
            <div className="rounded-lg border p-3">
              <Text size="small" className="text-ui-fg-subtle">Buyer profile</Text>
              <Text size="small" className="mt-1">{selectedProductProfile.buyer}</Text>
            </div>
            <div className="rounded-lg border p-3">
              <Text size="small" className="text-ui-fg-subtle">Core promise</Text>
              <Text size="small" className="mt-1">{selectedProductProfile.promise}</Text>
            </div>
            <div className="rounded-lg border p-3">
              <Text size="small" className="text-ui-fg-subtle">Keywords</Text>
              <Text size="small" className="mt-1">{selectedProductProfile.keywords.join(", ")}</Text>
            </div>
            <div className="rounded-lg border p-3">
              <Text size="small" className="text-ui-fg-subtle">Sales objections</Text>
              <Text size="small" className="mt-1">{selectedProductProfile.objections.join(", ")}</Text>
            </div>
          </div>
        </div>
      </div>

      <div className="grid gap-5 px-6 py-5 xl:grid-cols-[0.9fr_1.1fr]">
        <div className="rounded-lg border p-4">
          <Heading level="h2">India Sales Run Sheet</Heading>
          <Text className="mt-1 text-ui-fg-subtle">
            Fast read for daily owner action: follow-up, delivery confidence, source quality, and payment health.
          </Text>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            {[
              ["Known follow-ups", number(knownBuyerCount), "logged-in/reachable buyers in this window"],
              ["Top source", topSource, "repeat what creates cart and checkout intent"],
              ["Top location", topLocation, "focus delivery promise and local trust"],
              ["Payment issue rate", paymentIssueRate, "failed/error sessions after payment start"],
            ].map(([label, value, detail]) => (
              <div key={label} className="rounded-lg border p-3">
                <Text size="small" className="text-ui-fg-subtle">
                  {label}
                </Text>
                <Text weight="plus" className="truncate">
                  {value}
                </Text>
                <Text size="small" className="text-ui-fg-subtle">
                  {detail}
                </Text>
              </div>
            ))}
          </div>
        </div>

        <div className="rounded-lg border p-4">
          <Heading level="h2">Conversion Quality</Heading>
          <div className="mt-4 grid gap-3 md:grid-cols-4">
            {[
              ["Login rate", loginRate, "trust/account capture"],
              ["Product to cart", productToCartRate, "offer clarity"],
              ["Cart to checkout", cartToCheckoutRate, "price/delivery confidence"],
              ["Checkout close", checkoutClose, "payment/order success"],
            ].map(([label, value, detail]) => (
              <div key={label} className="rounded-lg border p-3">
                <Text size="small" className="text-ui-fg-subtle">
                  {label}
                </Text>
                <Text size="large" weight="plus">
                  {value}
                </Text>
                <Text size="small" className="text-ui-fg-subtle">
                  {detail}
                </Text>
              </div>
            ))}
          </div>
          <Text size="small" className="mt-4 text-ui-fg-subtle">
            India selling focus: make delivery timeline visible, keep UPI/payment smooth, call known checkout users fast, and double down on the source-city pairs that reach cart.
          </Text>
        </div>
      </div>

      <div className="grid gap-5 px-6 py-5 xl:grid-cols-[1.15fr_0.85fr]">
        <div className="rounded-lg border p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <Heading level="h2">Ad Platform Control</Heading>
              <Text className="text-ui-fg-subtle">
                Google Search, Instagram, Facebook, AI targeting, and spend guardrails from one place.
              </Text>
            </div>
            <Badge color={marketing.is_enabled ? "green" : "grey"}>
              {marketing.is_enabled ? "Enabled" : "Paused"}
            </Badge>
          </div>
          <div className="mt-4 grid gap-3 md:grid-cols-2">
            <label className="grid gap-1">
              <Text size="small" className="text-ui-fg-subtle">Meta Ad Account ID</Text>
              <Input
                value={marketing.meta_ad_account_id}
                onChange={(event) =>
                  setMarketing((current) => ({
                    ...current,
                    meta_ad_account_id: event.target.value,
                  }))
                }
                placeholder="act_..."
              />
            </label>
            <label className="grid gap-1">
              <Text size="small" className="text-ui-fg-subtle">Google Ads Customer ID</Text>
              <Input
                value={marketing.google_ads_customer_id}
                onChange={(event) =>
                  setMarketing((current) => ({
                    ...current,
                    google_ads_customer_id: event.target.value,
                  }))
                }
                placeholder="123-456-7890"
              />
            </label>
            <label className="grid gap-1">
              <Text size="small" className="text-ui-fg-subtle">
                Meta Token {marketing.has_meta_access_token ? "(saved)" : ""}
              </Text>
              <Input
                type="password"
                value={metaToken}
                onChange={(event) => setMetaToken(event.target.value)}
                placeholder={marketing.has_meta_access_token ? "Leave blank to keep saved token" : "Paste Meta token"}
              />
            </label>
            <label className="grid gap-1">
              <Text size="small" className="text-ui-fg-subtle">
                Google Token {marketing.has_google_ads_token ? "(saved)" : ""}
              </Text>
              <Input
                type="password"
                value={googleToken}
                onChange={(event) => setGoogleToken(event.target.value)}
                placeholder={marketing.has_google_ads_token ? "Leave blank to keep saved token" : "Paste Google Ads token"}
              />
            </label>
            <label className="grid gap-1">
              <Text size="small" className="text-ui-fg-subtle">Total daily budget INR</Text>
              <Input
                type="number"
                value={String(marketing.daily_budget_inr)}
                onChange={(event) =>
                  setMarketing((current) => ({
                    ...current,
                    daily_budget_inr: Number(event.target.value || 0),
                  }))
                }
              />
            </label>
            <label className="grid gap-1">
              <Text size="small" className="text-ui-fg-subtle">Google daily INR</Text>
              <Input
                type="number"
                value={String(marketing.google_daily_budget_inr)}
                onChange={(event) =>
                  setMarketing((current) => ({
                    ...current,
                    google_daily_budget_inr: Number(event.target.value || 0),
                  }))
                }
              />
            </label>
            <label className="grid gap-1">
              <Text size="small" className="text-ui-fg-subtle">Meta daily INR</Text>
              <Input
                type="number"
                value={String(marketing.meta_daily_budget_inr)}
                onChange={(event) =>
                  setMarketing((current) => ({
                    ...current,
                    meta_daily_budget_inr: Number(event.target.value || 0),
                  }))
                }
              />
            </label>
            <label className="grid gap-1">
              <Text size="small" className="text-ui-fg-subtle">Monthly budget INR</Text>
              <Input
                type="number"
                value={String(marketing.monthly_budget_inr)}
                onChange={(event) =>
                  setMarketing((current) => ({
                    ...current,
                    monthly_budget_inr: Number(event.target.value || 0),
                  }))
                }
              />
            </label>
            <label className="grid gap-1">
              <Text size="small" className="text-ui-fg-subtle">Max CAC INR</Text>
              <Input
                type="number"
                value={String(marketing.max_cac_inr)}
                onChange={(event) =>
                  setMarketing((current) => ({
                    ...current,
                    max_cac_inr: Number(event.target.value || 0),
                  }))
                }
              />
            </label>
            <label className="grid gap-1">
              <Text size="small" className="text-ui-fg-subtle">Target ROAS</Text>
              <Input
                type="number"
                value={String(marketing.target_roas)}
                onChange={(event) =>
                  setMarketing((current) => ({
                    ...current,
                    target_roas: Number(event.target.value || 0),
                  }))
                }
              />
            </label>
            <label className="grid gap-1">
              <Text size="small" className="text-ui-fg-subtle">Objective</Text>
              <Select
                value={marketing.objective}
                onValueChange={(value) =>
                  setMarketing((current) => ({ ...current, objective: value }))
                }
              >
                <Select.Trigger>
                  <Select.Value />
                </Select.Trigger>
                <Select.Content>
                  <Select.Item value="sales">Sales</Select.Item>
                  <Select.Item value="leads">Leads</Select.Item>
                  <Select.Item value="traffic">Traffic</Select.Item>
                  <Select.Item value="remarketing">Remarketing</Select.Item>
                </Select.Content>
              </Select>
            </label>
            <label className="grid gap-1">
              <Text size="small" className="text-ui-fg-subtle">Creative focus</Text>
              <Select
                value={marketing.creative_focus}
                onValueChange={(value) =>
                  setMarketing((current) => ({ ...current, creative_focus: value }))
                }
              >
                <Select.Trigger>
                  <Select.Value />
                </Select.Trigger>
                <Select.Content>
                  <Select.Item value="a2_ghee">A2 Bilona Ghee</Select.Item>
                  <Select.Item value="pooja_dhoop">Pooja Dhoop</Select.Item>
                  <Select.Item value="natural_farming">Natural Farming</Select.Item>
                  <Select.Item value="astrology">Astrology</Select.Item>
                  <Select.Item value="mixed_catalog">Mixed Catalog</Select.Item>
                </Select.Content>
              </Select>
            </label>
            <label className="grid gap-1">
              <Text size="small" className="text-ui-fg-subtle">AI targeting</Text>
              <Select
                value={marketing.ai_targeting_enabled ? "enabled" : "paused"}
                onValueChange={(value) =>
                  setMarketing((current) => ({
                    ...current,
                    ai_targeting_enabled: value === "enabled",
                  }))
                }
              >
                <Select.Trigger>
                  <Select.Value />
                </Select.Trigger>
                <Select.Content>
                  <Select.Item value="enabled">Enabled</Select.Item>
                  <Select.Item value="paused">Paused</Select.Item>
                </Select.Content>
              </Select>
            </label>
            <label className="grid gap-1">
              <Text size="small" className="text-ui-fg-subtle">Reels per week</Text>
              <Input
                type="number"
                value={String(marketing.reels_per_week)}
                onChange={(event) =>
                  setMarketing((current) => ({
                    ...current,
                    reels_per_week: Number(event.target.value || 0),
                  }))
                }
              />
            </label>
            <label className="grid gap-1">
              <Text size="small" className="text-ui-fg-subtle">Content approval</Text>
              <Select
                value={marketing.content_approval_required ? "required" : "auto"}
                onValueChange={(value) =>
                  setMarketing((current) => ({
                    ...current,
                    content_approval_required: value === "required",
                  }))
                }
              >
                <Select.Trigger>
                  <Select.Value />
                </Select.Trigger>
                <Select.Content>
                  <Select.Item value="required">Manual approval</Select.Item>
                  <Select.Item value="auto">Auto-ready drafts</Select.Item>
                </Select.Content>
              </Select>
            </label>
            <label className="grid gap-1">
              <Text size="small" className="text-ui-fg-subtle">Engagement mode</Text>
              <Select
                value={marketing.engagement_mode}
                onValueChange={(value) =>
                  setMarketing((current) => ({ ...current, engagement_mode: value }))
                }
              >
                <Select.Trigger>
                  <Select.Value />
                </Select.Trigger>
                <Select.Content>
                  <Select.Item value="manual_review">Manual review</Select.Item>
                  <Select.Item value="reply_suggestions">Reply suggestions</Select.Item>
                  <Select.Item value="high_touch_sales">High-touch sales</Select.Item>
                </Select.Content>
              </Select>
            </label>
            <label className="grid gap-1">
              <Text size="small" className="text-ui-fg-subtle">Campaign switch</Text>
              <Select
                value={marketing.is_enabled ? "enabled" : "paused"}
                onValueChange={(value) =>
                  setMarketing((current) => ({
                    ...current,
                    is_enabled: value === "enabled",
                  }))
                }
              >
                <Select.Trigger>
                  <Select.Value />
                </Select.Trigger>
                <Select.Content>
                  <Select.Item value="paused">Paused</Select.Item>
                  <Select.Item value="enabled">Enabled</Select.Item>
                </Select.Content>
              </Select>
            </label>
          </div>
          <div className="mt-4 flex flex-wrap items-center gap-3">
            <Button onClick={saveMarketing} isLoading={savingMarketing}>
              Save sales setup
            </Button>
            {marketingMessage && (
              <Text size="small" className="text-ui-fg-subtle">
                {marketingMessage}
              </Text>
            )}
          </div>
        </div>

        <div className="rounded-lg border p-4">
          <Heading level="h2">Budget Guardrails</Heading>
          <div className="mt-4 grid gap-3 md:grid-cols-3">
            {[
              ["Daily cap", currency(budgetSplit.totalDaily), "hard spend target per day"],
              ["Google cap", currency(budgetSplit.google), "search intent"],
              ["Meta cap", currency(budgetSplit.meta), "Instagram/Facebook"],
              ["Monthly cap", currency(marketing.monthly_budget_inr), "owner-approved month limit"],
              ["Max CAC", currency(marketing.max_cac_inr), "customer acquisition stop-loss"],
              ["Target ROAS", `${number(marketing.target_roas)}x`, "scale only above this"],
            ].map(([label, value, detail]) => (
              <div key={label} className="rounded-lg border p-3">
                <Text size="small" className="text-ui-fg-subtle">{label}</Text>
                <Text weight="plus">{value}</Text>
                <Text size="small" className="text-ui-fg-subtle">{detail}</Text>
              </div>
            ))}
          </div>
          <Text size="small" className="mt-4 text-ui-fg-subtle">
            Production rule: keep publishing behind saved credentials, approval, and spend limits until conversion tracking is stable.
          </Text>
        </div>
      </div>

      {error && (
        <div className="px-6 py-4">
          <div className="rounded-lg border border-ui-border-error bg-ui-bg-subtle p-4">
            <Text className="text-ui-fg-base">{error}</Text>
          </div>
        </div>
      )}

      <div className="grid gap-5 px-6 py-5 xl:grid-cols-2">
        <div>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <Heading level="h2">AI Audience Targeting</Heading>
            <Badge color={marketing.ai_targeting_enabled ? "green" : "grey"}>
              {marketing.ai_targeting_enabled ? "AI on" : "AI paused"}
            </Badge>
          </div>
          <div className="mt-3 grid gap-3">
            {audienceSegments.map((segment) => (
              <div key={segment.label} className="rounded-lg border p-4">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge color={segment.intent === "High intent" ? "green" : "blue"}>
                    {segment.platform}
                  </Badge>
                  <Text weight="plus">{segment.label}</Text>
                </div>
                <Text size="small" className="mt-2 text-ui-fg-subtle">
                  {segment.detail}
                </Text>
                <Text size="small" className="mt-2 text-ui-fg-subtle">
                  {segment.guardrail}
                </Text>
              </div>
            ))}
          </div>
        </div>

        <div>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <Heading level="h2">Content & Engagement Queue</Heading>
            <Badge color={marketing.content_approval_required ? "orange" : "green"}>
              {marketing.content_approval_required ? "Approval required" : "Auto-ready drafts"}
            </Badge>
          </div>
          <div className="mt-3 grid gap-3">
            {contentQueue.map((item) => (
              <div key={`${item.format}-${item.title}`} className="rounded-lg border p-4">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge color="grey">{item.format}</Badge>
                  <Text weight="plus">{item.title}</Text>
                </div>
                <Text size="small" className="mt-1 text-ui-fg-subtle">
                  {item.channel}
                </Text>
                <Text size="small" className="mt-2 text-ui-fg-subtle">
                  {item.brief}
                </Text>
              </div>
            ))}
          </div>
          <Text size="small" className="mt-3 text-ui-fg-subtle">
            Weekly target: {number(marketing.reels_per_week)} reels. Engagement mode: {marketing.engagement_mode.replace(/_/g, " ")}.
          </Text>
        </div>
      </div>

      <div className="px-6 py-5">
        <Heading level="h2">Next Best Sales Actions</Heading>
        <div className="mt-3 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          {actions.map((action) => (
            <div key={action.label} className="rounded-lg border p-4">
              <Badge color={action.tone}>{action.label}</Badge>
              <Text size="small" className="mt-2 text-ui-fg-subtle">
                {action.detail}
              </Text>
            </div>
          ))}
        </div>
      </div>

      <div className="px-6 py-5">
        <Heading level="h2">Buying Funnel</Heading>
        <div className="mt-3 grid gap-3 md:grid-cols-6">
          {[
            ["Sessions", summary?.funnel.sessions],
            ["Logged in", summary?.funnel.logged_in_sessions],
            ["Product", summary?.funnel.product_sessions],
            ["Cart", summary?.funnel.cart_sessions],
            ["Checkout", summary?.funnel.checkout_sessions],
            ["Orders", summary?.sales.orders],
          ].map(([label, value], index) => (
            <div key={String(label)} className="rounded-lg border p-4">
              <Text size="small" className="text-ui-fg-subtle">
                {label}
              </Text>
              <Text size="large" weight="plus">
                {number(value)}
              </Text>
              {index > 0 && (
                <Text size="small" className="text-ui-fg-subtle">
                  {percent(value, summary?.funnel.sessions)} of sessions
                </Text>
              )}
            </div>
          ))}
        </div>
      </div>

      <div className="px-6 py-5">
        <Heading level="h2">Product War Room</Heading>
        <Table className="mt-3">
          <Table.Header>
            <Table.Row>
              <Table.HeaderCell>Product</Table.HeaderCell>
              <Table.HeaderCell>Visits</Table.HeaderCell>
              <Table.HeaderCell>Logged-in</Table.HeaderCell>
              <Table.HeaderCell>Sold</Table.HeaderCell>
              <Table.HeaderCell>Revenue</Table.HeaderCell>
              <Table.HeaderCell>Action</Table.HeaderCell>
            </Table.Row>
          </Table.Header>
          <Table.Body>
            {(summary?.product_demand || []).slice(0, 12).map((product) => (
              <Table.Row key={product.handle}>
                <Table.Cell className="max-w-[260px] truncate">
                  {product.product}
                </Table.Cell>
                <Table.Cell>{number(product.visits)}</Table.Cell>
                <Table.Cell>{number(product.logged_in_sessions)}</Table.Cell>
                <Table.Cell>{number(product.quantity)}</Table.Cell>
                <Table.Cell>{currency(product.revenue)}</Table.Cell>
                <Table.Cell>
                  <Button
                    size="small"
                    variant={product.handle === selectedProduct.handle ? "primary" : "secondary"}
                    onClick={() =>
                      setMarketing((current) => ({
                        ...current,
                        target_product_handle: product.handle,
                      }))
                    }
                  >
                    {product.handle === selectedProduct.handle ? "Targeting" : "Target"}
                  </Button>
                </Table.Cell>
              </Table.Row>
            ))}
          </Table.Body>
        </Table>
      </div>

      <div className="grid gap-5 px-6 py-5 lg:grid-cols-3">
        <div>
          <Heading level="h2">Source Quality</Heading>
          <Table className="mt-3">
            <Table.Header>
              <Table.Row>
                <Table.HeaderCell>Source</Table.HeaderCell>
                <Table.HeaderCell>Sessions</Table.HeaderCell>
                <Table.HeaderCell>Cart</Table.HeaderCell>
                <Table.HeaderCell>Issues</Table.HeaderCell>
              </Table.Row>
            </Table.Header>
            <Table.Body>
              {(summary?.sales_by_source || []).map((source) => (
                <Table.Row key={source.source}>
                  <Table.Cell>{source.source}</Table.Cell>
                  <Table.Cell>{number(source.sessions)}</Table.Cell>
                  <Table.Cell>{number(source.cart_sessions)}</Table.Cell>
                  <Table.Cell>{number(source.problem_sessions)}</Table.Cell>
                </Table.Row>
              ))}
            </Table.Body>
          </Table>
        </div>

        <div>
          <Heading level="h2">Top Products Sold</Heading>
          <Table className="mt-3">
            <Table.Header>
              <Table.Row>
                <Table.HeaderCell>Product</Table.HeaderCell>
                <Table.HeaderCell>Qty</Table.HeaderCell>
                <Table.HeaderCell>Revenue</Table.HeaderCell>
              </Table.Row>
            </Table.Header>
            <Table.Body>
              {(summary?.top_products || []).map((product) => (
                <Table.Row key={`${product.product}-${product.handle}`}>
                  <Table.Cell className="max-w-[220px] truncate">
                    {product.product}
                  </Table.Cell>
                  <Table.Cell>{number(product.quantity)}</Table.Cell>
                  <Table.Cell>{currency(product.revenue)}</Table.Cell>
                </Table.Row>
              ))}
            </Table.Body>
          </Table>
        </div>

        <div>
          <Heading level="h2">Payment Health</Heading>
          <div className="mt-3 grid gap-3">
            {[
              ["Payment starts", summary?.sales.payment_started_sessions],
              ["Payment failures", summary?.sales.payment_failed_sessions],
              ["Checkout errors", summary?.sales.checkout_error_sessions],
              ["Average order", currency(summary?.sales.average_order_value)],
            ].map(([label, value]) => (
              <div key={String(label)} className="rounded-lg border p-3">
                <Text size="small" className="text-ui-fg-subtle">
                  {label}
                </Text>
                <Text weight="plus">{typeof value === "string" ? value : number(value)}</Text>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="px-6 py-5">
        <div>
          <Heading level="h2">Top Pages</Heading>
          <Table className="mt-3">
            <Table.Header>
              <Table.Row>
                <Table.HeaderCell>Page</Table.HeaderCell>
                <Table.HeaderCell>Visits</Table.HeaderCell>
                <Table.HeaderCell>Logged in</Table.HeaderCell>
              </Table.Row>
            </Table.Header>
            <Table.Body>
              {(summary?.pages || []).map((page) => (
                <Table.Row key={page.path}>
                  <Table.Cell className="max-w-[280px] truncate">
                    {page.path}
                  </Table.Cell>
                  <Table.Cell>{number(page.visits)}</Table.Cell>
                  <Table.Cell>{number(page.logged_in_events)}</Table.Cell>
                </Table.Row>
              ))}
            </Table.Body>
          </Table>
        </div>
      </div>

      <div className="grid gap-5 px-6 py-5 lg:grid-cols-2">
        <div>
          <Heading level="h2">Friction Signals</Heading>
          <Table className="mt-3">
            <Table.Header>
              <Table.Row>
                <Table.HeaderCell>Signal</Table.HeaderCell>
                <Table.HeaderCell>Page</Table.HeaderCell>
                <Table.HeaderCell>Events</Table.HeaderCell>
              </Table.Row>
            </Table.Header>
            <Table.Body>
              {(summary?.friction || []).map((row) => (
                <Table.Row key={`${row.event_type}-${row.path}`}>
                  <Table.Cell>{row.event_type}</Table.Cell>
                  <Table.Cell className="max-w-[260px] truncate">
                    {row.path}
                  </Table.Cell>
                  <Table.Cell>{number(row.events)}</Table.Cell>
                </Table.Row>
              ))}
            </Table.Body>
          </Table>
        </div>

        <div>
          <Heading level="h2">Recent Journeys</Heading>
          <div className="mt-3 grid gap-3">
            {(summary?.journeys || []).slice(0, 6).map((journey) => (
              <div key={journey.session_id} className="rounded-lg border p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <Text weight="plus">
                    {journey.customer_email || `Visitor ${shortSession(journey.session_id)}`}
                  </Text>
                  <Badge color="grey">{journey.events?.length || 0} events</Badge>
                </div>
                <div className="mt-3 grid gap-2">
                  {(journey.events || []).map((event, index) => (
                    <Text key={`${journey.session_id}-${index}`} size="small">
                      {event.event_type} · {event.path} · {event.source || "direct"} · {dateTime(event.created_at)}
                    </Text>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

    </Container>
  )
}

export const config = defineRouteConfig({
  label: "Sales Dashboard",
  icon: Users,
})

export default SalesDashboardPage
