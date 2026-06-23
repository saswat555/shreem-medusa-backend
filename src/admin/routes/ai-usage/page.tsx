import { useEffect, useMemo, useState } from "react"
import { defineRouteConfig } from "@medusajs/admin-sdk"
import {
  Badge,
  Button,
  Container,
  Heading,
  Input,
  Label,
  Text,
  Textarea,
} from "@medusajs/ui"

import { sdk } from "../../lib/sdk"

type AiUsage = {
  id: string
  customer_id: string
  customer_email?: string | null
  tool: string
  input: Record<string, unknown>
  response: Record<string, unknown>
  metadata: Record<string, unknown>
  model?: string | null
  prompt_tokens?: number
  completion_tokens?: number
  total_tokens?: number
  raw_total_tokens?: number
  estimated_cost_usd?: number
  estimated_cost_inr?: number
  expert_recommended: boolean
  admin_status: string
  admin_notes?: string | null
  tags: string[]
  input_preview?: string
  response_preview?: string
  created_at?: string
}

type AiUsageSummary = {
  sessions: number
  prompt_tokens: number
  completion_tokens: number
  total_tokens: number
  estimated_cost_usd: number
  estimated_cost_inr: number
  free?: AiUsageCostSummary
  paid?: AiUsageCostSummary
  unclassified?: AiUsageCostSummary
  invoice?: AiUsageCostSummary
  sampled?: boolean
}

type AiUsageCostSummary = {
  sessions: number
  prompt_tokens: number
  completion_tokens: number
  total_tokens: number
  estimated_cost_usd: number
  estimated_cost_inr: number
}

type ViewFilter = {
  label: string
  query: Record<string, string>
}

const views: ViewFilter[] = [
  { label: "All AI Sessions", query: {} },
  {
    label: "Expert Review Suggested",
    query: { expert_recommended: "true" },
  },
  { label: "Astrology", query: { tool_prefix: "astrology" } },
  { label: "Grow AI", query: { tool: "grow_ai" } },
  { label: "Support AI", query: { tool: "support_ai" } },
  { label: "Provider Billing", query: { tool: "provider_billing_invoice" } },
]

const formatDate = (value?: string) =>
  value
    ? new Intl.DateTimeFormat("en-IN", {
        dateStyle: "medium",
        timeStyle: "short",
      }).format(new Date(value))
    : "-"

const prettyJson = (value: unknown) => JSON.stringify(value || {}, null, 2)

const formatNumber = (value?: number) =>
  new Intl.NumberFormat("en-IN").format(Math.max(0, Number(value || 0)))

const formatUsd = (value?: number) =>
  `$${Math.max(0, Number(value || 0)).toFixed(6)}`

const formatInr = (value?: number) =>
  new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 4,
  }).format(Math.max(0, Number(value || 0)))

const getAiProvider = (item?: AiUsage | null) =>
  String(item?.metadata?.ai_provider || item?.metadata?.provider || "gemini")

const getAiAttempts = (item?: AiUsage | null) =>
  Number(item?.metadata?.ai_attempts || 0)

const getAiAttemptLogs = (item?: AiUsage | null) =>
  Array.isArray(item?.metadata?.ai_attempt_logs)
    ? (item?.metadata?.ai_attempt_logs as Array<Record<string, any>>)
    : []

const emptyUsageSummary = (): AiUsageSummary => ({
  sessions: 0,
  prompt_tokens: 0,
  completion_tokens: 0,
  total_tokens: 0,
  estimated_cost_usd: 0,
  estimated_cost_inr: 0,
  free: {
    sessions: 0,
    prompt_tokens: 0,
    completion_tokens: 0,
    total_tokens: 0,
    estimated_cost_usd: 0,
    estimated_cost_inr: 0,
  },
  paid: {
    sessions: 0,
    prompt_tokens: 0,
    completion_tokens: 0,
    total_tokens: 0,
    estimated_cost_usd: 0,
    estimated_cost_inr: 0,
  },
  unclassified: {
    sessions: 0,
    prompt_tokens: 0,
    completion_tokens: 0,
    total_tokens: 0,
    estimated_cost_usd: 0,
    estimated_cost_inr: 0,
  },
  invoice: {
    sessions: 0,
    prompt_tokens: 0,
    completion_tokens: 0,
    total_tokens: 0,
    estimated_cost_usd: 0,
    estimated_cost_inr: 0,
  },
})

const statusOptions = ["new", "reviewed", "follow_up", "resolved", "archived"]

const AiUsagePage = () => {
  const [activeView, setActiveView] = useState(0)
  const [usage, setUsage] = useState<AiUsage[]>([])
  const [selected, setSelected] = useState<AiUsage | null>(null)
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [customerFilter, setCustomerFilter] = useState("")
  const [notes, setNotes] = useState("")
  const [status, setStatus] = useState("new")
  const [tags, setTags] = useState("")
  const [setupMessage, setSetupMessage] = useState("")
  const [errorMessage, setErrorMessage] = useState("")
  const [summary, setSummary] = useState<AiUsageSummary>(emptyUsageSummary())

  const activeQuery = useMemo(() => views[activeView]?.query || {}, [activeView])

  const loadUsage = async () => {
    setLoading(true)
    setErrorMessage("")

    try {
      const query: Record<string, string | number> = {
        limit: 50,
        _ts: Date.now(),
        ...activeQuery,
      }

      if (customerFilter.trim()) {
        query.customer_email = customerFilter.trim()
      }

      const res = await sdk.client.fetch<{
        usage?: AiUsage[]
        summary?: AiUsageSummary
        setup_required?: boolean
        message?: string
      }>("/admin/ai-usage", {
        method: "GET",
        query,
        cache: "no-store",
      })

      setSetupMessage(res.setup_required ? res.message || "" : "")
      setUsage(res.usage || [])
      setSummary(res.summary || emptyUsageSummary())
    } catch (error: any) {
      setUsage([])
      setSummary(emptyUsageSummary())
      setErrorMessage(
        error?.message ||
          "Unable to load AI usage. Refresh the admin session and try again."
      )
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadUsage()
  }, [activeView])

  const openUsage = async (item: AiUsage) => {
    const res = await sdk.client.fetch<{ usage: AiUsage }>(
      `/admin/ai-usage/${item.id}`,
      {
        method: "GET",
        query: {
          _ts: Date.now(),
        },
        cache: "no-store",
      }
    )
    const detail = res.usage as AiUsage

    setSelected(detail)
    setNotes(detail.admin_notes || "")
    setStatus(detail.admin_status || "new")
    setTags((detail.tags || []).join(", "))
  }

  const saveReview = async () => {
    if (!selected) {
      return
    }

    setSaving(true)

    try {
      const res = await sdk.client.fetch<{ usage: AiUsage }>(
        `/admin/ai-usage/${selected.id}`,
        {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
          },
          body: {
            admin_status: status,
            admin_notes: notes,
            tags: tags
              .split(",")
              .map((item) => item.trim())
              .filter(Boolean),
          },
        },
      )
      const updated = res.usage as AiUsage

      setSelected(updated)
      setUsage((current) =>
        current.map((item) => (item.id === updated.id ? updated : item))
      )
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <Container>
        <Heading level="h1">AI Usage</Heading>
        <Text className="text-ui-fg-subtle mt-2">
          Review customer AI sessions from Astrology, Grow AI, and Support AI.
        </Text>
        {setupMessage && (
          <div className="mt-4 rounded-lg border border-ui-border-warning bg-ui-bg-subtle p-4">
            <Text className="text-ui-fg-base">{setupMessage}</Text>
          </div>
        )}
        {errorMessage && (
          <div className="mt-4 rounded-lg border border-ui-border-error bg-ui-bg-subtle p-4">
            <Text className="text-ui-fg-base">{errorMessage}</Text>
          </div>
        )}
      </Container>

      <Container className="space-y-4">
        <div className="flex flex-wrap gap-2">
          {views.map((view, index) => (
            <Button
              key={view.label}
              variant={activeView === index ? "primary" : "secondary"}
              size="small"
              onClick={() => setActiveView(index)}
            >
              {view.label}
            </Button>
          ))}
        </div>

        <div className="flex flex-col gap-3 md:flex-row md:items-end">
          <div className="min-w-[260px]">
            <Label>Customer email</Label>
            <Input
              value={customerFilter}
              onChange={(event) => setCustomerFilter(event.target.value)}
              placeholder="Filter exact email"
            />
          </div>
          <Button isLoading={loading} onClick={loadUsage}>
            Apply Filter
          </Button>
        </div>
      </Container>

      <Container>
        <div className="grid grid-cols-1 gap-3 md:grid-cols-5">
          {[
            ["Sessions", formatNumber(summary.sessions)],
            ["Prompt tokens", formatNumber(summary.prompt_tokens)],
            ["Output tokens", formatNumber(summary.completion_tokens)],
            ["Billable tokens", formatNumber(summary.total_tokens)],
            ["Provider cost INR", formatInr(summary.estimated_cost_inr)],
          ].map(([label, value]) => (
            <div key={label} className="rounded-lg border p-4">
              <Text className="text-ui-fg-subtle text-xs">{label}</Text>
              <Text weight="plus" className="mt-1">
                {value}
              </Text>
            </div>
          ))}
        </div>
        <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-4">
          {[
            ["Free trial provider cost", summary.free],
            ["Paid credit/premium provider cost", summary.paid],
            ["Imported Google invoice cost", summary.invoice],
            ["Unclassified provider cost", summary.unclassified],
          ].map(([label, value]) => {
            const bucket = value as AiUsageCostSummary | undefined

            return (
              <div key={label as string} className="rounded-lg border p-4">
                <Text className="text-ui-fg-subtle text-xs">
                  {label as string}
                </Text>
                <Text weight="plus" className="mt-1">
                  {formatInr(bucket?.estimated_cost_inr)}
                </Text>
                <Text className="text-ui-fg-muted mt-1 text-xs">
                  {formatNumber(bucket?.sessions)} sessions ·{" "}
                  {formatNumber(bucket?.total_tokens)} billable tokens ·{" "}
                  {formatUsd(bucket?.estimated_cost_usd)}
                </Text>
              </div>
            )
          })}
        </div>
        {summary.sampled && (
          <Text className="text-ui-fg-muted mt-3 text-xs">
            Summary includes the most recent 5000 rows for this filter.
          </Text>
        )}
      </Container>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1fr)_420px]">
        <Container>
          <Heading level="h2">{views[activeView]?.label}</Heading>
          <div className="mt-4 space-y-3">
            {loading ? (
              <Text>Loading...</Text>
            ) : usage.length === 0 ? (
              <Text>No AI sessions found.</Text>
            ) : (
              usage.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => openUsage(item)}
                  className="block w-full rounded-lg border p-4 text-left hover:bg-ui-bg-subtle"
                >
                  <div className="flex flex-wrap items-center gap-2">
                    <Text weight="plus">{item.tool}</Text>
                    <Badge color={item.expert_recommended ? "orange" : "grey"}>
                      {item.expert_recommended ? "Expert suggested" : "AI only"}
                    </Badge>
                    <Badge>{item.admin_status || "new"}</Badge>
                    <Badge color="blue">{getAiProvider(item)}</Badge>
                    {getAiAttempts(item) > 1 && (
                      <Badge color="orange">{getAiAttempts(item)} attempts</Badge>
                    )}
                  </div>
                  <Text className="text-ui-fg-subtle mt-1 text-sm">
                    {item.customer_email || item.customer_id}
                  </Text>
                  <Text className="mt-2 text-sm">
                    Input: {item.input_preview || "No preview"}
                  </Text>
                  <Text className="text-ui-fg-subtle mt-1 text-sm">
                    Response: {item.response_preview || "No preview"}
                  </Text>
                  <Text className="text-ui-fg-muted mt-2 text-xs">
                    {formatDate(item.created_at)} · {item.model || "No model"} ·{" "}
                    Prompt {formatNumber(item.prompt_tokens)} · Output{" "}
                    {formatNumber(item.completion_tokens)} · Billable{" "}
                    {formatNumber(item.total_tokens)} ·{" "}
                    {formatInr(item.estimated_cost_inr)}
                  </Text>
                </button>
              ))
            )}
          </div>
        </Container>

        <Container className="space-y-4">
          <Heading level="h2">Session Detail</Heading>
          {!selected ? (
            <Text>Select an AI session to inspect the full payload.</Text>
          ) : (
            <>
              <div className="space-y-1">
                <Text weight="plus">{selected.tool}</Text>
                <Text className="text-ui-fg-subtle text-sm">
                  {selected.customer_email || selected.customer_id}
                </Text>
                <Text className="text-ui-fg-muted text-xs">
                  {formatDate(selected.created_at)} ·{" "}
                  {formatNumber(selected.total_tokens)} billable tokens ·{" "}
                  {formatInr(selected.estimated_cost_inr)} ·{" "}
                  {getAiProvider(selected)} · {getAiAttempts(selected) || 1} attempt
                  {(getAiAttempts(selected) || 1) === 1 ? "" : "s"}
                </Text>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div className="rounded-lg border p-3">
                  <Text className="text-ui-fg-subtle text-xs">Prompt tokens</Text>
                  <Text weight="plus">
                    {formatNumber(selected.prompt_tokens)}
                  </Text>
                </div>
                <div className="rounded-lg border p-3">
                  <Text className="text-ui-fg-subtle text-xs">Output tokens</Text>
                  <Text weight="plus">
                    {formatNumber(selected.completion_tokens)}
                  </Text>
                </div>
                <div className="rounded-lg border p-3">
                  <Text className="text-ui-fg-subtle text-xs">Billable tokens</Text>
                  <Text weight="plus">
                    {formatNumber(selected.total_tokens)}
                  </Text>
                  {typeof selected.raw_total_tokens === "number" &&
                    selected.raw_total_tokens !== selected.total_tokens && (
                      <Text className="text-ui-fg-muted mt-1 text-xs">
                        Provider raw total: {formatNumber(selected.raw_total_tokens)}
                      </Text>
                    )}
                </div>
                <div className="rounded-lg border p-3">
                  <Text className="text-ui-fg-subtle text-xs">Provider cost INR</Text>
                  <Text weight="plus">
                    {formatInr(selected.estimated_cost_inr)}
                  </Text>
                  <Text className="text-ui-fg-muted mt-1 text-xs">
                    {formatUsd(selected.estimated_cost_usd)}
                  </Text>
                </div>
              </div>

              <div className="grid grid-cols-1 gap-3">
                <div>
                  <Label>Status</Label>
                  <select
                    value={status}
                    onChange={(event) => setStatus(event.target.value)}
                    className="bg-ui-bg-field border-ui-border-base txt-compact-small h-8 w-full rounded-md border px-2"
                  >
                    {statusOptions.map((item) => (
                      <option key={item} value={item}>
                        {item}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <Label>Tags</Label>
                  <Input
                    value={tags}
                    onChange={(event) => setTags(event.target.value)}
                    placeholder="follow-up, gemstone, urgent"
                  />
                </div>
                <div>
                  <Label>Admin Notes</Label>
                  <Textarea
                    value={notes}
                    onChange={(event) => setNotes(event.target.value)}
                    rows={4}
                  />
                </div>
                <Button isLoading={saving} onClick={saveReview}>
                  Save Review
                </Button>
              </div>

              <div>
                <Label>Model Attempts</Label>
                {getAiAttemptLogs(selected).length ? (
                  <div className="mt-2 space-y-2">
                    {getAiAttemptLogs(selected).map((attempt, index) => (
                      <div key={index} className="rounded-lg border p-3">
                        <Text size="small" weight="plus">
                          {String(attempt.provider || "gemini")} ·{" "}
                          {String(attempt.model || selected.model || "model")}
                        </Text>
                        <Text className="text-ui-fg-muted mt-1 text-xs">
                          Attempt {String(attempt.attempt || index + 1)} ·{" "}
                          {attempt.ok ? "success" : "failed"} · status{" "}
                          {String(attempt.status || "-")} ·{" "}
                          {String(attempt.durationMs || 0)}ms
                        </Text>
                        {attempt.error && (
                          <Text className="text-ui-fg-subtle mt-1 text-xs">
                            {String(attempt.error).slice(0, 240)}
                          </Text>
                        )}
                      </div>
                    ))}
                  </div>
                ) : (
                  <Text className="text-ui-fg-subtle mt-2 text-sm">
                    No per-attempt log was stored for this session.
                  </Text>
                )}
              </div>

              <div>
                <Label>Input JSON</Label>
                <pre className="bg-ui-bg-subtle mt-2 max-h-[260px] overflow-auto rounded-lg p-3 text-xs">
                  {prettyJson(selected.input)}
                </pre>
              </div>

              <div>
                <Label>Response JSON</Label>
                <pre className="bg-ui-bg-subtle mt-2 max-h-[360px] overflow-auto rounded-lg p-3 text-xs">
                  {prettyJson(selected.response)}
                </pre>
              </div>

              <div>
                <Label>Metadata JSON</Label>
                <pre className="bg-ui-bg-subtle mt-2 max-h-[220px] overflow-auto rounded-lg p-3 text-xs">
                  {prettyJson(selected.metadata)}
                </pre>
              </div>
            </>
          )}
        </Container>
      </div>
    </div>
  )
}

export const config = defineRouteConfig({
  label: "AI Usage",
})

export default AiUsagePage
