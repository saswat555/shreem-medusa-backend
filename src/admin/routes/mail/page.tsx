import { useEffect, useState } from "react"
import { defineRouteConfig } from "@medusajs/admin-sdk"
import {
  Button,
  Container,
  Heading,
  Input,
  Label,
  Switch,
  Text,
  Textarea,
} from "@medusajs/ui"
import { sdk } from "../../lib/sdk"

type TestResult = {
  ok: boolean
  message: string
}

const MailPage = () => {
  const [to, setTo] = useState("brajsavitrikrishisansthan@gmail.com")
  const [sending, setSending] = useState(false)
  const [result, setResult] = useState<TestResult | null>(null)
  const [settingsLoading, setSettingsLoading] = useState(true)
  const [settingsSaving, setSettingsSaving] = useState(false)
  const [settingsResult, setSettingsResult] = useState<TestResult | null>(null)
  const [orderRecipients, setOrderRecipients] = useState(
    "saswatp99@gmail.com\npandeysanjay494@gmail.com"
  )
  const [orderNotificationsEnabled, setOrderNotificationsEnabled] =
    useState(true)

  const loadSettings = async () => {
    setSettingsLoading(true)

    try {
      const response = await sdk.client.fetch<{
        order_stakeholder_recipients?: string[]
        order_stakeholder_enabled?: boolean
      }>("/admin/mail/settings", {
        method: "GET",
        cache: "no-store",
      })

      setOrderRecipients(
        (response.order_stakeholder_recipients || []).join("\n")
      )
      setOrderNotificationsEnabled(
        response.order_stakeholder_enabled !== false
      )
    } catch (error) {
      setSettingsResult({
        ok: false,
        message: "Unable to load mail settings. Refresh the admin session.",
      })
    } finally {
      setSettingsLoading(false)
    }
  }

  useEffect(() => {
    loadSettings()
  }, [])

  const sendTest = async () => {
    setSending(true)
    setResult(null)

    try {
      const response = await sdk.client.fetch<TestResult>("/admin/mail/test", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: {
          to,
        },
      })

      setResult(response)
    } catch (error: any) {
      setResult({
        ok: false,
        message:
          error?.message ||
          "Unable to send test email. Check SMTP credentials in backend .env.",
      })
    } finally {
      setSending(false)
    }
  }

  const saveSettings = async () => {
    setSettingsSaving(true)
    setSettingsResult(null)

    try {
      const response = await sdk.client.fetch<{
        order_stakeholder_recipients?: string[]
      }>("/admin/mail/settings", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: {
          order_stakeholder_recipients: orderRecipients,
          order_stakeholder_enabled: orderNotificationsEnabled,
        },
      })

      setOrderRecipients(
        (response.order_stakeholder_recipients || []).join("\n")
      )
      setSettingsResult({
        ok: true,
        message: "Order stakeholder mail settings saved.",
      })
    } catch (error: any) {
      setSettingsResult({
        ok: false,
        message: error?.message || "Unable to save mail settings.",
      })
    } finally {
      setSettingsSaving(false)
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <Container>
        <Heading level="h1">Mail</Heading>
        <Text className="mt-2 text-ui-fg-subtle">
          Send a branded Shreem email through the backend Gmail SMTP
          credentials before enabling customer verification and password reset
          emails in production.
        </Text>
      </Container>

      <Container className="space-y-4">
        <div className="space-y-2">
          <Heading level="h2">Order stakeholder notifications</Heading>
          <Text className="text-ui-fg-subtle">
            Every new order sends a non-blocking internal email to these
            stakeholders. One email per line or comma separated.
          </Text>
        </div>

        <div className="flex items-center justify-between gap-4 rounded-lg border p-3">
          <div>
            <Label>Enable new order emails</Label>
            <Text className="text-ui-fg-subtle">
              Checkout will not fail if a stakeholder email cannot be sent.
            </Text>
          </div>
          <Switch
            checked={orderNotificationsEnabled}
            onCheckedChange={setOrderNotificationsEnabled}
          />
        </div>

        <div>
          <Label>Stakeholder recipients</Label>
          <Textarea
            value={orderRecipients}
            onChange={(event) => setOrderRecipients(event.target.value)}
            rows={4}
            placeholder="saswatp99@gmail.com&#10;pandeysanjay494@gmail.com"
          />
        </div>

        <div className="flex flex-wrap gap-2">
          <Button
            isLoading={settingsSaving}
            disabled={settingsLoading}
            onClick={saveSettings}
          >
            Save order mail settings
          </Button>
          <Button variant="secondary" onClick={loadSettings}>
            Reload
          </Button>
        </div>

        {settingsResult && (
          <div
            className={
              settingsResult.ok
                ? "rounded-lg border border-ui-border-base bg-ui-bg-subtle p-4 text-ui-fg-base"
                : "rounded-lg border border-ui-border-error bg-ui-bg-subtle p-4 text-ui-fg-error"
            }
          >
            <Text>{settingsResult.message}</Text>
          </div>
        )}
      </Container>

      <Container className="space-y-4">
        <div className="space-y-2">
          <Heading level="h2">SMTP test</Heading>
          <Text className="text-ui-fg-subtle">
            Send a branded test email through the configured production mailbox.
          </Text>
        </div>
        <div>
          <Label>Test recipient</Label>
          <Input
            value={to}
            type="email"
            onChange={(event) => setTo(event.target.value)}
            placeholder="brajsavitrikrishisansthan@gmail.com"
          />
        </div>

        <Button isLoading={sending} onClick={sendTest}>
          Send test email
        </Button>

        {result && (
          <div
            className={
              result.ok
                ? "rounded-lg border border-ui-border-base bg-ui-bg-subtle p-4 text-ui-fg-base"
                : "rounded-lg border border-ui-border-error bg-ui-bg-subtle p-4 text-ui-fg-error"
            }
          >
            <Text>{result.message}</Text>
          </div>
        )}
      </Container>
    </div>
  )
}

export const config = defineRouteConfig({
  label: "Mail",
})

export default MailPage
