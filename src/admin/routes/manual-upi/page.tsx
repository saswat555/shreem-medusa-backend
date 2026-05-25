import { useEffect, useState } from "react"
import { defineRouteConfig } from "@medusajs/admin-sdk"
import { Button, Container, Heading, Input, Label, Text } from "@medusajs/ui"
import { sdk } from "../../lib/sdk"

type ManualUpiConfig = {
  upi_id_configured?: boolean
  upi_id?: string
  payee_name?: string
  configured_qr_image_url?: string
  uploaded_qr_image_url?: string
}

const fileToBase64 = (file: File) =>
  new Promise<string>((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result || ""))
    reader.onerror = () => reject(reader.error)
    reader.readAsDataURL(file)
  })

const ManualUpiPage = () => {
  const [config, setConfig] = useState<ManualUpiConfig>({})
  const [message, setMessage] = useState("")
  const [loading, setLoading] = useState(false)
  const [uploading, setUploading] = useState(false)

  const qrUrl = config.uploaded_qr_image_url || config.configured_qr_image_url || ""

  const loadConfig = async () => {
    setLoading(true)
    setMessage("")

    try {
      const res = await sdk.client.fetch<{ config?: ManualUpiConfig }>(
        "/admin/manual-upi/qr",
        { method: "GET" }
      )
      setConfig(res.config || {})
    } catch (error: any) {
      setMessage(error?.message || "Unable to load manual UPI settings.")
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadConfig()
  }, [])

  const uploadQr = async (file?: File | null) => {
    if (!file) return

    setUploading(true)
    setMessage("")

    try {
      const contentBase64 = await fileToBase64(file)
      const res = await sdk.client.fetch<{
        config?: ManualUpiConfig
        message?: string
      }>("/admin/manual-upi/qr", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: {
          file_name: file.name,
          mime_type: file.type,
          content_base64: contentBase64,
        },
      })

      setConfig(res.config || {})
      setMessage(res.message || "UPI QR uploaded.")
    } catch (error: any) {
      setMessage(error?.message || "Unable to upload UPI QR.")
    } finally {
      setUploading(false)
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <Container>
        <Heading level="h1">UPI QR</Heading>
        <Text className="text-ui-fg-subtle mt-2">
          Manage the manual QR payment image shown during checkout for the Manual
          UPI payment provider.
        </Text>
      </Container>

      <Container className="space-y-5">
        <div>
          <Heading level="h2">Current payment setup</Heading>
          <Text className="text-ui-fg-subtle mt-2">
            Enable the provider in Settings → Regions → your India region → Payment
            providers → Manual UPI. New checkouts will show the uploaded QR.
          </Text>
        </div>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <div>
            <Label>UPI ID</Label>
            <Input value={config.upi_id || ""} readOnly />
            <Text className="text-ui-fg-subtle mt-1 text-xs">
              Comes from MANUAL_UPI_ID in the backend environment.
            </Text>
          </div>
          <div>
            <Label>Payee name</Label>
            <Input value={config.payee_name || "Shreem Farms"} readOnly />
          </div>
        </div>

        <div className="grid grid-cols-1 gap-5 md:grid-cols-[260px_1fr]">
          <div className="overflow-hidden rounded-lg border bg-ui-bg-subtle p-3">
            {qrUrl ? (
              <img
                src={qrUrl}
                alt="Manual UPI QR"
                className="aspect-square w-full rounded-md bg-white object-contain"
              />
            ) : (
              <div className="flex aspect-square items-center justify-center rounded-md border border-dashed text-center text-sm text-ui-fg-subtle">
                Upload a QR image to show it in checkout.
              </div>
            )}
          </div>

          <div className="space-y-3">
            <Label>Upload QR code</Label>
            <Input
              type="file"
              accept="image/png,image/jpeg,image/webp,image/gif"
              disabled={uploading}
              onChange={(e) => uploadQr(e.target.files?.[0])}
            />
            <Text className="text-ui-fg-subtle text-sm">
              The uploaded file is saved as a stable backend static image. You do
              not need to redeploy to change the QR.
            </Text>
            <div className="flex gap-2">
              <Button variant="secondary" onClick={loadConfig} isLoading={loading}>
                Refresh
              </Button>
            </div>
            {message ? <Text className="text-ui-fg-subtle">{message}</Text> : null}
          </div>
        </div>
      </Container>

      <Container className="space-y-3">
        <Heading level="h2">Order approval flow</Heading>
        <Text className="text-ui-fg-subtle">
          When a customer places a Manual UPI order, open that order in Admin. The
          Manual UPI verification card lets you inspect the reference, capture the
          authorized payment after confirming your bank credit, and send the
          customer a payment-approved email.
        </Text>
      </Container>
    </div>
  )
}

export const config = defineRouteConfig({
  label: "UPI QR",
})

export default ManualUpiPage
