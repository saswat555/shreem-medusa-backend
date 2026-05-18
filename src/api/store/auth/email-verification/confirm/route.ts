import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { ContainerRegistrationKeys, Modules } from "@medusajs/framework/utils"

const jwt = require("jsonwebtoken") as any

type VerificationConfirmBody = {
  token?: string
}

type VerificationTokenPayload = {
  purpose?: string
  customer_id?: string
  email?: string
}

export const POST = async (
  req: MedusaRequest<VerificationConfirmBody>,
  res: MedusaResponse
) => {
  const token = req.body?.token

  if (!token || typeof token !== "string") {
    return res.status(400).json({ message: "Verification token is required." })
  }

  const config = req.scope.resolve(ContainerRegistrationKeys.CONFIG_MODULE)
  const { http } = config.projectConfig

  let payload: VerificationTokenPayload
  try {
    payload = jwt.verify(token, http.jwtSecret)
  } catch {
    return res.status(400).json({
      message: "This verification link has expired or is invalid.",
    })
  }

  if (
    payload.purpose !== "customer_email_verification" ||
    !payload.customer_id ||
    !payload.email
  ) {
    return res.status(400).json({ message: "Invalid verification token." })
  }

  const customerService = req.scope.resolve(Modules.CUSTOMER) as any
  const customer = await customerService.retrieveCustomer(payload.customer_id, {
    select: ["id", "email", "metadata"],
  })

  if (!customer || customer.email !== payload.email) {
    return res.status(400).json({ message: "Invalid verification token." })
  }

  await customerService.updateCustomers(customer.id, {
    metadata: {
      ...(customer.metadata || {}),
      email_verification_required: true,
      email_verified: true,
      email_verified_at: new Date().toISOString(),
    },
  })

  return res.json({ verified: true })
}
