import {
  AbstractPaymentProvider,
  BigNumber,
  PaymentSessionStatus,
} from "@medusajs/framework/utils"
import fs from "node:fs"
import path from "node:path"

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

const getProjectRoot = () => {
  if (process.env.MEDUSA_PROJECT_ROOT) {
    return process.env.MEDUSA_PROJECT_ROOT
  }

  const cwd = process.cwd()
  return cwd.endsWith(path.join(".medusa", "server"))
    ? path.resolve(cwd, "../..")
    : cwd
}

const getUploadedQrImageUrl = () => {
  const backendUrl = String(
    process.env.MEDUSA_BACKEND_URL || process.env.BACKEND_URL || ""
  )
    .trim()
    .replace(/\/+$/, "")

  if (!backendUrl) {
    return ""
  }

  const configuredUploadDir =
    process.env.FILE_UPLOAD_DIR || process.env.LOCAL_FILE_UPLOAD_DIR || "static"
  const staticRoot = path.isAbsolute(configuredUploadDir)
    ? configuredUploadDir
    : path.resolve(getProjectRoot(), configuredUploadDir)
  const extensions = [".png", ".jpg", ".webp", ".gif"]

  for (const extension of extensions) {
    const filePath = path.join(staticRoot, "payment", `shreem-upi-qr${extension}`)

    if (fs.existsSync(filePath)) {
      const version = Math.round(fs.statSync(filePath).mtimeMs)

      return `${backendUrl}/static/payment/shreem-upi-qr${extension}?v=${version}`
    }
  }

  return ""
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
    const qrImageUrl =
      getUploadedQrImageUrl() ||
      getOption(this.options_, "qrImageUrl", "MANUAL_UPI_QR_IMAGE_URL")

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
