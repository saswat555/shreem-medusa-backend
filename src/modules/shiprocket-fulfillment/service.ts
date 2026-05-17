import { AbstractFulfillmentProviderService } from "@medusajs/framework/utils"
import type {
  CalculatedShippingOptionPrice,
  CalculateShippingOptionPriceDTO,
  CreateFulfillmentResult,
  FulfillmentDTO,
  FulfillmentItemDTO,
  FulfillmentOption,
  FulfillmentOrderDTO,
} from "@medusajs/framework/types"

import {
  shiprocketFetch,
  getCheapestShiprocketRate,
} from "../../lib/shiprocket/client"

class ShiprocketFulfillmentProviderService extends AbstractFulfillmentProviderService {
  static identifier = "shiprocket"

  constructor(container: Record<string, unknown>, options: Record<string, unknown>) {
    super()
  }

  async getFulfillmentOptions(): Promise<FulfillmentOption[]> {
    return [
      {
        id: "shiprocket-delivery",
        name: "Shiprocket Delivery",
      },
    ]
  }

  async canCalculate(): Promise<boolean> {
    return process.env.SHIPROCKET_ENABLED === "true"
  }

  async validateOption(data: Record<string, unknown>): Promise<boolean> {
    return true
  }

  async validateFulfillmentData(
    optionData: Record<string, unknown>,
    data: Record<string, unknown>
  ): Promise<Record<string, unknown>> {
    return {
      ...optionData,
      ...data,
      provider: "shiprocket",
    }
  }

  async calculatePrice(
    optionData: CalculateShippingOptionPriceDTO["optionData"],
    data: CalculateShippingOptionPriceDTO["data"],
    context: CalculateShippingOptionPriceDTO["context"]
  ): Promise<CalculatedShippingOptionPrice> {
    const pickupPostcode = process.env.SHIPROCKET_PICKUP_POSTCODE || "486001"

    const ctx: any = context || {}
    const inputData: any = data || {}

    const deliveryPostcode =
      ctx?.shipping_address?.postal_code ||
      ctx?.shipping_address?.postal_code?.toString?.() ||
      inputData?.postal_code ||
      inputData?.delivery_postcode

    if (!deliveryPostcode) {
      throw new Error("Shiprocket: delivery pincode is required before calculating shipping.")
    }

    const fallbackWeight = Number(process.env.SHIPROCKET_DEFAULT_WEIGHT_KG || 1)
    const items = Array.isArray(ctx?.items) ? ctx.items : []

    const totalWeight = items.reduce((sum: number, item: any) => {
      const qty = Number(item.quantity || 1)
      const variantWeight =
        Number(item.variant?.weight) ||
        Number(item.variant?.metadata?.weight_kg) ||
        fallbackWeight

      return sum + variantWeight * qty
    }, 0)

    const weight = totalWeight > 0 ? totalWeight : fallbackWeight
    const cod = inputData?.cod ? 1 : 0

    const params = new URLSearchParams({
      pickup_postcode: String(pickupPostcode),
      delivery_postcode: String(deliveryPostcode),
      weight: String(weight),
      cod: String(cod),
    })

    const response = await shiprocketFetch(
      `/courier/serviceability/?${params.toString()}`,
      { method: "GET" }
    )

    const cheapest = getCheapestShiprocketRate(response)

    if (!cheapest) {
      throw new Error(`Shiprocket: no courier available for pincode ${deliveryPostcode}`)
    }

    const amount =
      Number(
        cheapest.rate ??
          cheapest.freight_charge ??
          cheapest.estimated_charges ??
          cheapest.total_charge
      ) || 0

    return {
      calculated_amount: Number(amount.toFixed(2)),
      is_calculated_price_tax_inclusive: true,
    }
  }

  async createFulfillment(
    data: Record<string, unknown>,
    items: Partial<Omit<FulfillmentItemDTO, "fulfillment">>[],
    order: Partial<FulfillmentOrderDTO> | undefined,
    fulfillment: Partial<Omit<FulfillmentDTO, "provider_id" | "data" | "items">>
  ): Promise<CreateFulfillmentResult> {
    return {
      data: {
        ...data,
        shiprocket_order_created: false,
        note: "Shiprocket order creation is disabled. Rate calculation only.",
      },
      labels: [],
    }
  }

  async cancelFulfillment(): Promise<any> {
    return {}
  }

  async createReturnFulfillment(): Promise<any> {
    return {}
  }
}

export default ShiprocketFulfillmentProviderService
