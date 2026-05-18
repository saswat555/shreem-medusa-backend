import {
  AuthenticatedMedusaRequest,
  MedusaResponse,
} from "@medusajs/framework/http"
import { Modules } from "@medusajs/framework/utils"

const getCustomerId = (req: AuthenticatedMedusaRequest) =>
  (req as any).auth_context?.actor_type === "customer"
    ? (req as any).auth_context?.actor_id
    : null

export const GET = async (
  req: AuthenticatedMedusaRequest,
  res: MedusaResponse
) => {
  const customerId = getCustomerId(req)

  if (!customerId) {
    return res.status(401).json({ message: "Sign in to view email status." })
  }

  const customerService = req.scope.resolve(Modules.CUSTOMER) as any
  const customer = await customerService.retrieveCustomer(customerId, {
    select: ["id", "email", "metadata"],
  })
  const requiresVerification =
    customer?.metadata?.email_verification_required === true
  const verified =
    !requiresVerification || customer?.metadata?.email_verified === true

  return res.json({
    email: customer?.email || null,
    requires_verification: requiresVerification,
    verified,
  })
}
