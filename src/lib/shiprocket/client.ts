import dotenv from "dotenv"

dotenv.config({ path: ".env.production", override: false })
dotenv.config({ override: false })

export class ShiprocketApiError extends Error {
  status: number
  data: unknown
  path: string

  constructor({
    message,
    status,
    data,
    path,
  }: {
    message: string
    status: number
    data: unknown
    path: string
  }) {
    super(message)
    this.name = "ShiprocketApiError"
    this.status = status
    this.data = data
    this.path = path
  }
}

type TokenCache = {
  token: string | null
  expiresAt: number
  source: "env" | "login" | null
}

const cache: TokenCache = {
  token: null,
  expiresAt: 0,
  source: null,
}

const ENV_TOKEN_KEYS = [
  "SHIPROCKET_TOKEN",
  "SHIPROCKET_AUTH_TOKEN",
  "SHIPROCKET_BEARER_TOKEN",
  "SHIPROCKET_API_TOKEN",
  "TOKEN",
]

const required = (key: string): string => {
  const value = process.env[key]?.trim()
  if (!value) {
    throw new Error(`${key} is missing in .env`)
  }
  return value
}

const baseUrl = () =>
  (process.env.SHIPROCKET_BASE_URL || "https://apiv2.shiprocket.in/v1/external")
    .trim()
    .replace(/\/+$/, "")

const envToken = () => {
  for (const key of ENV_TOKEN_KEYS) {
    const value = process.env[key]?.trim()
    if (value) {
      return {
        key,
        token: value.replace(/^Bearer\s+/i, ""),
      }
    }
  }

  return null
}

const readResponse = async (response: Response) => {
  const raw = await response.text()

  try {
    return raw ? JSON.parse(raw) : null
  } catch {
    return raw
  }
}

export const getShiprocketConfigStatus = () => ({
  base_url: baseUrl(),
  token_configured: Boolean(envToken()),
  token_env_key: envToken()?.key || null,
  email_configured: Boolean(process.env.SHIPROCKET_EMAIL?.trim()),
  password_configured: Boolean(process.env.SHIPROCKET_PASSWORD?.trim()),
  pickup_postcode: process.env.SHIPROCKET_PICKUP_POSTCODE?.trim() || null,
  default_weight_kg: process.env.SHIPROCKET_DEFAULT_WEIGHT_KG || "0.5",
  auth_mode: envToken() ? "token" : "email_password",
})

const loginWithEmailPassword = async () => {
  const response = await fetch(`${baseUrl()}/auth/login`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      email: required("SHIPROCKET_EMAIL"),
      password: required("SHIPROCKET_PASSWORD"),
    }),
  })

  const data: any = await readResponse(response)

  if (!response.ok) {
    throw new ShiprocketApiError({
      message: "Shiprocket auth failed",
      status: response.status,
      data,
      path: "/auth/login",
    })
  }

  if (!data || typeof data !== "object") {
    throw new Error(`Shiprocket auth returned non-JSON: ${String(data)}`)
  }

  if (!data.token) {
    throw new Error(`Shiprocket auth response missing token: ${JSON.stringify(data)}`)
  }

  return data.token as string
}

export const getShiprocketToken = async (): Promise<string> => {
  const now = Date.now()
  const staticToken = envToken()

  if (staticToken) {
    cache.token = staticToken.token
    cache.source = "env"
    cache.expiresAt = Number.MAX_SAFE_INTEGER

    return staticToken.token
  }

  if (cache.token && cache.expiresAt > now + 60_000) {
    return cache.token
  }

  const token = await loginWithEmailPassword()

  cache.token = token
  cache.source = "login"
  cache.expiresAt = now + 8 * 60 * 60 * 1000

  return token
}

export const getShiprocketAuthMode = () => (envToken() ? "token" : "email_password")

const getLoginFallbackToken = async () => {
  if (!process.env.SHIPROCKET_EMAIL?.trim() || !process.env.SHIPROCKET_PASSWORD?.trim()) {
    return null
  }

  const currentToken = cache.token
  const currentSource = cache.source
  const currentExpiry = cache.expiresAt

  try {
    cache.token = null
    cache.source = null
    cache.expiresAt = 0
    const token = await loginWithEmailPassword()
    cache.token = token
    cache.source = "login"
    cache.expiresAt = Date.now() + 8 * 60 * 60 * 1000

    return token
  } catch {
    cache.token = currentToken
    cache.source = currentSource
    cache.expiresAt = currentExpiry
    return null
  }
}

export const shiprocketFetch = async (
  path: string,
  options: RequestInit = {}
) => {
  const token = await getShiprocketToken()
  const url = `${baseUrl()}${path}`

  const request = async (bearerToken: string) =>
    fetch(url, {
      ...options,
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${bearerToken}`,
        ...(options.headers || {}),
      },
    })

  let response = await request(token)

  if ((response.status === 401 || response.status === 403) && cache.source === "env") {
    const fallbackToken = await getLoginFallbackToken()

    if (fallbackToken) {
      response = await request(fallbackToken)
    }
  }

  const data = await readResponse(response)

  if (!response.ok) {
    throw new ShiprocketApiError({
      message: "Shiprocket API failed",
      status: response.status,
      data,
      path,
    })
  }

  return data
}

export const testShiprocketConnection = async () => {
  const pickupPostcode = process.env.SHIPROCKET_PICKUP_POSTCODE?.trim() || "486001"
  const deliveryPostcode =
    process.env.SHIPROCKET_TEST_DELIVERY_POSTCODE?.trim() || "110001"
  const weight = process.env.SHIPROCKET_DEFAULT_WEIGHT_KG?.trim() || "0.5"
  const params = new URLSearchParams({
    pickup_postcode: pickupPostcode,
    delivery_postcode: deliveryPostcode,
    weight,
    cod: "0",
  })
  const token = await getShiprocketToken()
  const data = await shiprocketFetch(`/courier/serviceability/?${params.toString()}`, {
    method: "GET",
  })

  return {
    token,
    auth_mode: getShiprocketAuthMode(),
    test: {
      pickup_postcode: pickupPostcode,
      delivery_postcode: deliveryPostcode,
      weight,
      cod: 0,
    },
    data,
  }
}

export const isShiprocketApiError = (error: unknown): error is ShiprocketApiError =>
  error instanceof ShiprocketApiError

export const getCheapestShiprocketRate = (serviceability: any) => {
  const companies =
    serviceability?.data?.available_courier_companies ||
    serviceability?.available_courier_companies ||
    []

  if (!Array.isArray(companies) || companies.length === 0) {
    return null
  }

  return companies
    .filter((c) => {
      const rate = Number(
        c.rate ??
          c.freight_charge ??
          c.cod_charges ??
          c.estimated_charges ??
          c.total_charge
      )
      return Number.isFinite(rate)
    })
    .sort((a, b) => {
      const ar = Number(a.rate ?? a.freight_charge ?? a.estimated_charges ?? a.total_charge)
      const br = Number(b.rate ?? b.freight_charge ?? b.estimated_charges ?? b.total_charge)
      return ar - br
    })[0]
}
