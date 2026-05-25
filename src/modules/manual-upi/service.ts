import {
  AbstractPaymentProvider,
  BigNumber,
  PaymentSessionStatus,
} from "@medusajs/framework/utils"

type ManualUpiOptions = {
  upiId?: string
  payeeName?: string
  qrImageUrl?: string
}

const getOption = (
  options: ManualUpiOptions,
  key: keyof ManualUpiOptions,
  envKey: string,
  fallback = ""
) => String(options?.[key] || process.env[envKey] || fallback).trim()

const amountToMajor = (amount: unknown) => {
  const parsed = Number(amount)

  if (!Number.isFinite(parsed) || parsed <= 0) {
    return ""
  }

  return (parsed / 100).toFixed(2)
}

class ManualUpiPaymentProviderService extends AbstractPaymentProvider<ManualUpiOptions> {
  static identifier = "manual_upi"

  protected options_: ManualUpiOptions

  constructor(container: Record<string, unknown>, options: ManualUpiOptions) {
    super(container, options)
    this.options_ = options || {}
  }

  private getConfig() {
    const upiId = getOption(this.options_, "upiId", "MANUAL_UPI_ID")
    const payeeName = getOption(
      this.options_,
      "payeeName",
      "MANUAL_UPI_PAYEE_NAME",
      "Shreem Farms"
    )
    const qrImageUrl = getOption(
      this.options_,
      "qrImageUrl",
      "MANUAL_UPI_QR_IMAGE_URL"
    )

    return {
      upiId,
      payeeName,
      qrImageUrl,
    }
  }

  private buildPaymentData(input: any) {
    const config = this.getConfig()

    if (!config.upiId) {
      throw new Error("Manual UPI payment is missing MANUAL_UPI_ID")
    }

    const amount = amountToMajor(input.amount)
    const currencyCode = String(input.currency_code || "INR").toUpperCase()
    const reference = `SHREEM-${Date.now()}`
    const upiDeepLink = config.upiId
      ? `upi://pay?${new URLSearchParams({
          pa: config.upiId,
          pn: config.payeeName,
          am: amount,
          cu: currencyCode,
          tn: reference,
        }).toString()}`
      : ""

    return {
      provider: "manual_upi",
      status: "pending_admin_approval",
      manual_approval_required: true,
      reference,
      upi_id: config.upiId,
      payee_name: config.payeeName,
      qr_image_url: config.qrImageUrl,
      upi_deep_link: upiDeepLink,
      amount,
      currency_code: currencyCode,
      instructions:
        "Pay by UPI using the QR/link, keep the order reference in note if possible, and wait for Shreem Farms to verify before dispatch.",
    }
  }

  async initiatePayment(input: any) {
    return {
      id: `manual_upi_${Date.now()}`,
      data: this.buildPaymentData(input),
    }
  }

  async authorizePayment(input: any) {
    return {
      status: PaymentSessionStatus.AUTHORIZED,
      data: {
        ...(input.data || {}),
        status: "pending_admin_approval",
        authorized_for_manual_review: true,
      },
    }
  }

  async capturePayment(input: any) {
    return {
      status: PaymentSessionStatus.CAPTURED,
      data: {
        ...(input.data || {}),
        status: "admin_approved",
        approved_at: new Date().toISOString(),
      },
    }
  }

  async cancelPayment(input: any) {
    return {
      status: PaymentSessionStatus.CANCELED,
      data: {
        ...(input.data || {}),
        status: "cancelled",
      },
    }
  }

  async refundPayment(input: any) {
    return {
      status: PaymentSessionStatus.CANCELED,
      data: {
        ...(input.data || {}),
        status: "refund_pending_manual_bank_transfer",
      },
    }
  }

  async retrievePayment(input: any) {
    return {
      data: input.data,
    }
  }

  async updatePayment(input: any) {
    return input
  }

  async deletePayment(input: any) {
    return input
  }

  async getPaymentStatus(input: any) {
    return {
      status: PaymentSessionStatus.AUTHORIZED,
      data: input.data,
    }
  }

  async getWebhookActionAndData() {
    return {
      action: "not_supported" as const,
      data: {
        session_id: "",
        amount: new BigNumber(0),
      },
    }
  }
}

export default ManualUpiPaymentProviderService
