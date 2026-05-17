import {
  AbstractPaymentProvider,
  PaymentSessionStatus,
} from "@medusajs/framework/utils"

type PhonePeOptions = {
  clientId: string
  clientSecret: string
}

class PhonePeProviderService extends AbstractPaymentProvider<PhonePeOptions> {
  static identifier = "phonepe"

  async initiatePayment(input: any) {

    return {
      id: `phonepe_${Date.now()}`,
      data: {
        provider: "phonepe",
        amount: input.amount,
        currency_code: input.currency_code,
        merchantTransactionId: `TXN_${Date.now()}`
      }
    }
  }

  async authorizePayment(input: any) {

    return {
      status: PaymentSessionStatus.AUTHORIZED,
      data: input.data
    }
  }

  async capturePayment(input: any) {

    return {
      status: PaymentSessionStatus.CAPTURED,
      data: input.data
    }
  }

  async cancelPayment(input: any) {

    return {
      status: PaymentSessionStatus.CANCELED,
      data: input.data
    }
  }

  async refundPayment(input: any) {

    return {
      status: PaymentSessionStatus.REFUNDED,
      data: input.data
    }
  }

  async retrievePayment(input: any) {

    return {
      data: input.data
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
      data: input.data
    }
  }
}

export default PhonePeProviderService
