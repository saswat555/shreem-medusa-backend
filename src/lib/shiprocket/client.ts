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
}

const cache: TokenCache = {
  token: null,
  expiresAt: 0,
}

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
  email_configured: Boolean(process.env.SHIPROCKET_EMAIL?.trim()),
  password_configured: Boolean(process.env.SHIPROCKET_PASSWORD?.trim()),
  pickup_postcode: process.env.SHIPROCKET_PICKUP_POSTCODE?.trim() || null,
  default_weight_kg: process.env.SHIPROCKET_DEFAULT_WEIGHT_KG || "0.5",
})

export const getShiprocketToken = async (): Promise<string> => {
  const now = Date.now()

  if (cache.token && cache.expiresAt > now + 60_000) {
    return cache.token
  }

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

  cache.token = data.token
  cache.expiresAt = now + 8 * 60 * 60 * 1000

  return data.token
}

export const shiprocketFetch = async (
  path: string,
  options: RequestInit = {}
) => {
  const token = await getShiprocketToken()
  const url = `${baseUrl()}${path}`

  const response = await fetch(url, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
      ...(options.headers || {}),
    },
  })

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
