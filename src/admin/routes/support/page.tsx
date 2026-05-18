import { useEffect, useState } from "react"
import { defineRouteConfig } from "@medusajs/admin-sdk"
import { Container, Heading, Button, Input, Label, Textarea, Text } from "@medusajs/ui"
import { sdk } from "../../lib/sdk"

type Ticket = {
  id: string
  email?: string | null
  phone?: string | null
  subject: string
  message: string
  status: string
  priority: string
  category: string
  order_id?: string | null
}

const SupportPage = () => {
  const [tickets, setTickets] = useState<Ticket[]>([])
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)

  const [email, setEmail] = useState("")
  const [phone, setPhone] = useState("")
  const [subject, setSubject] = useState("")
  const [message, setMessage] = useState("")
  const [category, setCategory] = useState("general")
  const [orderId, setOrderId] = useState("")

  const loadTickets = async () => {
    setLoading(true)
    try {
      const res = await sdk.client.fetch<{ tickets?: Ticket[] }>(
        "/admin/support",
        {
          method: "GET",
        }
      )
      setTickets(res.tickets || [])
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadTickets()
  }, [])

  const createTicket = async () => {
    if (!subject || !message) return
    setSaving(true)
    try {
      await sdk.client.fetch("/admin/support", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: {
          email,
          phone,
          subject,
          message,
          category,
          order_id: orderId || null,
          status: "open",
          priority: "normal",
          source: "admin",
        },
      })

      setEmail("")
      setPhone("")
      setSubject("")
      setMessage("")
      setCategory("general")
      setOrderId("")

      await loadTickets()
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <Container>
        <Heading level="h1">Support</Heading>
        <Text className="text-ui-fg-subtle mt-2">
          Manage support tickets submitted from the storefront or created internally.
        </Text>
      </Container>

      <Container className="space-y-4">
        <Heading level="h2">Create Ticket</Heading>

        <div className="grid grid-cols-1 gap-4">
          <div>
            <Label>Email</Label>
            <Input value={email} onChange={(e) => setEmail(e.target.value)} />
          </div>

          <div>
            <Label>Phone</Label>
            <Input value={phone} onChange={(e) => setPhone(e.target.value)} />
          </div>

          <div>
            <Label>Order ID</Label>
            <Input value={orderId} onChange={(e) => setOrderId(e.target.value)} />
          </div>

          <div>
            <Label>Subject</Label>
            <Input value={subject} onChange={(e) => setSubject(e.target.value)} />
          </div>

          <div>
            <Label>Category</Label>
            <Input value={category} onChange={(e) => setCategory(e.target.value)} />
          </div>

          <div>
            <Label>Message</Label>
            <Textarea value={message} onChange={(e) => setMessage(e.target.value)} rows={8} />
          </div>

          <div>
            <Button isLoading={saving} onClick={createTicket}>
              Create Ticket
            </Button>
          </div>
        </div>
      </Container>

      <Container>
        <Heading level="h2">Tickets</Heading>
        <div className="mt-4 space-y-3">
          {loading ? (
            <Text>Loading...</Text>
          ) : tickets.length === 0 ? (
            <Text>No tickets found.</Text>
          ) : (
            tickets.map((ticket) => (
              <div key={ticket.id} className="border rounded-lg p-4">
                <div className="font-medium">{ticket.subject}</div>
                <div className="text-sm text-ui-fg-subtle">{ticket.email || "No email"}</div>
                <div className="text-sm mt-1">Category: {ticket.category}</div>
                <div className="text-sm">Status: {ticket.status}</div>
                <div className="text-sm">Priority: {ticket.priority}</div>
                {ticket.order_id ? (
                  <div className="text-sm">Order: {ticket.order_id}</div>
                ) : null}
              </div>
            ))
          )}
        </div>
      </Container>
    </div>
  )
}

export const config = defineRouteConfig({
  label: "Support",
})

export default SupportPage
