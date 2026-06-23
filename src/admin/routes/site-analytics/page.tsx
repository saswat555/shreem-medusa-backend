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

import indiaStates from "../../data/india-states.json"
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
  overview: {
    visits: number
    unique_sessions: number
    logged_in_users: number
    logged_in_events: number
  }
  online: AnalyticsEvent[]
  map_points: AnalyticsEvent[]
  pages: Array<{
    path: string
    visits: number
    unique_sessions: number
    logged_in_events: number
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
  recent: AnalyticsEvent[]
}

const CITY_COORDS: Record<string, { lat: number; lon: number }> = {
  ahmedabad: { lat: 23.0225, lon: 72.5714 },
  bengaluru: { lat: 12.9716, lon: 77.5946 },
  bangalore: { lat: 12.9716, lon: 77.5946 },
  chennai: { lat: 13.0827, lon: 80.2707 },
  delhi: { lat: 28.6139, lon: 77.209 },
  gurugram: { lat: 28.4595, lon: 77.0266 },
  hyderabad: { lat: 17.385, lon: 78.4867 },
  jaipur: { lat: 26.9124, lon: 75.7873 },
  kolkata: { lat: 22.5726, lon: 88.3639 },
  lucknow: { lat: 26.8467, lon: 80.9462 },
  mumbai: { lat: 19.076, lon: 72.8777 },
  noida: { lat: 28.5355, lon: 77.391 },
  patna: { lat: 25.5941, lon: 85.1376 },
  pune: { lat: 18.5204, lon: 73.8567 },
  surat: { lat: 21.1702, lon: 72.8311 },
  varanasi: { lat: 25.3176, lon: 82.9739 },
}

const STATE_CENTERS: Record<string, { lat: number; lon: number }> = {
  "andhra pradesh": { lat: 15.9129, lon: 79.74 },
  assam: { lat: 26.2006, lon: 92.9376 },
  bihar: { lat: 25.0961, lon: 85.3131 },
  delhi: { lat: 28.6139, lon: 77.209 },
  gujarat: { lat: 22.2587, lon: 71.1924 },
  haryana: { lat: 29.0588, lon: 76.0856 },
  karnataka: { lat: 15.3173, lon: 75.7139 },
  kerala: { lat: 10.8505, lon: 76.2711 },
  maharashtra: { lat: 19.7515, lon: 75.7139 },
  odisha: { lat: 20.9517, lon: 85.0985 },
  punjab: { lat: 31.1471, lon: 75.3412 },
  rajasthan: { lat: 27.0238, lon: 74.2179 },
  "tamil nadu": { lat: 11.1271, lon: 78.6569 },
  telangana: { lat: 18.1124, lon: 79.0193 },
  "uttar pradesh": { lat: 26.8467, lon: 80.9462 },
  "west bengal": { lat: 22.9868, lon: 87.855 },
}

const WIDTH = 720
const HEIGHT = 780
const BBOX = { minLon: 68, maxLon: 98, minLat: 6, maxLat: 37 }

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

const normalizeKey = (value?: string | null) =>
  String(value || "")
    .trim()
    .toLowerCase()
    .replace(/&/g, "and")
    .replace(/\s+/g, " ")

const getLocation = (metadata?: Metadata) => metadata?.request_location || {}

const getLocationLabel = (metadata?: Metadata) => {
  const location = getLocation(metadata)
  const parts = [location.city, location.region, location.country]
    .map((item) => String(item || "").trim())
    .filter(Boolean)

  return parts.length ? parts.join(", ") : "Unknown"
}

const getSourceLabel = (metadata?: Metadata) =>
  String(metadata?.traffic_source || metadata?.referrer_host || "direct")

const getLandingLabel = (metadata?: Metadata) =>
  String(metadata?.attribution?.landing_page || "-")

const toDateTimeLocal = (date: Date) =>
  new Date(date.getTime() - date.getTimezoneOffset() * 60_000)
    .toISOString()
    .slice(0, 16)

const project = (lon: number, lat: number) => ({
  x: ((lon - BBOX.minLon) / (BBOX.maxLon - BBOX.minLon)) * WIDTH,
  y: ((BBOX.maxLat - lat) / (BBOX.maxLat - BBOX.minLat)) * HEIGHT,
})

const ringToPath = (ring: number[][]) =>
  ring
    .map(([lon, lat], index) => {
      const point = project(lon, lat)
      return `${index === 0 ? "M" : "L"}${point.x.toFixed(1)} ${point.y.toFixed(1)}`
    })
    .join(" ") + " Z"

const featureToPath = (feature: any) => {
  const geometry = feature.geometry

  if (geometry?.type === "Polygon") {
    return geometry.coordinates.map(ringToPath).join(" ")
  }

  if (geometry?.type === "MultiPolygon") {
    return geometry.coordinates
      .map((polygon: number[][][]) => polygon.map(ringToPath).join(" "))
      .join(" ")
  }

  return ""
}

const getEventState = (event: AnalyticsEvent) => {
  const location = getLocation(event.metadata_json)
  return normalizeKey(location.region || location.state || "")
}

const getEventCoords = (event: AnalyticsEvent, index: number) => {
  const location = getLocation(event.metadata_json)
  const rawLat = Number(location.latitude)
  const rawLon = Number(location.longitude)
  const city = normalizeKey(location.city)
  const state = getEventState(event)
  const candidate =
    Number.isFinite(rawLat) && Number.isFinite(rawLon)
      ? { lat: rawLat, lon: rawLon }
      : CITY_COORDS[city] || STATE_CENTERS[state]

  if (!candidate) {
    return null
  }

  const jitter = ((index % 7) - 3) * 0.08
  const point = project(candidate.lon + jitter, candidate.lat + jitter / 2)

  return {
    ...point,
    city: String(location.city || "Unknown"),
    state,
    label: getLocationLabel(event.metadata_json),
    source: getSourceLabel(event.metadata_json),
  }
}

const dedupeEvents = (events: AnalyticsEvent[]) => {
  const seen = new Set<string>()

  return events.filter((event) => {
    const key = [
      event.session_id || "unknown",
      event.event_type || "page_view",
      event.path,
      new Date(event.created_at).toISOString().slice(0, 16),
    ].join("|")

    if (seen.has(key)) {
      return false
    }

    seen.add(key)
    return true
  })
}

const SmartUserMonitorPage = () => {
  const [rangeMode, setRangeMode] = useState("live")
  const [customStart, setCustomStart] = useState(() =>
    toDateTimeLocal(new Date(Date.now() - 24 * 60 * 60 * 1000))
  )
  const [customEnd, setCustomEnd] = useState(() => toDateTimeLocal(new Date()))
  const [selectedState, setSelectedState] = useState("")
  const [selectedEvent, setSelectedEvent] = useState<AnalyticsEvent | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState("")
  const [summary, setSummary] = useState<AnalyticsSummary | null>(null)

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
        start: new Date(Date.now() - 10 * 60 * 1000).toISOString(),
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
        "/admin/site-analytics",
        {
          method: "GET",
          query: {
            days: selectedWindow.days,
            start: selectedWindow.start,
            end: selectedWindow.end,
            limit: 100,
            _ts: Date.now(),
          },
          cache: "no-store",
        }
      )

      setSummary(result)
    } catch (error: any) {
      setError(error?.message || "Unable to load user monitoring.")
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadAnalytics()
    const interval = window.setInterval(loadAnalytics, rangeMode === "live" ? 10_000 : 30_000)

    return () => window.clearInterval(interval)
  }, [rangeMode, selectedWindow.days, selectedWindow.end, selectedWindow.start])

  const events = rangeMode === "live" ? summary?.online || [] : summary?.map_points || []
  const dedupedRecent = dedupeEvents(summary?.recent || [])
  const stateCounts = new Map<string, number>()

  for (const event of events) {
    const state = getEventState(event)

    if (state) {
      stateCounts.set(state, (stateCounts.get(state) || 0) + 1)
    }
  }

  const maxStateCount = Math.max(...Array.from(stateCounts.values()), 1)
  const selectedStateEvents = events.filter((event) =>
    selectedState ? getEventState(event) === selectedState : true
  )
  const pins = selectedStateEvents
    .map((event, index) => {
      const point = getEventCoords(event, index)
      return point ? { ...point, event } : null
    })
    .filter(Boolean) as Array<ReturnType<typeof getEventCoords> & { event: AnalyticsEvent }>
  const knownUsers = new Set(
    events.map((event) => event.customer_email).filter(Boolean)
  )
  const selectedStateLabel =
    (indiaStates as any).features.find(
      (feature: any) => normalizeKey(feature.properties?.ST_NM) === selectedState
    )?.properties?.ST_NM || "All India"

  return (
    <Container className="divide-y p-0">
      <div className="flex flex-wrap items-center justify-between gap-3 px-6 py-5">
        <div>
          <Heading>Smart User Monitor</Heading>
          <Text className="text-ui-fg-subtle">
            Clean live sessions, real state map, source and page journeys without repeated noise.
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

      {error && (
        <div className="px-6 py-4">
          <div className="rounded-lg border border-ui-border-error bg-ui-bg-subtle p-4">
            <Text>{error}</Text>
          </div>
        </div>
      )}

      <div className="grid gap-3 px-6 py-5 md:grid-cols-4">
        {[
          ["Active sessions", number(events.length), "deduped latest sessions"],
          ["Known users", number(knownUsers.size), "logged-in/reachable"],
          ["Login rate", percent(summary?.overview.logged_in_users, summary?.overview.unique_sessions), "users identified"],
          ["Unique sessions", number(summary?.overview.unique_sessions), "selected window"],
        ].map(([label, value, detail]) => (
          <div key={label} className="rounded-lg border p-4">
            <Text size="small" className="text-ui-fg-subtle">{label}</Text>
            <Text size="xlarge" weight="plus">{value}</Text>
            <Text size="small" className="text-ui-fg-subtle">{detail}</Text>
          </div>
        ))}
      </div>

      <div className="grid gap-5 px-6 py-5 xl:grid-cols-[1.2fr_0.8fr]">
        <div>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <Heading level="h2">India State Map</Heading>
              <Text className="text-ui-fg-subtle">
                Click a state to drill into city/session pinpoints. Darker states have more requests.
              </Text>
            </div>
            <Button variant="secondary" onClick={() => setSelectedState("")}>
              All India
            </Button>
          </div>
          <div className="relative mt-4 overflow-hidden rounded-lg border bg-ui-bg-subtle">
            <svg viewBox={`0 0 ${WIDTH} ${HEIGHT}`} className="h-[660px] w-full">
              {(indiaStates as any).features.map((feature: any) => {
                const stateName = feature.properties?.ST_NM || "Unknown"
                const stateKey = normalizeKey(stateName)
                const count = stateCounts.get(stateKey) || 0
                const active = selectedState === stateKey
                const opacity = count ? 0.22 + (count / maxStateCount) * 0.58 : 0.08

                return (
                  <path
                    key={stateName}
                    d={featureToPath(feature)}
                    onClick={() => setSelectedState(stateKey)}
                    className="cursor-pointer transition hover:opacity-90"
                    fill={active ? "rgba(212,161,38,0.72)" : `rgba(13,129,126,${opacity})`}
                    stroke={active ? "rgba(111,33,31,0.9)" : "rgba(18,63,99,0.35)"}
                    strokeWidth={active ? 1.5 : 0.7}
                  >
                    <title>{stateName}: {number(count)} request sessions</title>
                  </path>
                )
              })}
              {pins.map((pin) => (
                <circle
                  key={`${pin.event.session_id}-${pin.event.created_at}`}
                  cx={pin.x}
                  cy={pin.y}
                  r={selectedState ? 6 : 4}
                  fill={
                    pin.event.is_logged_in
                      ? "rgba(22,101,52,0.95)"
                      : "rgba(111,33,31,0.88)"
                  }
                  stroke="#fff"
                  strokeWidth="2"
                  onClick={() => setSelectedEvent(pin.event)}
                  className="cursor-pointer"
                >
                  <title>{pin.label} · {pin.event.path}</title>
                </circle>
              ))}
            </svg>
          </div>
        </div>

        <div className="grid content-start gap-4">
          <div className="rounded-lg border p-4">
            <Heading level="h2">{selectedStateLabel}</Heading>
            <Text className="mt-1 text-ui-fg-subtle">
              {number(selectedStateEvents.length)} session requests in this view.
            </Text>
            <Table className="mt-3">
              <Table.Header>
                <Table.Row>
                  <Table.HeaderCell>City</Table.HeaderCell>
                  <Table.HeaderCell>Source</Table.HeaderCell>
                  <Table.HeaderCell>Page</Table.HeaderCell>
                </Table.Row>
              </Table.Header>
              <Table.Body>
                {selectedStateEvents.slice(0, 12).map((event) => (
                  <Table.Row key={`${event.session_id}-${event.created_at}`}>
                    <Table.Cell className="max-w-[120px] truncate">
                      {getLocation(event.metadata_json).city || "Unknown"}
                    </Table.Cell>
                    <Table.Cell>{getSourceLabel(event.metadata_json)}</Table.Cell>
                    <Table.Cell className="max-w-[180px] truncate">{event.path}</Table.Cell>
                  </Table.Row>
                ))}
              </Table.Body>
            </Table>
          </div>

          <div className="rounded-lg border p-4">
            <Heading level="h2">Selected Request</Heading>
            {selectedEvent ? (
              <div className="mt-3 grid gap-2">
                <Text weight="plus">
                  {selectedEvent.customer_email || `Visitor ${shortSession(selectedEvent.session_id)}`}
                </Text>
                <Text size="small">Page: {selectedEvent.path}</Text>
                <Text size="small">Location: {getLocationLabel(selectedEvent.metadata_json)}</Text>
                <Text size="small">Source: {getSourceLabel(selectedEvent.metadata_json)}</Text>
                <Text size="small">Landing: {getLandingLabel(selectedEvent.metadata_json)}</Text>
                <Text size="small">Last seen: {dateTime(selectedEvent.created_at)}</Text>
              </div>
            ) : (
              <Text className="mt-3 text-ui-fg-subtle">
                Click a city pinpoint to inspect the latest request.
              </Text>
            )}
          </div>
        </div>
      </div>

      <div className="grid gap-5 px-6 py-5 lg:grid-cols-2">
        <div>
          <Heading level="h2">Online Sessions</Heading>
          <Table className="mt-3">
            <Table.Header>
              <Table.Row>
                <Table.HeaderCell>User</Table.HeaderCell>
                <Table.HeaderCell>Page</Table.HeaderCell>
                <Table.HeaderCell>Location</Table.HeaderCell>
                <Table.HeaderCell>Source</Table.HeaderCell>
              </Table.Row>
            </Table.Header>
            <Table.Body>
              {(summary?.online || []).map((event) => (
                <Table.Row key={event.session_id}>
                  <Table.Cell>
                    {event.is_logged_in ? (
                      <Badge color="green">{event.customer_email || "Logged in"}</Badge>
                    ) : (
                      <Badge color="blue">Visitor {shortSession(event.session_id)}</Badge>
                    )}
                  </Table.Cell>
                  <Table.Cell className="max-w-[240px] truncate">{event.path}</Table.Cell>
                  <Table.Cell className="max-w-[180px] truncate">
                    {getLocationLabel(event.metadata_json)}
                  </Table.Cell>
                  <Table.Cell>{getSourceLabel(event.metadata_json)}</Table.Cell>
                </Table.Row>
              ))}
            </Table.Body>
          </Table>
        </div>

        <div>
          <Heading level="h2">Smart Recent Activity</Heading>
          <Text className="text-ui-fg-subtle">
            Repeated same-session values are collapsed by minute.
          </Text>
          <Table className="mt-3">
            <Table.Header>
              <Table.Row>
                <Table.HeaderCell>Time</Table.HeaderCell>
                <Table.HeaderCell>Event</Table.HeaderCell>
                <Table.HeaderCell>Page</Table.HeaderCell>
                <Table.HeaderCell>Source</Table.HeaderCell>
              </Table.Row>
            </Table.Header>
            <Table.Body>
              {dedupedRecent.slice(0, 30).map((event) => (
                <Table.Row key={event.id || `${event.session_id}-${event.created_at}`}>
                  <Table.Cell>{dateTime(event.created_at)}</Table.Cell>
                  <Table.Cell>{event.event_type || "page_view"}</Table.Cell>
                  <Table.Cell className="max-w-[240px] truncate">{event.path}</Table.Cell>
                  <Table.Cell>{getSourceLabel(event.metadata_json)}</Table.Cell>
                </Table.Row>
              ))}
            </Table.Body>
          </Table>
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
                <Table.HeaderCell>Sessions</Table.HeaderCell>
              </Table.Row>
            </Table.Header>
            <Table.Body>
              {(summary?.pages || []).slice(0, 20).map((page) => (
                <Table.Row key={page.path}>
                  <Table.Cell className="max-w-[300px] truncate">{page.path}</Table.Cell>
                  <Table.Cell>{number(page.visits)}</Table.Cell>
                  <Table.Cell>{number(page.unique_sessions)}</Table.Cell>
                </Table.Row>
              ))}
            </Table.Body>
          </Table>
        </div>

        <div>
          <Heading level="h2">Traffic Sources</Heading>
          <Table className="mt-3">
            <Table.Header>
              <Table.Row>
                <Table.HeaderCell>Source</Table.HeaderCell>
                <Table.HeaderCell>Visits</Table.HeaderCell>
                <Table.HeaderCell>Sessions</Table.HeaderCell>
              </Table.Row>
            </Table.Header>
            <Table.Body>
              {(summary?.sources || []).slice(0, 20).map((source) => (
                <Table.Row key={source.source}>
                  <Table.Cell>{source.source}</Table.Cell>
                  <Table.Cell>{number(source.visits)}</Table.Cell>
                  <Table.Cell>{number(source.unique_sessions)}</Table.Cell>
                </Table.Row>
              ))}
            </Table.Body>
          </Table>
        </div>
      </div>
    </Container>
  )
}

export const config = defineRouteConfig({
  label: "User Monitor",
  icon: Users,
})

export default SmartUserMonitorPage
