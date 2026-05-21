import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"

type EligibilityBody = {
  email?: unknown
}

const normalizeEmail = (value: unknown) =>
  typeof value === "string" ? value.trim().toLowerCase().slice(0, 320) : ""

const isValidEmail = (value: string) =>
  /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)

const isPlacedOrder = (order: any) => {
  const status = String(order?.status || "").toLowerCase()

  return !["canceled", "cancelled", "archived"].includes(status)
}

const findExistingOrders = async (req: MedusaRequest, email: string) => {
  const query = req.scope.resolve("query") as any
  const { data } = await query.graph({
    entity: "order",
    fields: ["id", "email", "status", "created_at"],
    filters: {
      email,
    },
    pagination: {
      take: 5,
    },
  })

  return Array.isArray(data) ? data.filter(isPlacedOrder) : []
}

export const POST = async (
  req: MedusaRequest<EligibilityBody>,
  res: MedusaResponse
) => {
  const email = normalizeEmail(req.body?.email)

  if (!email || !isValidEmail(email)) {
    return res.status(400).json({
      ok: false,
      eligible: false,
      reason: "valid_email_required",
    })
  }

  try {
    const existingOrders = await findExistingOrders(req, email)
    const eligible = existingOrders.length === 0

    return res.json({
      ok: true,
      eligible,
      reason: eligible ? "first_order" : "existing_order",
    })
  } catch (error) {
    console.warn("First order eligibility lookup failed", {
      email,
      error: error instanceof Error ? error.message : error,
    })

    return res.status(503).json({
      ok: false,
      eligible: false,
      reason: "eligibility_unavailable",
    })
  }
}
