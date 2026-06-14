import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { Client } from "pg"
import crypto from "crypto"

type Body = {
  code?: string
  redirect_uri?: string
}

const GOOGLE_TOKEN_URL = "https://www.googleapis.com/oauth2/v4/token"
const GOOGLE_TOKEN_INFO_URL = "https://www.googleapis.com/oauth2/v3/tokeninfo"

const base64url = (input: Buffer | string) =>
  Buffer.from(input)
    .toString("base64")
    .replace(/=/g, "")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")

const signJwt = (payload: Record<string, unknown>, secret: string) => {
  const header = {
    alg: "HS256",
    typ: "JWT",
  }

  const encodedHeader = base64url(JSON.stringify(header))
  const encodedPayload = base64url(JSON.stringify(payload))
  const data = `${encodedHeader}.${encodedPayload}`

  const signature = crypto
    .createHmac("sha256", secret)
    .update(data)
    .digest()

  return `${data}.${base64url(signature)}`
}

const makeId = (prefix: string) =>
  `${prefix}_${Date.now().toString(36)}${crypto.randomBytes(12).toString("hex")}`


const fetchJsonWithTimeout = async (
  url: string,
  options: RequestInit = {},
  timeoutMs = 15000
) => {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), timeoutMs)

  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal,
    })

    const body = await response.json().catch(() => ({}))

    return {
      response,
      body,
    }
  } catch (error: any) {
    console.error("[google-direct-callback] google fetch failed", {
      url,
      method: options.method || "GET",
      name: error?.name,
      message: error?.message,
      cause: error?.cause,
    })

    throw error
  } finally {
    clearTimeout(timeout)
  }
}

export const POST = async (req: MedusaRequest<Body>, res: MedusaResponse) => {
  const code = String(req.body?.code || "").trim()
  const redirectUri = String(req.body?.redirect_uri || "").trim()

  if (!code || !redirectUri) {
    return res.status(400).json({
      message: "code and redirect_uri are required.",
    })
  }

  const clientId = process.env.GOOGLE_CLIENT_ID
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET
  const jwtSecret = process.env.JWT_SECRET

  if (!clientId || !clientSecret || !jwtSecret) {
    return res.status(500).json({
      message: "Google OAuth or JWT env is missing.",
    })
  }

  try {
    const { response: tokenRes, body: tokenBody } =
      await fetchJsonWithTimeout(GOOGLE_TOKEN_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: new URLSearchParams({
          code,
          client_id: clientId,
          client_secret: clientSecret,
          redirect_uri: redirectUri,
          grant_type: "authorization_code",
        }),
      })

    if (!tokenRes.ok || !tokenBody.id_token) {
      console.error("[google-direct-callback] token exchange failed", tokenBody)
      return res.status(400).json({
        message: tokenBody?.error_description || tokenBody?.error || "Google token exchange failed.",
      })
    }

    const { response: infoRes, body: info } =
      await fetchJsonWithTimeout(
        `${GOOGLE_TOKEN_INFO_URL}?id_token=${encodeURIComponent(tokenBody.id_token)}`
      )

    if (!infoRes.ok) {
      console.error("[google-direct-callback] tokeninfo failed", info)
      return res.status(400).json({
        message: info?.error_description || info?.error || "Google token verification failed.",
      })
    }

    if (info.aud !== clientId) {
      return res.status(403).json({
        message: "Google token audience mismatch.",
      })
    }

    const email = String(info.email || "").trim().toLowerCase()
    const googleSub = String(info.sub || "").trim()
    const emailVerified =
      info.email_verified === true || info.email_verified === "true"

    if (!email || !googleSub || !emailVerified) {
      return res.status(403).json({
        message: "Google email is missing or not verified.",
      })
    }

    const firstName = String(info.given_name || "").trim() || null
    const lastName = String(info.family_name || "").trim() || null
    const fullName = String(info.name || "").trim()

    const client = new Client({
      connectionString: process.env.DATABASE_URL,
    })

    await client.connect()

    try {
      await client.query("BEGIN")

      let customerResult = await client.query(
        `
        SELECT id, email
        FROM customer
        WHERE lower(email) = lower($1)
          AND deleted_at IS NULL
        LIMIT 1
        `,
        [email]
      )

      let customerId: string

      if (customerResult.rowCount) {
        customerId = customerResult.rows[0].id
      } else {
        customerId = makeId("cus")

        await client.query(
          `
          INSERT INTO customer (
            id,
            email,
            first_name,
            last_name,
            has_account,
            metadata,
            created_at,
            updated_at
          )
          VALUES (
            $1,
            $2,
            $3,
            $4,
            true,
            $5::jsonb,
            now(),
            now()
          )
          `,
          [
            customerId,
            email,
            firstName || fullName.split(" ")[0] || null,
            lastName || fullName.split(" ").slice(1).join(" ") || null,
            JSON.stringify({
              email_verified: true,
              email_verification_required: false,
              created_from_google_oauth: true,
            }),
          ]
        )
      }

      let identityResult = await client.query(
        `
        SELECT ai.id AS auth_identity_id
        FROM provider_identity pi
        JOIN auth_identity ai ON ai.id = pi.auth_identity_id
        WHERE pi.provider = 'google'
          AND pi.entity_id = $1
          AND pi.deleted_at IS NULL
          AND ai.deleted_at IS NULL
        LIMIT 1
        `,
        [googleSub]
      )

      let authIdentityId: string

      if (identityResult.rowCount) {
        authIdentityId = identityResult.rows[0].auth_identity_id

        await client.query(
          `
          UPDATE auth_identity
          SET app_metadata = COALESCE(app_metadata, '{}'::jsonb) || jsonb_build_object('customer_id', $1::text),
              updated_at = now()
          WHERE id = $2
          `,
          [customerId, authIdentityId]
        )
      } else {
        authIdentityId = makeId("authid")
        const providerIdentityId = makeId("gpi")

        await client.query(
          `
          INSERT INTO auth_identity (
            id,
            app_metadata,
            created_at,
            updated_at
          )
          VALUES (
            $1,
            jsonb_build_object('customer_id', $2::text),
            now(),
            now()
          )
          `,
          [authIdentityId, customerId]
        )

        await client.query(
          `
          INSERT INTO provider_identity (
            id,
            entity_id,
            provider,
            auth_identity_id,
            user_metadata,
            provider_metadata,
            created_at,
            updated_at
          )
          VALUES (
            $1,
            $2,
            'google',
            $3,
            $4::jsonb,
            $5::jsonb,
            now(),
            now()
          )
          `,
          [
            providerIdentityId,
            googleSub,
            authIdentityId,
            JSON.stringify({
              email,
              email_verified: true,
              name: fullName || undefined,
              first_name: firstName || undefined,
              last_name: lastName || undefined,
              picture: info.picture || undefined,
            }),
            JSON.stringify({
              sub: googleSub,
              email,
              aud: info.aud,
              iss: info.iss,
            }),
          ]
        )
      }

      await client.query(
        `
        UPDATE customer
        SET has_account = true,
            metadata = COALESCE(metadata, '{}'::jsonb)
              || jsonb_build_object(
                'email_verified', true,
                'email_verification_required', false,
                'google_oauth_linked', true
              ),
            updated_at = now()
        WHERE id = $1
        `,
        [customerId]
      )

      await client.query("COMMIT")

      const now = Math.floor(Date.now() / 1000)
      const exp = now + 60 * 60 * 24 * 7

      const token = signJwt(
        {
          actor_id: customerId,
          actor_type: "customer",
          auth_identity_id: authIdentityId,
          app_metadata: {
            customer_id: customerId,
          },
          iat: now,
          exp,
        },
        jwtSecret
      )

      return res.json({
        token,
        customer_id: customerId,
        auth_identity_id: authIdentityId,
        email,
      })
    } catch (error) {
      await client.query("ROLLBACK").catch(() => undefined)
      throw error
    } finally {
      await client.end().catch(() => undefined)
    }
  } catch (error: any) {
    console.error("[google-direct-callback] failed", {
      message: error?.message,
      stack: error?.stack,
    })

    return res.status(500).json({
      message: error?.message || "Google OAuth failed.",
    })
  }
}
