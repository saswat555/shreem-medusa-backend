import {
  AuthenticatedMedusaRequest,
  MedusaResponse,
} from "@medusajs/framework/http"

import {
  bookShiprocketForOrder,
  serializeShiprocketError,
} from "../../../../../../lib/shiprocket/order-booking"

type Params = {
  id: string
}

type Body = {
  force?: boolean
}

const isAdminRequest = (req: AuthenticatedMedusaRequest) =>
  (req as any).auth_context?.actor_type === "user" &&
  Boolean((req as any).auth_context?.actor_id)

export const POST = async (
  req: AuthenticatedMedusaRequest<Body, Params>,
  res: MedusaResponse
) => {
  if (!isAdminRequest(req)) {
    return res.status(401).json({
      ok: false,
      message: "Admin authentication is required.",
    })
  }

  try {
    const result = await bookShiprocketForOrder(req.scope, req.params.id, {
      force: Boolean(req.body?.force),
      source: "admin_payment_confirmed",
      notifyCustomer: true,
    })

    return res.json({
      ok: true,
      message: result.skipped
        ? result.message || "Shiprocket booking skipped."
        : "Shiprocket booking completed.",
      shiprocket: result.shiprocket,
    })
  } catch (error) {
    const serialized = serializeShiprocketError(error)
    const status = Number((serialized as any).status || 500)

    console.error("Shiprocket admin booking failed", serialized)

    return res.status(status).json({
      ok: false,
      message: serialized.message || "Shiprocket booking failed.",
      error: serialized,
    })
  }
}
