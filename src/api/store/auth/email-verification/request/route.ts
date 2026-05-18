import {
  AuthenticatedMedusaRequest,
  MedusaResponse,
} from "@medusajs/framework/http"
import {
  ContainerRegistrationKeys,
  generateJwtToken,
  Modules,
} from "@medusajs/framework/utils"

import {
  buildVerificationEmail,
  sendShreemEmail,
} from "../../../../../lib/email/shreem-mail"

type VerificationRequestBody = {
  country_code?: string
}

const getCustomerId = (req: AuthenticatedMedusaRequest) =>
  (req as any).auth_context?.actor_type === "customer"
    ? (req as any).auth_context?.actor_id
    : null

const safeCountryCode = (value?: string) =>
  (value || "in").toLowerCase().replace(/[^a-z]/g, "").slice(0, 4) || "in"

const getSiteUrl = () =>
  (process.env.SHREEM_SITE_URL || "https://shreemfarms.in").replace(/\/$/, "")

export const POST = async (
  req: AuthenticatedMedusaRequest<VerificationRequestBody>,
  res: MedusaResponse
) => {
  const customerId = getCustomerId(req)

  if (!customerId) {
    return res.status(401).json({ message: "Sign in to verify your email." })
  }

  const customerService = req.scope.resolve(Modules.CUSTOMER) as any
  const customer = await customerService.retrieveCustomer(customerId, {
    select: ["id", "email", "metadata", "first_name"],
  })

  if (!customer?.email) {
    return res.status(400).json({
      message: "Your account does not have an email address to verify.",
    })
  }

  if (customer.metadata?.email_verified === true) {
    return res.json({ sent: false, verified: true })
  }

  const config = req.scope.resolve(ContainerRegistrationKeys.CONFIG_MODULE)
  const { http } = config.projectConfig
  const token = generateJwtToken(
    {
      purpose: "customer_email_verification",
      customer_id: customer.id,
      email: customer.email,
    },
    {
      secret: http.jwtSecret,
      expiresIn: "24h",
      jwtOptions: http.jwtOptions,
    }
  )
  const countryCode = safeCountryCode(req.body?.country_code)
  const verifyUrl = `${getSiteUrl()}/${countryCode}/verify-email?token=${encodeURIComponent(
    token
  )}`
  const email = buildVerificationEmail(verifyUrl)

  await sendShreemEmail({
    to: customer.email,
    subject: "Verify your Shreem Farms account",
    ...email,
  })

  await customerService.updateCustomers(customer.id, {
    metadata: {
      ...(customer.metadata || {}),
      email_verification_required: true,
      email_verified: false,
      email_verification_sent_at: new Date().toISOString(),
    },
  })

  return res.status(202).json({ sent: true, verified: false })
}
