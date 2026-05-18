import { useState } from "react"
import { defineRouteConfig } from "@medusajs/admin-sdk"
import { Button, Container, Heading, Input, Label, Text } from "@medusajs/ui"
import { sdk } from "../../lib/sdk"

type TestResult = {
  ok: boolean
  message: string
}

const MailPage = () => {
  const [to, setTo] = useState("brajsavitrikrishisansthan@gmail.com")
  const [sending, setSending] = useState(false)
  const [result, setResult] = useState<TestResult | null>(null)

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
