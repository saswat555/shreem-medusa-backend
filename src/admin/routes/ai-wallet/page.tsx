import { useEffect, useState } from "react"
import { defineRouteConfig } from "@medusajs/admin-sdk"
import {
  Badge,
  Button,
  Container,
  Heading,
  Input,
  Label,
  Text,
} from "@medusajs/ui"

import { sdk } from "../../lib/sdk"

type AiWallet = {
  id: string
  customer_id: string
  customer_email?: string | null
  credit_balance: number
  plan: string
  plan_expires_at?: string | null
  pro_question_limit?: number
  pro_active?: boolean
  recent_ledger?: {
    id: string
    type: string
    source?: string | null
    credits: number
    balance_after: number
    order_id?: string | null
    usage_id?: string | null
    note?: string | null
    metadata?: Record<string, unknown>
    created_at?: string
  }[]
  updated_at?: string
}

type Summary = {
  wallets: number
  total_credits: number
  premium_wallets: number
}

type AiCreditPack = {
  id: string
  label: string
  description?: string
  credits: number
  price_inr: number
  product_handle: string
  plan?: string
  duration_days?: number
  pro_question_limit?: number
  digital?: boolean
}

const formatDate = (value?: string | null) =>
  value
    ? new Intl.DateTimeFormat("en-IN", {
        dateStyle: "medium",
        timeStyle: "short",
      }).format(new Date(value))
    : "-"

const formatNumber = (value?: number) =>
  new Intl.NumberFormat("en-IN").format(Math.max(0, Number(value || 0)))

const AiWalletPage = () => {
  const [wallets, setWallets] = useState<AiWallet[]>([])
  const [selected, setSelected] = useState<AiWallet | null>(null)
  const [summary, setSummary] = useState<Summary>({
    wallets: 0,
    total_credits: 0,
    premium_wallets: 0,
  })
  const [packs, setPacks] = useState<AiCreditPack[]>([])
  const [customerFilter, setCustomerFilter] = useState("")
  const [creditDelta, setCreditDelta] = useState("")
  const [plan, setPlan] = useState("free")
  const [expiresAt, setExpiresAt] = useState("")
  const [proQuestionLimit, setProQuestionLimit] = useState("10")
  const [note, setNote] = useState("")
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [setupMessage, setSetupMessage] = useState("")

  const loadWallets = async () => {
    setLoading(true)

    try {
      const query: Record<string, string | number> = { limit: 50 }

      if (customerFilter.trim()) {
        query.customer_email = customerFilter.trim()
      }

      const res = await sdk.client.fetch<{
        wallets?: AiWallet[]
        summary?: Summary
        setup_required?: boolean
        message?: string
        packs?: AiCreditPack[]
      }>("/admin/ai-wallet", {
        method: "GET",
        query,
      })

      setSetupMessage(res.setup_required ? res.message || "" : "")
      setWallets(res.wallets || [])
      setSummary(
        res.summary || { wallets: 0, total_credits: 0, premium_wallets: 0 }
      )
      setPacks(res.packs || [])
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadWallets()
  }, [])

  const openWallet = async (wallet: AiWallet) => {
    const res = await sdk.client.fetch<{ wallet: AiWallet }>(
      `/admin/ai-wallet/${wallet.id}`,
      { method: "GET" }
    )
    const detail = res.wallet

    setSelected(detail)
    setPlan(detail.plan || "free")
    setProQuestionLimit(String(detail.pro_question_limit || 10))
    setExpiresAt(
      detail.plan_expires_at
        ? new Date(detail.plan_expires_at).toISOString().slice(0, 10)
        : ""
    )
    setCreditDelta("")
    setNote("")
  }

  const saveWallet = async () => {
    if (!selected) {
      return
    }

    setSaving(true)

    try {
      const res = await sdk.client.fetch<{ wallet: AiWallet }>(
        `/admin/ai-wallet/${selected.id}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: {
            add_credits: creditDelta ? Number(creditDelta) : 0,
            plan,
            plan_expires_at: expiresAt || null,
            pro_question_limit: Number(proQuestionLimit || 0),
            note,
          },
        }
      )
      const updated = res.wallet

      setSelected(updated)
      setWallets((current) =>
        current.map((item) => (item.id === updated.id ? updated : item))
      )
      setCreditDelta("")
      setNote("")
      loadWallets()
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <Container>
        <Heading level="h1">AI Wallets</Heading>
        <Text className="text-ui-fg-subtle mt-2">
          Manage paid credits and premium access for astrology AI usage.
        </Text>
        {setupMessage && (
          <div className="mt-4 rounded-lg border border-ui-border-warning bg-ui-bg-subtle p-4">
            <Text>{setupMessage}</Text>
          </div>
        )}
      </Container>

      <Container className="space-y-4">
        <div className="flex flex-col gap-3 md:flex-row md:items-end">
          <div className="min-w-[260px]">
            <Label>Customer email</Label>
            <Input
              value={customerFilter}
              onChange={(event) => setCustomerFilter(event.target.value)}
              placeholder="Filter exact email"
            />
          </div>
          <Button isLoading={loading} onClick={loadWallets}>
            Apply Filter
          </Button>
        </div>
      </Container>

      <Container>
        <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
          {[
            ["Wallets", formatNumber(summary.wallets)],
            ["Outstanding credits", formatNumber(summary.total_credits)],
            ["Premium wallets", formatNumber(summary.premium_wallets)],
          ].map(([label, value]) => (
            <div key={label} className="rounded-lg border p-4">
              <Text className="text-ui-fg-subtle text-xs">{label}</Text>
              <Text weight="plus" className="mt-1">
                {value}
              </Text>
            </div>
          ))}
        </div>
      </Container>

      <Container>
        <Heading level="h2">AI Products To Sell</Heading>
        <Text className="text-ui-fg-subtle mt-2 text-sm">
          These handles are treated as digital AI wallet products by the backend
          order-credit subscriber.
        </Text>
        <div className="mt-4 grid grid-cols-1 gap-3 lg:grid-cols-3">
          {packs.map((pack) => (
            <div key={pack.id} className="rounded-lg border p-4">
              <Text weight="plus">{pack.label}</Text>
              <Text className="text-ui-fg-subtle mt-1 text-xs">
                Handle: {pack.product_handle}
              </Text>
              <Text className="text-ui-fg-subtle mt-1 text-xs">
                Price ₹{formatNumber(pack.price_inr)} ·{" "}
                {pack.plan === "premium"
                  ? `${pack.pro_question_limit || 10}/day for ${
                      pack.duration_days || 30
                    } days`
                  : `${pack.credits} credits`}{" "}
                · {pack.digital ? "digital" : "physical"}
              </Text>
              {pack.description && (
                <Text className="text-ui-fg-muted mt-2 text-xs">
                  {pack.description}
                </Text>
              )}
            </div>
          ))}
        </div>
      </Container>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1fr)_420px]">
        <Container>
          <Heading level="h2">Customers</Heading>
          <div className="mt-4 space-y-3">
            {loading ? (
              <Text>Loading...</Text>
            ) : wallets.length === 0 ? (
              <Text>No wallets found.</Text>
            ) : (
              wallets.map((wallet) => (
                <button
                  key={wallet.id}
                  type="button"
                  onClick={() => openWallet(wallet)}
                  className="block w-full rounded-lg border p-4 text-left hover:bg-ui-bg-subtle"
                >
                  <div className="flex flex-wrap items-center gap-2">
                    <Text weight="plus">
                      {wallet.customer_email || wallet.customer_id}
                    </Text>
                    <Badge color={wallet.pro_active ? "green" : "grey"}>
                      {wallet.plan || "free"}
                    </Badge>
                  </div>
                  <Text className="text-ui-fg-muted mt-2 text-xs">
                    {formatNumber(wallet.credit_balance)} credits · Expires{" "}
                    {formatDate(wallet.plan_expires_at)} · Updated{" "}
                    {formatDate(wallet.updated_at)}
                  </Text>
                </button>
              ))
            )}
          </div>
        </Container>

        <Container className="space-y-4">
          <Heading level="h2">Wallet Detail</Heading>
          {!selected ? (
            <Text>Select a wallet to adjust credits or premium.</Text>
          ) : (
            <>
              <div>
                <Text weight="plus">
                  {selected.customer_email || selected.customer_id}
                </Text>
                <Text className="text-ui-fg-muted text-xs">
                  Current balance: {formatNumber(selected.credit_balance)}
                </Text>
              </div>

              <div className="grid gap-3">
                <div>
                  <Label>Add or remove credits</Label>
                  <Input
                    type="number"
                    value={creditDelta}
                    onChange={(event) => setCreditDelta(event.target.value)}
                    placeholder="Example: 10 or -2"
                  />
                </div>
                <div>
                  <Label>Plan</Label>
                  <select
                    value={plan}
                    onChange={(event) => setPlan(event.target.value)}
                    className="bg-ui-bg-field border-ui-border-base txt-compact-small h-8 w-full rounded-md border px-2"
                  >
                    <option value="free">free</option>
                    <option value="premium">premium</option>
                    <option value="pro">pro</option>
                  </select>
                </div>
                <div>
                  <Label>Plan expiry</Label>
                  <Input
                    type="date"
                    value={expiresAt}
                    onChange={(event) => setExpiresAt(event.target.value)}
                  />
                </div>
                <div>
                  <Label>Premium daily AI calls</Label>
                  <Input
                    type="number"
                    min={0}
                    value={proQuestionLimit}
                    onChange={(event) =>
                      setProQuestionLimit(event.target.value)
                    }
                    placeholder="10"
                  />
                </div>
                <div>
                  <Label>Admin note</Label>
                  <Input
                    value={note}
                    onChange={(event) => setNote(event.target.value)}
                    placeholder="Reason for adjustment"
                  />
                </div>
                <Button isLoading={saving} onClick={saveWallet}>
                  Save Wallet
                </Button>
              </div>

              <div>
                <Label>Recent ledger</Label>
                <div className="mt-2 space-y-2">
                  {(selected.recent_ledger || []).map((item) => (
                    <div key={item.id} className="rounded-lg border p-3">
                      <Text weight="plus">
                        {item.type} · {item.credits > 0 ? "+" : ""}
                        {item.credits}
                      </Text>
                      <Text className="text-ui-fg-muted text-xs">
                        Balance {item.balance_after} · {formatDate(item.created_at)}
                      </Text>
                      <Text className="text-ui-fg-muted mt-1 text-xs">
                        {item.source ? `Source ${item.source}` : "No source"}
                        {item.order_id ? ` · Order ${item.order_id}` : ""}
                        {item.usage_id ? ` · Usage ${item.usage_id}` : ""}
                      </Text>
                      {item.metadata &&
                        Object.keys(item.metadata).length > 0 && (
                          <Text className="text-ui-fg-muted mt-1 text-xs">
                            Metadata: {JSON.stringify(item.metadata)}
                          </Text>
                        )}
                      {item.note && (
                        <Text className="text-ui-fg-subtle mt-1 text-xs">
                          {item.note}
                        </Text>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            </>
          )}
        </Container>
      </div>
    </div>
  )
}

export const config = defineRouteConfig({
  label: "AI Wallets",
})

export default AiWalletPage
