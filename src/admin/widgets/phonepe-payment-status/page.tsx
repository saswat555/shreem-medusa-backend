import { defineWidgetConfig } from "@medusajs/admin-sdk"
import type { DetailWidgetProps, AdminOrder } from "@medusajs/framework/types"
import { Container, Heading, Button, Text, Input, Label } from "@medusajs/ui"
import { useState } from "react"
import { sdk } from "../../lib/sdk"

const PhonePePaymentStatusWidget = ({ data }: DetailWidgetProps<AdminOrder>) => {
  const [loadingAuth, setLoadingAuth] = useState(false)
  const [loadingStatus, setLoadingStatus] = useState(false)
  const [authResult, setAuthResult] = useState<any>(null)
  const [statusResult, setStatusResult] = useState<any>(null)
  const [error, setError] = useState("")
  const [merchantOrderId, setMerchantOrderId] = useState(
    (data?.metadata as any)?.phonepe_merchant_order_id || ""
  )

  const checkAuth = async () => {
    setLoadingAuth(true)
    setError("")
    try {
      const res = await sdk.client.fetch(`/admin/phonepe/auth`, {
        method: "GET",
      })
      setAuthResult(res)
    } catch (e: any) {
      setError(e?.message || "Auth check failed")
    } finally {
      setLoadingAuth(false)
    }
  }

  const checkStatus = async () => {
    if (!merchantOrderId) {
      setError("Enter merchant order ID first")
      return
    }

    setLoadingStatus(true)
    setError("")
    try {
      const res = await sdk.client.fetch(
        `/admin/phonepe/status/${merchantOrderId}`,
        {
          method: "GET",
        }
      )
      setStatusResult(res)
    } catch (e: any) {
      setError(e?.message || "Status check failed")
    } finally {
      setLoadingStatus(false)
    }
  }

  return (
    <Container className="divide-y p-0">
      <div className="p-4">
        <Heading level="h2">PhonePe Payment</Heading>
        <Text size="small" className="text-ui-fg-subtle mt-2">
          Check PhonePe auth and payment status for this order.
        </Text>
      </div>

      <div className="p-4 space-y-4">
        <Button onClick={checkAuth} isLoading={loadingAuth}>
          Check Auth
        </Button>

        <div className="space-y-2">
          <Label>Merchant Order ID</Label>
          <Input
            value={merchantOrderId}
            onChange={(e) => setMerchantOrderId(e.target.value)}
            placeholder="PHONEPE_MERCHANT_ORDER_ID"
          />
          <Button onClick={checkStatus} isLoading={loadingStatus}>
            Check Payment Status
          </Button>
        </div>

        {error ? <Text className="text-red-600">{error}</Text> : null}

        {authResult ? (
          <pre className="text-xs overflow-auto border rounded p-3">
            {JSON.stringify(authResult, null, 2)}
          </pre>
        ) : null}

        {statusResult ? (
          <pre className="text-xs overflow-auto border rounded p-3">
            {JSON.stringify(statusResult, null, 2)}
          </pre>
        ) : null}
      </div>
    </Container>
  )
}

export const config = defineWidgetConfig({
  zone: "order.details.side.after",
})

export default PhonePePaymentStatusWidget
