import { useEffect, useMemo, useState } from "react"
import { defineRouteConfig } from "@medusajs/admin-sdk"
import {
  Badge,
  Button,
  Container,
  Heading,
  Input,
  Label,
  Table,
  Text,
} from "@medusajs/ui"

import { sdk } from "../../lib/sdk"

type GstLine = {
  order_id: string
  order_number: string
  order_date: string
  customer_email: string
  customer_name: string
  state: string
  pincode: string
  product: string
  variant?: string
  sku?: string
  hsn?: string
  quantity: number
  unit_price: number
  taxable_value: number
  discount: number
  tax: number
  line_total: number
  currency_code: string
  payment_status?: string
  fulfillment_status?: string
}

type GstOrder = {
  id: string
  order_number: string
  created_at: string
  email: string
  customer_name: string
  state: string
  pincode: string
  subtotal: number
  discount_total: number
  shipping_total: number
  taxable_value: number
  tax_total: number
  total: number
  item_count: number
  currency_code: string
  payment_status?: string
  fulfillment_status?: string
}

type GstReport = {
  range: { month: string; startIso: string; endIso: string }
  seller: { name: string; trade_name: string; gstin?: string; state?: string }
  fields_complete: boolean
  note?: string
  summary: {
    orders: number
    items: number
    subtotal: number
    discount_total: number
    shipping_total: number
    taxable_value: number
    tax_total: number
    total: number
  }
  orders: GstOrder[]
  lines: GstLine[]
}

const currentMonth = () => new Date().toISOString().slice(0, 7)

const formatMoney = (value?: number) =>
  new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 2,
  }).format(Number(value || 0))

const formatDate = (value?: string) =>
  value
    ? new Intl.DateTimeFormat("en-IN", {
        day: "2-digit",
        month: "short",
        year: "numeric",
      }).format(new Date(value))
    : "-"

const csvEscape = (value: unknown) => {
  const text = String(value ?? "")
  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text
}

const downloadCsv = (filename: string, rows: Record<string, unknown>[]) => {
  if (!rows.length) {
    return
  }

  const headers = Object.keys(rows[0])
  const csv = [
    headers.map(csvEscape).join(","),
    ...rows.map((row) => headers.map((header) => csvEscape(row[header])).join(",")),
  ].join("\n")
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" })
  const url = URL.createObjectURL(blob)
  const link = document.createElement("a")
  link.href = url
  link.download = filename
  document.body.appendChild(link)
  link.click()
  link.remove()
  URL.revokeObjectURL(url)
}

const moneyForCsv = (value?: number) => Number(value || 0).toFixed(2)

const GstReportPage = () => {
  const [month, setMonth] = useState(currentMonth())
  const [report, setReport] = useState<GstReport | null>(null)
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState("")

  const lineRows = useMemo(
    () =>
      (report?.lines || []).map((line) => ({
        "Order No": line.order_number,
        "Order Date": formatDate(line.order_date),
        "Customer Name": line.customer_name,
        "Customer Email": line.customer_email,
        State: line.state,
        Pincode: line.pincode,
        Product: line.product,
        Variant: line.variant || "",
        SKU: line.sku || "",
        HSN: line.hsn || "",
        Quantity: line.quantity,
        "Unit Price INR": moneyForCsv(line.unit_price),
        "Taxable Value INR": moneyForCsv(line.taxable_value),
        "Discount INR": moneyForCsv(line.discount),
        "GST/Tax INR": moneyForCsv(line.tax),
        "Line Total INR": moneyForCsv(line.line_total),
        "Payment Status": line.payment_status || "",
        "Fulfillment Status": line.fulfillment_status || "",
      })),
    [report]
  )

  const orderRows = useMemo(
    () =>
      (report?.orders || []).map((order) => ({
        "Order No": order.order_number,
        "Order Date": formatDate(order.created_at),
        "Customer Name": order.customer_name,
        "Customer Email": order.email,
        State: order.state,
        Pincode: order.pincode,
        Items: order.item_count,
        "Subtotal INR": moneyForCsv(order.subtotal),
        "Discount INR": moneyForCsv(order.discount_total),
        "Shipping INR": moneyForCsv(order.shipping_total),
        "Taxable Value INR": moneyForCsv(order.taxable_value),
        "GST/Tax INR": moneyForCsv(order.tax_total),
        "Order Total INR": moneyForCsv(order.total),
        "Payment Status": order.payment_status || "",
        "Fulfillment Status": order.fulfillment_status || "",
      })),
    [report]
  )

  const loadReport = async () => {
    setLoading(true)
    setMessage("")

    try {
      const next = await sdk.client.fetch<GstReport>("/admin/gst-report", {
        method: "GET",
        query: {
          month,
          limit: 1000,
          _: Date.now(),
        },
        cache: "no-store",
      } as any)

      setReport(next)
      setMessage(`Loaded ${next.summary.orders} orders and ${next.lines.length} line items.`)
    } catch (error: any) {
      setMessage(error?.message || "Unable to load GST report.")
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadReport()
  }, [])

  const exportLineCsv = () =>
    downloadCsv(`shreem-gst-line-items-${month}.csv`, lineRows)

  const exportOrderCsv = () =>
    downloadCsv(`shreem-gst-orders-${month}.csv`, orderRows)

  const printPdf = () => {
    if (!report) {
      setMessage("Load a report before printing.")
      return
    }

    window.print()
  }

  return (
    <div className="flex flex-col gap-6">
      <style>{`
        .gst-print-area { display: none; }
        @media print {
          @page { size: A4 portrait; margin: 10mm; }
          body * { visibility: hidden !important; }
          .gst-print-area, .gst-print-area * { visibility: visible !important; }
          .gst-print-area {
            display: block !important;
            position: absolute;
            inset: 0;
            background: #fff;
            color: #111827;
            font-family: Arial, Helvetica, sans-serif;
            font-size: 11px;
          }
          .admin-screen { display: none !important; }
        }
      `}</style>

      <div className="admin-screen flex flex-col gap-6">
        <Container>
          <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
            <div>
              <Heading level="h1">Monthly GST Sales Report</Heading>
              <Text className="text-ui-fg-subtle mt-2">
                Generate month-wise order and item data for CA/GST return work.
                Export line-item CSV for sheets, order-summary CSV for review, or print
                this report as PDF.
              </Text>
            </div>
            <div className="flex flex-wrap gap-2">
              <Badge>{report?.summary.orders || 0} orders</Badge>
              <Badge>{report?.summary.items || 0} items</Badge>
              {report && !report.fields_complete ? (
                <Badge color="orange">Limited tax fields</Badge>
              ) : (
                <Badge color="green">Ready</Badge>
              )}
            </div>
          </div>
        </Container>

        <Container>
          <div className="grid gap-4 md:grid-cols-[220px_1fr] md:items-end">
            <div>
              <Label>Report month</Label>
              <Input
                type="month"
                value={month}
                onChange={(event) => setMonth(event.target.value)}
              />
            </div>
            <div className="flex flex-wrap gap-2">
              <Button isLoading={loading} onClick={loadReport}>
                Load month
              </Button>
              <Button variant="secondary" onClick={exportLineCsv} disabled={!lineRows.length}>
                Download item CSV
              </Button>
              <Button variant="secondary" onClick={exportOrderCsv} disabled={!orderRows.length}>
                Download order CSV
              </Button>
              <Button variant="secondary" onClick={printPdf} disabled={!report}>
                Print / Save PDF
              </Button>
            </div>
          </div>
          {message ? <Text className="text-ui-fg-subtle mt-3">{message}</Text> : null}
          {report?.note ? <Text className="text-ui-fg-subtle mt-2">{report.note}</Text> : null}
        </Container>

        {report ? (
          <>
            <Container>
              <div className="grid gap-3 md:grid-cols-4">
                <div className="rounded-lg border p-3">
                  <Text size="small" className="text-ui-fg-subtle">Gross sales</Text>
                  <Text size="large" weight="plus">{formatMoney(report.summary.total)}</Text>
                </div>
                <div className="rounded-lg border p-3">
                  <Text size="small" className="text-ui-fg-subtle">Taxable value</Text>
                  <Text size="large" weight="plus">{formatMoney(report.summary.taxable_value)}</Text>
                </div>
                <div className="rounded-lg border p-3">
                  <Text size="small" className="text-ui-fg-subtle">GST / tax captured</Text>
                  <Text size="large" weight="plus">{formatMoney(report.summary.tax_total)}</Text>
                </div>
                <div className="rounded-lg border p-3">
                  <Text size="small" className="text-ui-fg-subtle">Shipping collected</Text>
                  <Text size="large" weight="plus">{formatMoney(report.summary.shipping_total)}</Text>
                </div>
              </div>
            </Container>

            <Container>
              <Heading level="h2">Line item preview</Heading>
              <Text className="text-ui-fg-subtle mt-2">
                This is the detailed sheet your CA will usually need for GST
                classification, HSN checks, and reconciliation with Razorpay/bank.
              </Text>
              <Table className="mt-4">
                <Table.Header>
                  <Table.Row>
                    <Table.HeaderCell>Order</Table.HeaderCell>
                    <Table.HeaderCell>Date</Table.HeaderCell>
                    <Table.HeaderCell>Customer</Table.HeaderCell>
                    <Table.HeaderCell>Product</Table.HeaderCell>
                    <Table.HeaderCell>Qty</Table.HeaderCell>
                    <Table.HeaderCell>Taxable</Table.HeaderCell>
                    <Table.HeaderCell>Tax</Table.HeaderCell>
                    <Table.HeaderCell>Total</Table.HeaderCell>
                  </Table.Row>
                </Table.Header>
                <Table.Body>
                  {report.lines.slice(0, 50).map((line, index) => (
                    <Table.Row key={`${line.order_id}-${line.product}-${index}`}>
                      <Table.Cell>{line.order_number}</Table.Cell>
                      <Table.Cell>{formatDate(line.order_date)}</Table.Cell>
                      <Table.Cell>{line.customer_name || line.customer_email}</Table.Cell>
                      <Table.Cell className="max-w-[280px] truncate">{line.product}</Table.Cell>
                      <Table.Cell>{line.quantity}</Table.Cell>
                      <Table.Cell>{formatMoney(line.taxable_value)}</Table.Cell>
                      <Table.Cell>{formatMoney(line.tax)}</Table.Cell>
                      <Table.Cell>{formatMoney(line.line_total)}</Table.Cell>
                    </Table.Row>
                  ))}
                </Table.Body>
              </Table>
              {report.lines.length > 50 ? (
                <Text className="text-ui-fg-subtle mt-3">
                  Showing first 50 rows. CSV includes all {report.lines.length} line items.
                </Text>
              ) : null}
            </Container>
          </>
        ) : null}
      </div>

      {report ? (
        <div className="gst-print-area">
          <h1>Shreem Farms Monthly GST Sales Report</h1>
          <p>
            {report.seller.trade_name || report.seller.name} · {report.seller.name}
            {report.seller.gstin ? ` · GSTIN ${report.seller.gstin}` : ""}
          </p>
          <p>
            Month: {report.range.month} · Orders: {report.summary.orders} · Items:{" "}
            {report.summary.items}
          </p>
          <table style={{ width: "100%", borderCollapse: "collapse", marginTop: 12 }}>
            <tbody>
              {[
                ["Gross sales", formatMoney(report.summary.total)],
                ["Taxable value", formatMoney(report.summary.taxable_value)],
                ["Discounts", formatMoney(report.summary.discount_total)],
                ["Shipping collected", formatMoney(report.summary.shipping_total)],
                ["GST / tax captured", formatMoney(report.summary.tax_total)],
              ].map(([label, value]) => (
                <tr key={label}>
                  <td style={{ border: "1px solid #999", padding: 6 }}>{label}</td>
                  <td style={{ border: "1px solid #999", padding: 6 }}>{value}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <h2 style={{ marginTop: 16 }}>Order Summary</h2>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr>
                {["Order", "Date", "Customer", "State", "Items", "Taxable", "Tax", "Total"].map((header) => (
                  <th key={header} style={{ border: "1px solid #999", padding: 5, textAlign: "left" }}>{header}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {report.orders.map((order) => (
                <tr key={order.id}>
                  <td style={{ border: "1px solid #999", padding: 5 }}>{order.order_number}</td>
                  <td style={{ border: "1px solid #999", padding: 5 }}>{formatDate(order.created_at)}</td>
                  <td style={{ border: "1px solid #999", padding: 5 }}>{order.customer_name || order.email}</td>
                  <td style={{ border: "1px solid #999", padding: 5 }}>{order.state}</td>
                  <td style={{ border: "1px solid #999", padding: 5 }}>{order.item_count}</td>
                  <td style={{ border: "1px solid #999", padding: 5 }}>{formatMoney(order.taxable_value)}</td>
                  <td style={{ border: "1px solid #999", padding: 5 }}>{formatMoney(order.tax_total)}</td>
                  <td style={{ border: "1px solid #999", padding: 5 }}>{formatMoney(order.total)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {report.note ? <p style={{ marginTop: 12 }}>{report.note}</p> : null}
        </div>
      ) : null}
    </div>
  )
}

export const config = defineRouteConfig({
  label: "GST Reports",
})

export default GstReportPage
