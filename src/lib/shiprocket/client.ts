import dotenv from "dotenv"

dotenv.config({ override: true })

type TokenCache = {
  token: string | null
  expiresAt: number
}

const cache: TokenCache = {
  token: null,
  expiresAt: 0,
}

const required = (key: string): string => {
  const value = process.env[key]
  if (!value) {
    throw new Error(`${key} is missing in .env`)
  }
  return value
}

const baseUrl = () =>
  process.env.SHIPROCKET_BASE_URL || "https://apiv2.shiprocket.in/v1/external"

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

  const raw = await response.text()

  if (!response.ok) {
    throw new Error(`Shiprocket auth failed: ${response.status} ${raw}`)
  }

  let data: any
  try {
    data = JSON.parse(raw)
  } catch {
    throw new Error(`Shiprocket auth returned non-JSON: ${raw}`)
  }

  if (!data.token) {
    throw new Error(`Shiprocket auth response missing token: ${raw}`)
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

  const response = await fetch(`${baseUrl()}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
      ...(options.headers || {}),
    },
  })

  const raw = await response.text()

  let data: any = raw
  try {
    data = raw ? JSON.parse(raw) : null
  } catch {}

  if (!response.ok) {
    throw new Error(
      `Shiprocket API failed: ${response.status} ${JSON.stringify(data)}`
    )
  }

  return data
}

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
