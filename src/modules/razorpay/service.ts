import {
  AbstractPaymentProvider,
  BigNumber,
  PaymentActions,
  PaymentSessionStatus,
} from "@medusajs/framework/utils"
import crypto from "crypto"

type RazorpayOptions = {
  key_id?: string
  key_secret?: string
}

const clean = (value?: string | null) =>
  String(value || "").trim().replace(/^['"]|['"]$/g, "")

const getKeyId = (options?: RazorpayOptions) =>
  clean(options?.key_id || process.env.RAZORPAY_KEY_ID)

const getKeySecret = (options?: RazorpayOptions) =>
  clean(options?.key_secret || process.env.RAZORPAY_KEY_SECRET)

const readNumber = (value: any): number => {
  if (value === null || value === undefined) {
    return Number.NaN
  }

  if (typeof value === "number") {
    return value
  }

  if (typeof value === "string") {
    return Number(value)
  }

  if (typeof value === "bigint") {
    return Number(value)
  }

  if (typeof value === "object") {
    const candidates = [
      value.numeric,
      value.raw,
      value.value,
      value.amount,
      value.decimal,
    ]

    for (const candidate of candidates) {
      const parsed = readNumber(candidate)
      if (Number.isFinite(parsed)) {
        return parsed
      }
    }

    if (typeof value.toString === "function") {
      const parsed = Number(value.toString())
      if (Number.isFinite(parsed)) {
        return parsed
      }
    }
  }

  return Number.NaN
}

const getCurrency = (input: any) =>
  String(
    input?.currency_code ||
      input?.currency ||
      input?.context?.currency_code ||
      process.env.RAZORPAY_CURRENCY ||
      "INR"
  ).toUpperCase()

const getAmount = (input: any) => {
  const parsed = readNumber(input?.amount)
  const currency = getCurrency(input)

  if (!Number.isFinite(parsed) || parsed <= 0) {
    console.error("[razorpay-provider] invalid amount input", {
      amount: input?.amount,
      amount_type: typeof input?.amount,
      currency,
      keys: input ? Object.keys(input) : [],
    })

    throw new Error(`Invalid Razorpay amount: ${JSON.stringify(input?.amount)}`)
  }

  const currencyExponents: Record<string, number> = { INR: 2 }
  const exponent = currencyExponents[currency]

  if (exponent === undefined) {
    throw new Error(`Unsupported Razorpay currency: ${currency}. Shreem Farms checkout supports INR only.`)
  }

  const minorAmount = Math.round(parsed * Math.pow(10, exponent))

  console.log("[razorpay-provider] amount conversion", {
    input_amount: parsed,
    currency,
    exponent,
    razorpay_minor_amount: minorAmount,
  })

  return Math.max(minorAmount, 100)
}

const verifySignature = ({
  keySecret,
  orderId,
  paymentId,
  signature,
}: {
  keySecret: string
  orderId: string
  paymentId: string
  signature: string
}) => {
  const expected = crypto
    .createHmac("sha256", keySecret)
    .update(`${orderId}|${paymentId}`)
    .digest("hex")

  return expected === signature
}

class RazorpayProviderService extends AbstractPaymentProvider<RazorpayOptions> {
  static identifier = "razorpay"

  protected options_: RazorpayOptions

  constructor(container: Record<string, unknown>, options: RazorpayOptions) {
    super(container, options)
    this.options_ = options || {}

    console.log("[razorpay-provider] boot", {
      key_id_prefix: getKeyId(this.options_).slice(0, 16) || "missing",
      key_secret_configured: Boolean(getKeySecret(this.options_)),
      cwd: process.cwd(),
    })
  }

  async initiatePayment(input: any) {
    const keyId = getKeyId(this.options_)
    const keySecret = getKeySecret(this.options_)

    if (!keyId || !keySecret) {
      throw new Error("[razorpay-provider] Missing RAZORPAY_KEY_ID or RAZORPAY_KEY_SECRET")
    }

    const amount = getAmount(input)
    const currency = getCurrency(input)

    const receipt = String(
      input?.context?.cart_id ||
        input?.context?.id ||
        input?.resource_id ||
        `shreem_${Date.now()}`
    ).slice(0, 40)

    const payload = {
      amount,
      currency,
      receipt,
      notes: {
        source: "medusa",
        medusa_payment_session_id: String(input?.payment_session_id || ""),
        medusa_cart_id: String(input?.context?.cart_id || input?.context?.id || ""),
      },
    }

    console.log("[razorpay-provider] creating order", {
      key_id_prefix: keyId.slice(0, 16),
      amount,
      currency,
      receipt,
    })

    const auth = Buffer.from(`${keyId}:${keySecret}`).toString("base64")

    const response = await fetch("https://api.razorpay.com/v1/orders", {
      method: "POST",
      headers: {
        Authorization: `Basic ${auth}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    })

    const text = await response.text()

    let order: any
    try {
      order = JSON.parse(text)
    } catch {
      order = { raw: text }
    }

    if (!response.ok) {
      console.error("[razorpay-provider] order create failed", {
        status: response.status,
        order,
        key_id_prefix: keyId.slice(0, 16),
      })

      throw new Error(
        JSON.stringify({
          statusCode: response.status,
          error: order,
        })
      )
    }

    console.log("[razorpay-provider] order created", {
      order_id: order.id,
      amount: order.amount,
      currency: order.currency,
      status: order.status,
    })

    return {
      id: String(order.id),
      data: {
        provider: "razorpay",
        razorpay_key_id: keyId,
        razorpay_order_id: order.id,
        razorpay_amount: order.amount,
        razorpay_currency: order.currency,
        razorpay_receipt: order.receipt,
        status: order.status,
      },
    }
  }

  async authorizePayment(input: any) {
    const data = input?.data || {}
    const keySecret = getKeySecret(this.options_)

    const orderId =
      data.razorpay_order_id ||
      data.razorpayOrderId ||
      data.order_id ||
      data.orderId

    const paymentId =
      data.razorpay_payment_id ||
      data.razorpayPaymentId ||
      data.payment_id ||
      data.paymentId

    const signature =
      data.razorpay_signature ||
      data.razorpaySignature ||
      data.signature

    if (orderId && paymentId && signature) {
      const verified = verifySignature({
        keySecret,
        orderId: String(orderId),
        paymentId: String(paymentId),
        signature: String(signature),
      })

      console.log("[razorpay-provider] authorize", {
        order_id: orderId,
        payment_id: paymentId,
        verified,
      })

      return {
        status: verified
          ? PaymentSessionStatus.AUTHORIZED
          : PaymentSessionStatus.ERROR,
        data: {
          ...data,
          provider: "razorpay",
          verified,
          signature_verified: verified,
          razorpay_status: verified ? "authorized" : "verification_failed",
        },
      }
    }

    console.log("[razorpay-provider] authorize pending", {
      order_id: orderId || "missing",
      payment_id: paymentId || "missing",
      signature_present: Boolean(signature),
    })

    return {
      status: PaymentSessionStatus.PENDING,
      data: {
        ...data,
        provider: "razorpay",
        reason: "waiting_for_razorpay_checkout_signature",
      },
    }
  }

  async capturePayment(input: any) {
    return {
      status: PaymentSessionStatus.CAPTURED,
      data: {
        ...(input?.data || {}),
        provider: "razorpay",
        captured_at: new Date().toISOString(),
      },
    }
  }

  async refundPayment(input: any) {
    return {
      status: PaymentSessionStatus.CANCELED,
      data: input?.data || {},
    }
  }

  async cancelPayment(input: any) {
    return {
      status: PaymentSessionStatus.CANCELED,
      data: input?.data || {},
    }
  }

  async getPaymentStatus(input: any) {
    const data = input?.data || {}

    if (data.verified || data.signature_verified) {
      return {
        status: PaymentSessionStatus.AUTHORIZED,
        data,
      }
    }

    if (data.razorpay_payment_id && !data.signature_verified) {
      return {
        status: PaymentSessionStatus.PENDING,
        data: {
          ...data,
          reason: "razorpay_signature_not_verified",
        },
      }
    }

    return {
      status: PaymentSessionStatus.PENDING,
      data,
    }
  }

  async deletePayment(input: any) {
    return input
  }

  async updatePayment(input: any) {
    const currentData =
      input?.payment_session?.data ||
      input?.session?.data ||
      input?.data ||
      {}

    const incomingData =
      input?.data ||
      input?.context?.data ||
      input?.payload ||
      {}

    const data = {
      ...currentData,
      ...incomingData,
      provider: "razorpay",
    }

    const keySecret = getKeySecret(this.options_)

    const orderId =
      data.razorpay_order_id ||
      data.razorpayOrderId ||
      data.order_id ||
      data.orderId

    const paymentId =
      data.razorpay_payment_id ||
      data.razorpayPaymentId ||
      data.payment_id ||
      data.paymentId

    const signature =
      data.razorpay_signature ||
      data.razorpaySignature ||
      data.signature

    let verified = Boolean(data.verified || data.signature_verified)

    if (orderId && paymentId && signature && keySecret) {
      verified = verifySignature({
        keySecret,
        orderId: String(orderId),
        paymentId: String(paymentId),
        signature: String(signature),
      })
    }

    console.log("[razorpay-provider] updatePayment", {
      order_id: orderId || "missing",
      payment_id: paymentId || "missing",
      signature_present: Boolean(signature),
      verified,
    })

    return {
      data: {
        ...data,
        verified,
        signature_verified: verified,
        razorpay_status: verified ? "authorized" : "verification_failed",
      },
    }
  }

  async retrievePayment(input: any) {
    return input?.data || {}
  }

  async getWebhookActionAndData() {
    return {
      action: "not_supported" as PaymentActions,
      data: {
        session_id: "",
        amount: new BigNumber(0),
      },
    }
  }
}

export default RazorpayProviderService
