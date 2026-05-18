import {
  AbstractPaymentProvider,
  BigNumber,
  PaymentSessionStatus,
} from "@medusajs/framework/utils"

type PhonePeOptions = {
  client_id?: string
  client_secret?: string
}

class PhonePeProvider extends AbstractPaymentProvider<PhonePeOptions> {
  static identifier = "phonepe"

  constructor(container: Record<string, unknown>, options: PhonePeOptions) {
    super(container, options)
  }

  async initiatePayment(input: any) {
    return {
      id: `phonepe_${Date.now()}`,
      data: {
        provider: "phonepe",
        merchant_order_id: `PHONEPE_ORDER_${Date.now()}`,
        mode: process.env.PHONEPE_ENV || "sandbox",
      },
    }
  }

  async authorizePayment(input: any) {
    return {
      status: PaymentSessionStatus.AUTHORIZED,
      data: input.data,
    }
  }

  async capturePayment(input: any) {
    return {
      status: PaymentSessionStatus.CAPTURED,
      data: input.data,
    }
  }

  async refundPayment(input: any) {
    return {
      status: PaymentSessionStatus.CANCELED,
      data: input.data,
    }
  }

  async cancelPayment(input: any) {
    return {
      status: PaymentSessionStatus.CANCELED,
      data: input.data,
    }
  }

  async getPaymentStatus(input: any) {
    return {
      status: PaymentSessionStatus.AUTHORIZED,
      data: input.data,
    }
  }

  async deletePayment(input: any) {
    return input
  }

  async updatePayment(input: any) {
    return input
  }

  async retrievePayment(input: any) {
    return input?.data || {}
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

export default PhonePeProvider
