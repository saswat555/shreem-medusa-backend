import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { Client } from "pg"

type Body = {
  email?: string
  auth_identity_id?: string
}

export const POST = async (req: MedusaRequest<Body>, res: MedusaResponse) => {
  const email = String(req.body?.email || "").trim().toLowerCase()
  const authIdentityId = String(req.body?.auth_identity_id || "").trim()

  if (!email || !authIdentityId) {
    return res.status(400).json({
      message: "email and auth_identity_id are required.",
    })
  }

  if (!authIdentityId.startsWith("authid_")) {
    return res.status(400).json({
      message: "Invalid auth_identity_id.",
    })
  }

  const client = new Client({
    connectionString: process.env.DATABASE_URL,
  })

  try {
    await client.connect()
    await client.query("BEGIN")

    const customerResult = await client.query(
      `
      SELECT id, email
      FROM customer
      WHERE lower(email) = lower($1)
        AND deleted_at IS NULL
      LIMIT 1
      `,
      [email]
    )

    if (!customerResult.rowCount) {
      await client.query("ROLLBACK")
      return res.status(404).json({
        message: "No existing customer found for this email.",
      })
    }

    const customer = customerResult.rows[0]

    const identityResult = await client.query(
      `
      SELECT
        ai.id,
        ai.app_metadata,
        pi.provider,
        pi.entity_id,
        pi.user_metadata,
        pi.provider_metadata,
        lower(
          COALESCE(
            pi.user_metadata ->> 'email',
            pi.provider_metadata ->> 'email',
            pi.user_metadata ->> 'email_verified',
            pi.entity_id
          )
        ) AS detected_email
      FROM auth_identity ai
      JOIN provider_identity pi
        ON pi.auth_identity_id = ai.id
      WHERE ai.id = $1
        AND ai.deleted_at IS NULL
        AND pi.deleted_at IS NULL
        AND pi.provider = 'google'
      LIMIT 1
      `,
      [authIdentityId]
    )

    if (!identityResult.rowCount) {
      await client.query("ROLLBACK")
      return res.status(400).json({
        message:
          "Google auth identity was not found. Please retry Google login.",
      })
    }

    const identity = identityResult.rows[0]
    const metadataEmail = String(
      identity.user_metadata?.email ||
        identity.provider_metadata?.email ||
        identity.entity_id ||
        ""
    ).trim().toLowerCase()

    if (metadataEmail && metadataEmail !== email) {
      await client.query("ROLLBACK")
      return res.status(403).json({
        message: "Google email does not match the existing customer email.",
        email,
        metadata_email: metadataEmail,
      })
    }

    await client.query(
      `
      UPDATE auth_identity
      SET app_metadata = COALESCE(app_metadata, '{}'::jsonb) || jsonb_build_object('customer_id', $1::text),
          updated_at = now()
      WHERE id = $2
      `,
      [customer.id, authIdentityId]
    )

    await client.query("COMMIT")

    return res.json({
      ok: true,
      customer_id: customer.id,
      auth_identity_id: authIdentityId,
      email: customer.email,
      provider_entity_id: identity.entity_id,
      provider_user_metadata: identity.user_metadata,
      provider_metadata: identity.provider_metadata,
    })
  } catch (error: any) {
    try {
      await client.query("ROLLBACK")
    } catch {}

    console.error("[link-google-existing] failed", {
      message: error?.message,
      stack: error?.stack,
    })

    return res.status(500).json({
      message: error?.message || "Unable to link Google login.",
    })
  } finally {
    await client.end().catch(() => undefined)
  }
}
