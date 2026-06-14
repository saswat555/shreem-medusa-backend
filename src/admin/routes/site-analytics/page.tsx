import { useEffect, useState } from "react"
import { defineRouteConfig } from "@medusajs/admin-sdk"
import { Users } from "@medusajs/icons"
import { Badge, Button, Container, Heading, Select, Table, Text } from "@medusajs/ui"

import { sdk } from "../../lib/sdk"

type AnalyticsSummary = {
  days: number
  overview: {
    visits: number
    unique_sessions: number
    logged_in_users: number
    logged_in_events: number
  }
  funnel: {
    sessions: number
    logged_in_sessions: number
    product_sessions: number
    cart_sessions: number
    checkout_sessions: number
    purchase_sessions: number
  }
  online: Array<{
    session_id: string
    customer_email?: string | null
    is_logged_in: boolean
    path: string
    title?: string | null
    referrer?: string | null
    created_at: string
  }>
  referrers: Array<{
    referrer: string
    visits: number
    unique_sessions: number
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
  recent: Array<{
    id: number
    event_type?: string
    path: string
    title?: string | null
    referrer?: string | null
    customer_email?: string | null
    is_logged_in: boolean
    created_at: string
  }>
}

const number = (value: unknown) =>
  new Intl.NumberFormat("en-IN").format(Number(value || 0))

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

const shortSession = (value?: string | null) =>
  value ? value.slice(0, 8) : "unknown"

const SiteAnalyticsPage = () => {
  const [days, setDays] = useState("7")
  const [loading, setLoading] = useState(false)
  const [summary, setSummary] = useState<AnalyticsSummary | null>(null)

  const loadAnalytics = async () => {
    setLoading(true)

    try {
      const result = await sdk.client.fetch<AnalyticsSummary>(
        "/admin/site-analytics",
        {
          method: "GET",
          query: {
            days,
            limit: 30,
          },
        }
      )

      setSummary(result)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadAnalytics()
    const interval = window.setInterval(loadAnalytics, 30_000)

    return () => window.clearInterval(interval)
  }, [days])

  const funnelSteps = [
    ["Sessions", summary?.funnel.sessions],
    ["Logged in", summary?.funnel.logged_in_sessions],
    ["Product viewed", summary?.funnel.product_sessions],
    ["Cart reached", summary?.funnel.cart_sessions],
    ["Checkout reached", summary?.funnel.checkout_sessions],
    ["Purchased", summary?.funnel.purchase_sessions],
  ]

  return (
    <Container className="divide-y p-0">
      <div className="flex flex-wrap items-center justify-between gap-3 px-6 py-5">
        <div>
          <Heading>Site Monitoring</Heading>
          <Text className="text-ui-fg-subtle">
            Live sessions, journeys, funnel drop-offs, referrers, and checkout friction.
          </Text>
        </div>
        <div className="flex items-center gap-2">
          <Select value={days} onValueChange={setDays}>
            <Select.Trigger className="w-[150px]">
              <Select.Value />
            </Select.Trigger>
            <Select.Content>
              <Select.Item value="1">Last 24 hours</Select.Item>
              <Select.Item value="7">Last 7 days</Select.Item>
              <Select.Item value="30">Last 30 days</Select.Item>
              <Select.Item value="90">Last 90 days</Select.Item>
            </Select.Content>
          </Select>
          <Button variant="secondary" onClick={loadAnalytics} isLoading={loading}>
            Refresh
          </Button>
        </div>
      </div>

      <div className="grid gap-3 px-6 py-5 md:grid-cols-4">
        {[
          ["Online now", summary?.online.length],
          ["Visits", summary?.overview.visits],
          ["Unique sessions", summary?.overview.unique_sessions],
          ["Logged-in users", summary?.overview.logged_in_users],
        ].map(([label, value]) => (
          <div key={String(label)} className="rounded-lg border p-4">
            <Text size="small" className="text-ui-fg-subtle">
              {label}
            </Text>
            <Text size="xlarge" weight="plus">
              {number(value)}
            </Text>
          </div>
        ))}
      </div>

      <div className="px-6 py-5">
        <Heading level="h2">Online Now</Heading>
        <Text className="text-ui-fg-subtle">
          Sessions with activity in the last five minutes.
        </Text>
        <Table className="mt-3">
          <Table.Header>
            <Table.Row>
              <Table.HeaderCell>User</Table.HeaderCell>
              <Table.HeaderCell>Current page</Table.HeaderCell>
              <Table.HeaderCell>Last seen</Table.HeaderCell>
              <Table.HeaderCell>Referrer</Table.HeaderCell>
            </Table.Row>
          </Table.Header>
          <Table.Body>
            {(summary?.online || []).map((session) => (
              <Table.Row key={session.session_id}>
                <Table.Cell>
                  {session.is_logged_in ? (
                    <Badge color="green">
                      {session.customer_email || shortSession(session.session_id)}
                    </Badge>
                  ) : (
                    <Badge color="blue">Visitor {shortSession(session.session_id)}</Badge>
                  )}
                </Table.Cell>
                <Table.Cell className="max-w-[340px] truncate">
                  {session.path}
                </Table.Cell>
                <Table.Cell>{dateTime(session.created_at)}</Table.Cell>
                <Table.Cell className="max-w-[260px] truncate">
                  {session.referrer || "Direct"}
                </Table.Cell>
              </Table.Row>
            ))}
          </Table.Body>
        </Table>
      </div>

      <div className="px-6 py-5">
        <Heading level="h2">Buying Funnel</Heading>
        <div className="mt-3 grid gap-3 md:grid-cols-6">
          {funnelSteps.map(([label, value], index) => (
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

      <div className="grid gap-5 px-6 py-5 lg:grid-cols-2">
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

        <div>
          <Heading level="h2">Referrers</Heading>
          <Table className="mt-3">
            <Table.Header>
              <Table.Row>
                <Table.HeaderCell>Source</Table.HeaderCell>
                <Table.HeaderCell>Visits</Table.HeaderCell>
                <Table.HeaderCell>Sessions</Table.HeaderCell>
              </Table.Row>
            </Table.Header>
            <Table.Body>
              {(summary?.referrers || []).map((referrer) => (
                <Table.Row key={referrer.referrer}>
                  <Table.Cell className="max-w-[280px] truncate">
                    {referrer.referrer}
                  </Table.Cell>
                  <Table.Cell>{number(referrer.visits)}</Table.Cell>
                  <Table.Cell>{number(referrer.unique_sessions)}</Table.Cell>
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
          <Heading level="h2">Daily Trend</Heading>
          <Table className="mt-3">
            <Table.Header>
              <Table.Row>
                <Table.HeaderCell>Day</Table.HeaderCell>
                <Table.HeaderCell>Visits</Table.HeaderCell>
                <Table.HeaderCell>Sessions</Table.HeaderCell>
              </Table.Row>
            </Table.Header>
            <Table.Body>
              {(summary?.daily || []).map((day) => (
                <Table.Row key={day.day}>
                  <Table.Cell>{String(day.day).slice(0, 10)}</Table.Cell>
                  <Table.Cell>{number(day.visits)}</Table.Cell>
                  <Table.Cell>{number(day.unique_sessions)}</Table.Cell>
                </Table.Row>
              ))}
            </Table.Body>
          </Table>
        </div>
      </div>

      <div className="px-6 py-5">
        <Heading level="h2">Recent Journeys</Heading>
        <div className="mt-3 grid gap-3">
          {(summary?.journeys || []).slice(0, 10).map((journey) => (
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
                    {event.event_type} · {event.path} · {dateTime(event.created_at)}
                  </Text>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="px-6 py-5">
        <Heading level="h2">Recent Activity</Heading>
        <Table className="mt-3">
          <Table.Header>
            <Table.Row>
              <Table.HeaderCell>Time</Table.HeaderCell>
              <Table.HeaderCell>Event</Table.HeaderCell>
              <Table.HeaderCell>Page</Table.HeaderCell>
              <Table.HeaderCell>User</Table.HeaderCell>
              <Table.HeaderCell>Referrer</Table.HeaderCell>
            </Table.Row>
          </Table.Header>
          <Table.Body>
            {(summary?.recent || []).map((event) => (
              <Table.Row key={event.id}>
                <Table.Cell>{dateTime(event.created_at)}</Table.Cell>
                <Table.Cell>{event.event_type || "page_view"}</Table.Cell>
                <Table.Cell className="max-w-[260px] truncate">
                  {event.path}
                </Table.Cell>
                <Table.Cell>
                  {event.is_logged_in ? (
                    <Badge color="green">{event.customer_email || "Logged in"}</Badge>
                  ) : (
                    <Badge color="grey">Visitor</Badge>
                  )}
                </Table.Cell>
                <Table.Cell className="max-w-[240px] truncate">
                  {event.referrer || "-"}
                </Table.Cell>
              </Table.Row>
            ))}
          </Table.Body>
        </Table>
      </div>
    </Container>
  )
}

export const config = defineRouteConfig({
  label: "Site Monitoring",
  icon: Users,
})

export default SiteAnalyticsPage
