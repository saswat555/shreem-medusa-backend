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
      return JSON.parse(text)
    } catch {
      return { status: res.status, raw: text }
    }
  }

  const testAuth = async () => {
    setLoading(true)
    setOutput("")
    try {
      const data = await callApi("/admin/shiprocket/test-auth")
      setOutput(JSON.stringify(data, null, 2))
    } catch (e: any) {
      setOutput(e.message || String(e))
    } finally {
      setLoading(false)
    }
  }

  const testRates = async () => {
    setLoading(true)
    setOutput("")
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
        <Textarea value={output} readOnly rows={20} />
      </Container>
    </div>
  )
}

export const config = defineRouteConfig({
  label: "Shiprocket",
})

export default ShiprocketPage
