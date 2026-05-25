import { defineWidgetConfig } from "@medusajs/admin-sdk"
import type { AdminOrder, DetailWidgetProps } from "@medusajs/framework/types"
import { Button, Container, Heading, Text } from "@medusajs/ui"
import { useMemo, useState } from "react"
import { sdk } from "../../lib/sdk"

const isManualUpiPayment = (payment: any) => {
  const providerId = String(payment?.provider_id || payment?.provider || "")
  const data = payment?.data || {}

  return (
    providerId.includes("manual_upi") ||
    String(data.provider || "").includes("manual_upi") ||
    Boolean(data.manual_approval_required)
  )
}

const getManualUpiPayment = (order: any) => {
  const collections = Array.isArray(order?.payment_collections)
    ? order.payment_collections
    : []
  const payments = collections.flatMap((collection: any) =>
    Array.isArray(collection?.payments) ? collection.payments : []
  )

  return payments.find(isManualUpiPayment)
}

const formatOrderDisplayId = (order: any) =>
  order?.display_id ? `#${order.display_id}` : order?.id || "order"

const formatAmount = (payment: any) => {
  const dataAmount = payment?.data?.amount

  if (dataAmount) {
    return String(dataAmount)
  }

  const amount = Number(payment?.amount)
  if (!Number.isFinite(amount)) {
    return ""
  }

  return (amount / 100).toFixed(2)
}

const ManualUpiPaymentApprovalWidget = ({ data }: DetailWidgetProps<AdminOrder>) => {
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState("")
  const [error, setError] = useState("")
  const manualPayment = useMemo(() => getManualUpiPayment(data), [data])

  if (!manualPayment) {
    return null
  }

  const paymentData = manualPayment.data || {}
  const isCaptured = Boolean(manualPayment.captured_at)
  const reference = String(paymentData.reference || manualPayment.id || "")
  const amount = formatAmount(manualPayment)
  const currencyCode = String(
    paymentData.currency_code || manualPayment.currency_code || data.currency_code || "INR"
  ).toUpperCase()

  const approvePayment = async () => {
    setLoading(true)
    setMessage("")
    setError("")

    try {
      if (!isCaptured) {
        await (sdk as any).admin.payment.capture(manualPayment.id, {})
      }

      const notify = await sdk.client.fetch<{ message?: string }>(
        `/admin/manual-upi/orders/${data.id}/notify-approved`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: {
            email: data.email,
            display_id: formatOrderDisplayId(data),
            payment_reference: reference,
            amount,
            currency_code: currencyCode,
          },
        }
      )

      setMessage(
        notify.message ||
          "Manual UPI payment marked captured and approval email sent. Refresh the order to see latest payment status."
      )
    } catch (e: any) {
      setError(e?.message || "Unable to approve manual UPI payment.")
    } finally {
      setLoading(false)
    }
  }

  return (
    <Container className="divide-y p-0">
      <div className="p-4">
        <Heading level="h2">Manual UPI verification</Heading>
        <Text size="small" className="text-ui-fg-subtle mt-2">
          Verify the bank/UPI credit before capturing this payment.
        </Text>
      </div>

      <div className="space-y-4 p-4">
        <div className="rounded-lg border bg-ui-bg-subtle p-3 text-sm">
          <div className="font-medium">Reference: {reference}</div>
          <div className="text-ui-fg-subtle mt-1">
            Amount: {currencyCode} {amount || "-"}
          </div>
          <div className="text-ui-fg-subtle">
            Status: {isCaptured ? "Captured" : "Waiting for admin approval"}
          </div>
        </div>

        {paymentData.qr_image_url ? (
          <img
            src={String(paymentData.qr_image_url)}
            alt="Manual UPI QR used by customer"
            className="max-h-44 rounded-lg border bg-white object-contain p-2"
          />
        ) : null}

        <Button onClick={approvePayment} isLoading={loading} disabled={!data.email}>
          {isCaptured ? "Send approval email" : "Capture payment and email customer"}
        </Button>

        {!data.email ? (
          <Text className="text-red-600" size="small">
            This order has no customer email, so approval mail cannot be sent.
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

export default ManualUpiPaymentApprovalWidget
