import {
  AuthenticatedMedusaRequest,
  MedusaResponse,
} from "@medusajs/framework/http"

import {
  markShiprocketOrderShipped,
  serializeShiprocketError,
} from "../../../../../../lib/shiprocket/order-booking"

type Params = {
  id: string
}

const isAdminRequest = (req: AuthenticatedMedusaRequest) =>
  (req as any).auth_context?.actor_type === "user" &&
  Boolean((req as any).auth_context?.actor_id)

export const POST = async (
  req: AuthenticatedMedusaRequest<Record<string, unknown>, Params>,
  res: MedusaResponse
) => {
  if (!isAdminRequest(req)) {
    return res.status(401).json({
      ok: false,
      message: "Admin authentication is required.",
    })
  }

  try {
    const result = await markShiprocketOrderShipped(
      req.scope,
      req.params.id,
      req.body || {}
    )

    return res.json({
      ok: true,
      message: "Order marked shipped and customer email sent.",
      shiprocket: result.shiprocket,
    })
  } catch (error) {
    const serialized = serializeShiprocketError(error)

    return res.status(Number((serialized as any).status || 500)).json({
      ok: false,
      message: serialized.message || "Unable to mark order shipped.",
      error: serialized,
    })
  }
}
