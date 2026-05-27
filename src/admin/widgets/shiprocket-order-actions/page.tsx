import { defineWidgetConfig } from "@medusajs/admin-sdk"
import type { AdminOrder, DetailWidgetProps } from "@medusajs/framework/types"
import { Button, Container, Heading, Text } from "@medusajs/ui"
import { useMemo, useState } from "react"
import { sdk } from "../../lib/sdk"

const getShiprocket = (order: any) => order?.metadata?.shiprocket || null

const hasCapturedPayment = (order: any) => {
  const collections = Array.isArray(order?.payment_collections)
    ? order.payment_collections
    : []
  const payments = collections.flatMap((collection: any) =>
    Array.isArray(collection?.payments) ? collection.payments : []
  )

  return payments.some((payment: any) => Boolean(payment?.captured_at))
}

const formatDisplayId = (order: any) =>
  order?.display_id ? `#${order.display_id}` : order?.id || "order"

const openPrintWindow = (title: string, html: string) => {
  const win = window.open("", "_blank", "width=900,height=1100")

  if (!win) {
    return
  }

  win.document.write(`<!doctype html><html><head><title>${title}</title><style>
    body{font-family:Arial,Helvetica,sans-serif;color:#111827;margin:32px} h1{font-size:28px;margin:0 0 8px}.muted{color:#6b7280}.box{border:1px solid #d1d5db;border-radius:12px;padding:16px;margin:16px 0}table{width:100%;border-collapse:collapse;margin-top:16px}th,td{border-bottom:1px solid #e5e7eb;padding:10px;text-align:left}th{font-size:12px;text-transform:uppercase;letter-spacing:.08em;color:#6b7280}.right{text-align:right}@media print{button{display:none}}
  </style></head><body>${html}<button onclick="window.print()" style="margin-top:24px;padding:12px 18px;border:0;border-radius:999px;background:#0d817e;color:white;font-weight:700">Print invoice</button></body></html>`)
  win.document.close()
  win.focus()
}

const buildInvoiceHtml = (order: any) => {
  const items = Array.isArray(order?.items) ? order.items : []
  const rows = items
    .map((item: any) => {
      const qty = Number(item?.quantity || 1)
      const total = Number(item?.total || item?.subtotal || 0) / 100

      return `<tr><td>${item?.title || "Item"}</td><td>${item?.variant?.sku || "-"}</td><td class="right">${qty}</td><td class="right">INR ${total.toFixed(2)}</td></tr>`
    })
    .join("")
  const address = order?.shipping_address || {}

  return `<h1>Shreem Farms Invoice</h1><p class="muted">Order ${formatDisplayId(order)} · ${new Date().toLocaleString()}</p><div class="box"><strong>Ship to</strong><br/>${address.first_name || ""} ${address.last_name || ""}<br/>${address.address_1 || ""} ${address.address_2 || ""}<br/>${address.city || ""} ${address.province || ""} ${address.postal_code || ""}<br/>${order?.email || ""}</div><table><thead><tr><th>Item</th><th>SKU</th><th class="right">Qty</th><th class="right">Amount</th></tr></thead><tbody>${rows}</tbody></table><div class="box"><strong>Total:</strong> INR ${(Number(order?.total || 0) / 100).toFixed(2)}</div>`
}

const ShiprocketOrderActionsWidget = ({ data }: DetailWidgetProps<AdminOrder>) => {
  const [loading, setLoading] = useState("")
  const [message, setMessage] = useState("")
  const [error, setError] = useState("")
  const shiprocket = useMemo(() => getShiprocket(data), [data])
  const paymentCaptured = useMemo(() => hasCapturedPayment(data), [data])

  const call = async (path: string, success: string) => {
    setLoading(path)
    setMessage("")
    setError("")

    try {
      const response = await sdk.client.fetch<{ message?: string }>(path, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: {},
      })
      setMessage(response.message || success)
    } catch (e: any) {
      setError(e?.message || "Action failed.")
    } finally {
      setLoading("")
    }
  }

  return (
    <Container className="divide-y p-0">
      <div className="p-4">
        <Heading level="h2">Shiprocket fulfillment</Heading>
        <Text size="small" className="text-ui-fg-subtle mt-2">
          Book pickup only after payment is captured. Print Shreem invoice here and Shiprocket slip from the label link once available.
        </Text>
      </div>

      <div className="space-y-4 p-4">
        <div className="rounded-lg border bg-ui-bg-subtle p-3 text-sm">
          <div className="font-medium">
            Status: {shiprocket?.status || (paymentCaptured ? "Ready to book" : "Waiting for payment")}
          </div>
          {shiprocket?.courier?.courier_name ? (
            <div className="text-ui-fg-subtle mt-1">
              Courier: {shiprocket.courier.courier_name}
            </div>
          ) : null}
          {shiprocket?.shipment_id ? (
            <div className="text-ui-fg-subtle">Shipment ID: {shiprocket.shipment_id}</div>
          ) : null}
          {shiprocket?.awb_code ? (
            <div className="text-ui-fg-subtle">AWB: {shiprocket.awb_code}</div>
          ) : null}
          {Array.isArray(shiprocket?.india_post_packages) &&
          shiprocket.india_post_packages.length ? (
            <div className="text-ui-fg-subtle mt-2">
              India Post/manual parcels: {shiprocket.india_post_packages.length}. Book these outside Shiprocket using the selected parcel weights.
            </div>
          ) : null}
        </div>

        <div className="flex flex-wrap gap-2">
          <Button
            size="small"
            disabled={!paymentCaptured}
            isLoading={loading.includes("/book")}
            onClick={() =>
              call(
                `/admin/shiprocket/orders/${data.id}/book`,
                "Shiprocket booked. Refresh the order to see saved details."
              )
            }
          >
            {shiprocket?.booked ? "Re-check booking" : "Book Shiprocket"}
          </Button>
          <Button
            size="small"
            variant="secondary"
            onClick={() => openPrintWindow(`Invoice ${formatDisplayId(data)}`, buildInvoiceHtml(data))}
          >
            Print Shreem invoice
          </Button>
          {shiprocket?.label_url ? (
            <Button
              size="small"
              variant="secondary"
              onClick={() => window.open(String(shiprocket.label_url), "_blank")}
            >
              Print Shiprocket slip
            </Button>
          ) : null}
          <Button
            size="small"
            variant="secondary"
            disabled={!shiprocket?.booked}
            isLoading={loading.includes("mark-shipped")}
            onClick={() =>
              call(
                `/admin/shiprocket/orders/${data.id}/mark-shipped`,
                "Order marked shipped and customer email sent."
              )
            }
          >
            Send shipped email
          </Button>
        </div>

        {!paymentCaptured ? (
          <Text size="small" className="text-ui-fg-subtle">
            Capture/confirm payment first. Shiprocket booking is intentionally blocked for unpaid orders.
          </Text>
        ) : null}
        {message ? <Text className="text-ui-fg-subtle">{message}</Text> : null}
        {error ? <Text className="text-red-600">{error}</Text> : null}
      </div>
    </Container>
  )
}

export const config = defineWidgetConfig({
  zone: "order.details.side.after",
})

export default ShiprocketOrderActionsWidget
