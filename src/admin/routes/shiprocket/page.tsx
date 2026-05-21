import { useState } from "react"
import { defineRouteConfig } from "@medusajs/admin-sdk"
import {
  Button,
  Container,
  Heading,
  Input,
  Label,
  Text,
  Textarea,
} from "@medusajs/ui"

const ShiprocketPage = () => {
  const [deliveryPostcode, setDeliveryPostcode] = useState("110001")
  const [weight, setWeight] = useState("1")
  const [cod, setCod] = useState(false)
  const [output, setOutput] = useState("")
  const [statusHint, setStatusHint] = useState("")
  const [loading, setLoading] = useState(false)

  const callApi = async (path: string, options?: RequestInit) => {
    const res = await fetch(path, {
      credentials: "include",
      headers: {
        "Content-Type": "application/json",
        ...(options?.headers || {}),
      },
      ...options,
    })

    const text = await res.text()

    try {
      const data = JSON.parse(text)
      return { http_status: res.status, ...data }
    } catch {
      return { status: res.status, raw: text }
    }
  }

  const getShiprocketHint = (data: any) => {
    if (data?.shiprocket_status === 403) {
      return "Shiprocket rejected the credentials. Use a Shiprocket API user from Settings > API, not the regular dashboard login password. Reset the API password, update SHIPROCKET_EMAIL and SHIPROCKET_PASSWORD, then restart Medusa."
    }

    if (data?.shiprocket_status === 422 || data?.http_status === 422) {
      return "Shiprocket rejected the request fields. Check pickup pincode, delivery pincode, weight in kg, COD flag, and whether the pickup address is active in Shiprocket."
    }

    if (data?.ok === false && data?.available === false) {
      return "Auth worked, but no courier is available for this pickup-delivery lane with the selected weight/COD."
    }

    if (data?.ok === true) {
      return "Connection is working."
    }

    return ""
  }

  const testAuth = async () => {
    setLoading(true)
    setOutput("")
    setStatusHint("")
    try {
      const data = await callApi("/admin/shiprocket/test-auth", {
        method: "POST",
      })
      setOutput(JSON.stringify(data, null, 2))
      setStatusHint(getShiprocketHint(data))
    } catch (e: any) {
      setOutput(e.message || String(e))
    } finally {
      setLoading(false)
    }
  }

  const testRates = async () => {
    setLoading(true)
    setOutput("")
    setStatusHint("")
    try {
      const data = await callApi("/admin/shiprocket/rates", {
        method: "POST",
        body: JSON.stringify({
          delivery_postcode: deliveryPostcode,
          weight: Number(weight || 1),
          cod,
        }),
      })
      setOutput(JSON.stringify(data, null, 2))
      setStatusHint(getShiprocketHint(data))
    } catch (e: any) {
      setOutput(e.message || String(e))
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <Container>
        <Heading level="h1">Shiprocket</Heading>
        <Text className="text-ui-fg-subtle mt-2">
          Default pickup: Pushpa Pandey, HIG 5, Chirahula Colony, Rewa, Madhya Pradesh - 486001, opposite Chirahula Sub Post Office.
        </Text>
      </Container>

      <Container className="space-y-4">
        <Heading level="h2">Connection Test</Heading>
        <Button onClick={testAuth} isLoading={loading}>
          Test Shiprocket Auth
        </Button>
      </Container>

      <Container className="space-y-4">
        <Heading level="h2">Live Rate Test</Heading>

        <div>
          <Label>Delivery Pincode</Label>
          <Input
            value={deliveryPostcode}
            onChange={(e) => setDeliveryPostcode(e.target.value)}
          />
        </div>

        <div>
          <Label>Weight KG</Label>
          <Input value={weight} onChange={(e) => setWeight(e.target.value)} />
        </div>

        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={cod}
            onChange={(e) => setCod(e.target.checked)}
          />
          COD shipment
        </label>

        <Button onClick={testRates} isLoading={loading}>
          Calculate Shiprocket Rate
        </Button>
      </Container>

      <Container>
        <Heading level="h2">Output</Heading>
        {statusHint && (
          <Text className="text-ui-fg-subtle mb-3 rounded-md border border-ui-border-base bg-ui-bg-subtle px-3 py-2">
            {statusHint}
          </Text>
        )}
        <Textarea value={output} readOnly rows={20} />
      </Container>
    </div>
  )
}

export const config = defineRouteConfig({
  label: "Shiprocket",
})

export default ShiprocketPage
