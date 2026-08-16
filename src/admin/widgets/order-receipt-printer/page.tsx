import { defineWidgetConfig } from "@medusajs/admin-sdk"
import type { AdminOrder, DetailWidgetProps } from "@medusajs/framework/types"
import { Button, Container, Heading, Text } from "@medusajs/ui"

const getReceiptUrl = (orderId?: string) =>
  orderId
    ? `/app/order-receipts?mode=all&order_id=${encodeURIComponent(orderId)}`
    : "/app/order-receipts"

const OrderReceiptPrinterWidget = ({ data }: DetailWidgetProps<AdminOrder>) => {
  const openReceiptPrinter = () => {
    window.location.href = getReceiptUrl(data?.id)
  }

  return (
    <Container className="divide-y p-0">
      <div className="p-4">
        <Heading level="h2">Parcel receipt</Heading>
        <Text size="small" className="text-ui-fg-subtle mt-2">
          Print a Shreem Farms to/from receipt for this order, with logo, contents,
          customer address and dispatch checklist.
        </Text>
      </div>
      <div className="p-4">
        <div className="flex flex-col gap-2">
          <Button variant="secondary" onClick={openReceiptPrinter}>
            Print receipt for this order
          </Button>
          <Button
            variant="secondary"
            onClick={() => {
              window.location.href = "/app/gst-report"
            }}
          >
            Monthly GST sales report
          </Button>
        </div>
      </div>
    </Container>
  )
}

export const config = defineWidgetConfig({
  zone: "order.details.side.after",
})

export default OrderReceiptPrinterWidget
