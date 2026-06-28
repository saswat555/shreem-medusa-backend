import { useEffect, useMemo, useState } from "react"
import { defineRouteConfig } from "@medusajs/admin-sdk"
import {
  Badge,
  Button,
  Container,
  Heading,
  Input,
  Label,
  Select,
  Text,
} from "@medusajs/ui"
import { sdk } from "../../lib/sdk"

type ReceiptMode = "pending" | "all"
type ReceiptLayout = "two-a4" | "four-a4" | "label"

type Address = {
  name: string
  line1?: string
  line2?: string
  city?: string
  province?: string
  postal_code?: string
  country_code?: string
  phone?: string
  email?: string
  lines?: string[]
}

type ReceiptOrder = {
  id: string
  display_id?: string
  order_label: string
  email?: string
  created_at?: string
  currency_code?: string
  total?: number
  status?: string
  fulfillment_status?: string
  payment_status?: string
  pending?: boolean
  total_quantity?: number
  items?: {
    title: string
    quantity: number
    unit_price?: number
  }[]
  ship_to: {
    name: string
    lines: string[]
    phone?: string
  }
}

type PrintableReceiptOrder = ReceiptOrder & {
  receiptCopyIndex?: number
}

const formatDate = (value?: string) => {
  if (!value) return "-"

  return new Intl.DateTimeFormat("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(new Date(value))
}

const formatCurrency = (value = 0, currency = "INR") =>
  new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency,
    maximumFractionDigits: 0,
  }).format(value / 100)

const fromLines = (from: Address) =>
  [
    from.name,
    from.line1,
    from.line2,
    [from.city, from.province, from.postal_code].filter(Boolean).join(", "),
    from.country_code,
    from.phone ? `Phone: ${from.phone}` : "",
    from.email ? `Email: ${from.email}` : "",
  ]
    .filter(Boolean)
    .map(String)

const ReceiptCard = ({
  order,
  from,
  copyCount,
}: {
  order: PrintableReceiptOrder
  from: Address
  copyCount: number
}) => (
  <section className="receipt-card">
    <div className="receipt-row">
      <div>
        <div className="receipt-label">Shreem Farms Receipt</div>
        <div className="receipt-name">{order.order_label}</div>
        <div className="receipt-text">
          Date: {formatDate(order.created_at)}
          {copyCount > 1
            ? ` · Copy ${order.receiptCopyIndex || 1}/${copyCount}`
            : ""}
        </div>
      </div>
      <img src="/logo.jpeg" alt="Shreem Farms" className="receipt-logo" />
    </div>

    <div className="receipt-block">
      <div className="receipt-label">To</div>
      <div className="receipt-name">{order.ship_to.name}</div>
      <div className="receipt-text">
        {order.ship_to.lines.map((line, index) => (
          <div key={`${line}-${index}`}>{line}</div>
        ))}
        {order.ship_to.phone && <div>Phone: {order.ship_to.phone}</div>}
      </div>
    </div>

    <div className="receipt-block">
      <div className="receipt-label">From</div>
      <div className="receipt-text">
        {fromLines(from).map((line, index) => (
          <div key={`${line}-${index}`}>{line}</div>
        ))}
      </div>
    </div>

    <div className="receipt-block">
      <div className="receipt-label">Order Contents</div>
      <ul className="receipt-items">
        {(order.items || []).slice(0, 6).map((item, index) => (
          <li key={`${item.title}-${item.quantity}-${index}`}>
            {item.quantity} x {item.title}
          </li>
        ))}
      </ul>
      {(order.items || []).length > 6 && (
        <div className="receipt-text">
          + {(order.items || []).length - 6} more line items
        </div>
      )}
      <div className="receipt-row receipt-text">
        <span>Total qty: {order.total_quantity || 0}</span>
        <span>{formatCurrency(order.total, order.currency_code)}</span>
      </div>
    </div>

    <div className="receipt-text" style={{ marginTop: 8 }}>
      Packed by: ____________ &nbsp; Checked by: ____________
    </div>
  </section>
)

const OrderReceiptsPage = () => {
  const initialOrderId = useMemo(() => {
    if (typeof window === "undefined") {
      return ""
    }

    return new URLSearchParams(window.location.search).get("order_id") || ""
  }, [])
  const [orders, setOrders] = useState<ReceiptOrder[]>([])
  const [from, setFrom] = useState<Address>({ name: "Shreem Farms" })
  const [mode, setMode] = useState<ReceiptMode>(initialOrderId ? "all" : "pending")
  const [layout, setLayout] = useState<ReceiptLayout>("two-a4")
  const [copies, setCopies] = useState("1")
  const [query, setQuery] = useState("")
  const [selectedIds, setSelectedIds] = useState<string[]>([])
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState("")

  const copyCount = Math.max(1, Math.min(8, Number(copies || 1) || 1))
  const selectedSet = useMemo(() => new Set(selectedIds), [selectedIds])
  const filteredOrders = useMemo(() => {
    const q = query.trim().toLowerCase()

    if (!q) {
      return orders
    }

    return orders.filter((order) =>
      [
        order.order_label,
        order.id,
        order.email,
        order.ship_to?.name,
        order.ship_to?.phone,
        ...(order.ship_to?.lines || []),
        ...(order.items || []).map((item) => item.title),
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase()
        .includes(q)
    )
  }, [orders, query])
  const printableOrders = useMemo(() => {
    const base = selectedIds.length
      ? filteredOrders.filter((order) => selectedSet.has(order.id))
      : filteredOrders

    return base.flatMap((order) =>
      Array.from({ length: copyCount }, (_, index) => ({
        ...order,
        receiptCopyIndex: index + 1,
      }))
    )
  }, [copyCount, filteredOrders, selectedIds.length, selectedSet])

  const loadOrders = async () => {
    setLoading(true)
    setMessage("")

    try {
      const res = await sdk.client.fetch<{
        from: Address
        orders: ReceiptOrder[]
        count: number
      }>("/admin/order-receipts", {
        method: "GET",
        query: {
          mode,
          order_id: initialOrderId || undefined,
          limit: 200,
          _: Date.now(),
        },
        cache: "no-store",
      } as any)

      setFrom(res.from || { name: "Shreem Farms" })
      setOrders(res.orders || [])
      setSelectedIds(
        initialOrderId && (res.orders || []).some((order) => order.id === initialOrderId)
          ? [initialOrderId]
          : []
      )
      setMessage(`Loaded ${res.count || 0} ${mode === "pending" ? "pending" : ""} orders.`)
    } catch (error: any) {
      setMessage(error?.message || "Unable to load orders.")
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadOrders()
  }, [mode, initialOrderId])

  const toggleSelected = (id: string) => {
    setSelectedIds((current) =>
      current.includes(id)
        ? current.filter((item) => item !== id)
        : [...current, id]
    )
  }

  const selectFiltered = () => {
    setSelectedIds(filteredOrders.map((order) => order.id))
  }

  const printReceipts = () => {
    if (!printableOrders.length) {
      setMessage("No receipts selected to print.")
      return
    }

    window.print()
  }

  return (
    <div className="flex flex-col gap-6">
      <style>{`
        .receipt-print-area { display: none; }
        .receipt-sheet { display: grid; gap: 10mm; }
        .receipt-sheet.two-a4 { grid-template-columns: repeat(2, minmax(0, 1fr)); }
        .receipt-sheet.four-a4 { grid-template-columns: repeat(2, minmax(0, 1fr)); }
        .receipt-sheet.label { grid-template-columns: repeat(2, minmax(0, 1fr)); }
        .receipt-preview-grid {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
          gap: 16px;
        }
        .receipt-card {
          border: 1.5px solid #102f3c;
          border-radius: 8px;
          padding: 10px;
          min-height: 132mm;
          color: #0b2630;
          background: #fff;
          page-break-inside: avoid;
          break-inside: avoid;
          font-family: Arial, Helvetica, sans-serif;
        }
        .receipt-sheet.four-a4 .receipt-card { min-height: 92mm; font-size: 11px; }
        .receipt-sheet.label .receipt-card { min-height: 72mm; font-size: 10px; }
        .receipt-preview-grid .receipt-card {
          min-height: 0;
          font-size: 12px;
          box-shadow: 0 12px 30px rgba(15, 23, 42, 0.08);
        }
        .receipt-logo {
          width: 44px;
          height: 44px;
          object-fit: contain;
          border: 1px solid #e0c675;
          border-radius: 10px;
          padding: 3px;
        }
        .receipt-row { display: flex; justify-content: space-between; gap: 10px; }
        .receipt-block { border: 1px solid #d7c28b; border-radius: 6px; padding: 8px; margin-top: 8px; }
        .receipt-label { font-size: 10px; text-transform: uppercase; letter-spacing: .14em; color: #8a6a2e; font-weight: 700; }
        .receipt-name { font-size: 17px; font-weight: 800; margin-top: 3px; }
        .receipt-text { line-height: 1.35; margin-top: 3px; }
        .receipt-items { margin-top: 6px; padding-left: 16px; }
        @media print {
          @page { size: A4 portrait; margin: 8mm; }
          body * { visibility: hidden !important; }
          .receipt-print-area, .receipt-print-area * { visibility: visible !important; }
          .receipt-print-area {
            display: block !important;
            position: absolute;
            inset: 0;
            padding: 0;
            background: #fff;
          }
          .admin-screen { display: none !important; }
        }
      `}</style>
      <div className="admin-screen flex flex-col gap-6">
        <Container>
          <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
            <div>
              <Heading level="h1">Order Receipts</Heading>
              <Text className="text-ui-fg-subtle mt-2">
                Print clean to/from receipts for parcels. Use 2-per-A4 for normal
                parcels, 4-per-A4 for compact parcels, or label mode for small packets.
              </Text>
            </div>
            <div className="flex flex-wrap gap-2">
              <Badge color="green">{orders.filter((order) => order.pending).length} pending</Badge>
              <Badge>{orders.length} loaded</Badge>
              <Badge>{printableOrders.length} receipts</Badge>
            </div>
          </div>
        </Container>

        <Container>
          <div className="grid gap-4 md:grid-cols-5">
            <div>
              <Label>Orders</Label>
              <Select value={mode} onValueChange={(value) => setMode(value as ReceiptMode)}>
                <Select.Trigger>
                  <Select.Value />
                </Select.Trigger>
                <Select.Content>
                  <Select.Item value="pending">Pending physical</Select.Item>
                  <Select.Item value="all">All recent</Select.Item>
                </Select.Content>
              </Select>
            </div>
            <div>
              <Label>Layout</Label>
              <Select value={layout} onValueChange={(value) => setLayout(value as ReceiptLayout)}>
                <Select.Trigger>
                  <Select.Value />
                </Select.Trigger>
                <Select.Content>
                  <Select.Item value="two-a4">2 receipts / A4</Select.Item>
                  <Select.Item value="four-a4">4 receipts / A4</Select.Item>
                  <Select.Item value="label">Small label</Select.Item>
                </Select.Content>
              </Select>
            </div>
            <div>
              <Label>Copies per order</Label>
              <Input
                type="number"
                min={1}
                max={8}
                value={copies}
                onChange={(e) => setCopies(e.target.value)}
              />
            </div>
            <div>
              <Label>Search</Label>
              <Input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Order, city, phone, item"
              />
            </div>
            <div className="flex items-end gap-2">
              <Button variant="secondary" isLoading={loading} onClick={loadOrders}>
                Refresh
              </Button>
              <Button onClick={printReceipts}>Print</Button>
            </div>
          </div>
          {message && <Text className="text-ui-fg-subtle mt-3">{message}</Text>}
          <div className="mt-4 flex flex-wrap gap-2">
            <Button variant="secondary" onClick={selectFiltered}>
              Select visible
            </Button>
            <Button variant="secondary" onClick={() => setSelectedIds([])}>
              Clear selection
            </Button>
            <Button variant="secondary" onClick={() => setSelectedIds(orders.filter((order) => order.pending).map((order) => order.id))}>
              Select pending
            </Button>
          </div>
        </Container>

        <Container>
          <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
            <div>
              <Heading level="h2">Receipt preview</Heading>
              <Text className="text-ui-fg-subtle mt-2">
                Preview the exact receipt content before printing. If no orders are
                selected, the preview uses the currently visible order list.
              </Text>
            </div>
            <Button onClick={printReceipts} disabled={!printableOrders.length}>
              Print {printableOrders.length || ""} receipt
              {printableOrders.length === 1 ? "" : "s"}
            </Button>
          </div>

          {printableOrders.length ? (
            <div className="receipt-preview-grid mt-5">
              {printableOrders.slice(0, 12).map((order) => (
                <ReceiptCard
                  key={`preview-${order.id}-${order.receiptCopyIndex || 1}`}
                  order={order}
                  from={from}
                  copyCount={copyCount}
                />
              ))}
            </div>
          ) : (
            <div className="mt-5 rounded-lg border border-dashed p-6">
              <Text className="text-ui-fg-subtle">
                Load pending orders or select orders to preview receipts here.
              </Text>
            </div>
          )}

          {printableOrders.length > 12 ? (
            <Text className="text-ui-fg-subtle mt-3">
              Showing first 12 previews. Printing will include all{" "}
              {printableOrders.length} receipts.
            </Text>
          ) : null}
        </Container>

        <Container>
          <Heading level="h2">Orders</Heading>
          <div className="mt-4 space-y-3">
            {loading ? (
              <Text>Loading orders...</Text>
            ) : filteredOrders.length === 0 ? (
              <Text>No orders found.</Text>
            ) : (
              filteredOrders.map((order) => (
                <label
                  key={order.id}
                  className="flex cursor-pointer items-start gap-3 rounded-lg border p-4 hover:bg-ui-bg-subtle"
                >
                  <input
                    type="checkbox"
                    checked={selectedSet.has(order.id)}
                    onChange={() => toggleSelected(order.id)}
                    className="mt-1"
                  />
                  <div className="flex-1">
                    <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
                      <div className="font-medium">
                        {order.order_label} · {order.ship_to.name}
                      </div>
                      <div className="flex flex-wrap gap-2">
                        {order.pending ? (
                          <Badge color="orange">Pending</Badge>
                        ) : (
                          <Badge color="grey">Not pending</Badge>
                        )}
                        <Badge>{formatCurrency(order.total, order.currency_code)}</Badge>
                        <Badge>{order.total_quantity || 0} items</Badge>
                      </div>
                    </div>
                    <div className="text-ui-fg-subtle mt-2 text-sm">
                      {order.ship_to.lines.join(", ")}
                      {order.ship_to.phone ? ` · ${order.ship_to.phone}` : ""}
                    </div>
                    <div className="text-ui-fg-subtle mt-1 text-sm">
                      {formatDate(order.created_at)} · {order.email || "No email"}
                    </div>
                  </div>
                </label>
              ))
            )}
          </div>
        </Container>
      </div>

      <div className="receipt-print-area">
        <div className={`receipt-sheet ${layout}`}>
          {printableOrders.map((order, index) => (
            <ReceiptCard
              key={`${order.id}-${order.receiptCopyIndex}-${index}`}
              order={order}
              from={from}
              copyCount={copyCount}
            />
          ))}
        </div>
      </div>
    </div>
  )
}

export const config = defineRouteConfig({
  label: "Order Receipts",
})

export default OrderReceiptsPage
