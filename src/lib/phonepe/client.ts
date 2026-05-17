type PhonePeAuthResponse = {
  access_token: string
  expires_at?: number
  expires_in?: number
  token_type?: string
}

export class PhonePeClient {
  private baseUrl: string
  private clientId: string
  private clientSecret: string
  private clientVersion: string

  constructor() {
    this.baseUrl = process.env.PHONEPE_BASE_URL || ""
    this.clientId = process.env.PHONEPE_CLIENT_ID || ""
    this.clientSecret = process.env.PHONEPE_CLIENT_SECRET || ""
    this.clientVersion = process.env.PHONEPE_CLIENT_VERSION || "1"
  }

  private getHeaders(token?: string): Record<string, string> {
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    }

    if (token) {
      headers["Authorization"] = `O-Bearer ${token}`
    }

    return headers
  }

  async generateAuthToken(): Promise<PhonePeAuthResponse> {
    const url = `${this.baseUrl}/identity-manager/v1/oauth/token`

    const body = new URLSearchParams({
      client_id: this.clientId,
      client_secret: this.clientSecret,
      client_version: this.clientVersion,
      grant_type: "client_credentials",
    })

    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: body.toString(),
    })

    if (!response.ok) {
      const text = await response.text()
      throw new Error(`PhonePe auth failed: ${response.status} ${text}`)
    }

    return await response.json()
  }

  async getPaymentStatus(merchantOrderId: string) {
    const auth = await this.generateAuthToken()

    const url = `${this.baseUrl}/checkout/v2/order/${merchantOrderId}/status`

    const response = await fetch(url, {
      method: "GET",
      headers: this.getHeaders(auth.access_token),
    })

    if (!response.ok) {
      const text = await response.text()
      throw new Error(`PhonePe status failed: ${response.status} ${text}`)
    }

    return await response.json()
  }
}
