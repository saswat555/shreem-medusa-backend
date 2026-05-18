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
  expert_recommended: boolean
  admin_status: string
  admin_notes?: string | null
  tags: string[]
  input_preview?: string
  response_preview?: string
  created_at?: string
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
]

const formatDate = (value?: string) =>
  value
    ? new Intl.DateTimeFormat("en-IN", {
        dateStyle: "medium",
        timeStyle: "short",
      }).format(new Date(value))
    : "-"

const prettyJson = (value: unknown) => JSON.stringify(value || {}, null, 2)

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

  const activeQuery = useMemo(() => views[activeView]?.query || {}, [activeView])

  const loadUsage = async () => {
    setLoading(true)

    try {
      const query: Record<string, string | number> = {
        limit: 50,
        ...activeQuery,
      }

      if (customerFilter.trim()) {
        query.customer_email = customerFilter.trim()
      }

      const res = await sdk.client.fetch("/admin/ai-usage", {
        method: "GET",
        query,
      })

      setUsage(res.usage || [])
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadUsage()
  }, [activeView])

  const openUsage = async (item: AiUsage) => {
    const res = await sdk.client.fetch(`/admin/ai-usage/${item.id}`, {
      method: "GET",
    })
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
      const res = await sdk.client.fetch(`/admin/ai-usage/${selected.id}`, {
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
      })
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
                    {formatDate(item.created_at)} · {item.model || "No model"}
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
                  {formatDate(selected.created_at)}
                </Text>
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
