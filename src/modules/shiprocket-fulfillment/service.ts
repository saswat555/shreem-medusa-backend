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

    const inputWeight = Number(inputData?.weight_kg || inputData?.weight)
    const fallbackWeight = Number.isFinite(inputWeight) && inputWeight > 0
      ? inputWeight
      : Number(process.env.SHIPROCKET_DEFAULT_WEIGHT_KG || 1)
    const items = Array.isArray(ctx?.items) ? ctx.items : []

    const numberValue = (value: unknown) => {
      const parsed = Number(value)

      return Number.isFinite(parsed) && parsed > 0 ? parsed : 0
    }

    const medusaWeightToKg = (value: unknown) => {
      const parsed = numberValue(value)

      if (!parsed) {
        return 0
      }

      return parsed > 50 ? parsed / 1000 : parsed
    }

    const metadataNumber = (metadata: any, keys: string[]) => {
      for (const key of keys) {
        const parsed = numberValue(metadata?.[key])

        if (parsed) {
          return parsed
        }
      }

      return 0
    }

    const getItemWeightKg = (item: any) =>
      numberValue(item.variant?.metadata?.weight_kg) ||
      numberValue(item.product?.metadata?.weight_kg) ||
      medusaWeightToKg(item.variant?.weight) ||
      medusaWeightToKg(item.product?.weight) ||
      fallbackWeight

    const getItemDimensions = (item: any) => {
      const variantMetadata = item.variant?.metadata || {}
      const productMetadata = item.product?.metadata || {}

      return {
        length:
          metadataNumber(variantMetadata, ["length_cm", "package_length_cm"]) ||
          metadataNumber(productMetadata, ["length_cm", "package_length_cm"]) ||
          numberValue(item.variant?.length) ||
          numberValue(item.product?.length),
        breadth:
          metadataNumber(variantMetadata, [
            "breadth_cm",
            "width_cm",
            "package_breadth_cm",
            "package_width_cm",
          ]) ||
          metadataNumber(productMetadata, [
            "breadth_cm",
            "width_cm",
            "package_breadth_cm",
            "package_width_cm",
          ]) ||
          numberValue(item.variant?.width) ||
          numberValue(item.product?.width),
        height:
          metadataNumber(variantMetadata, ["height_cm", "package_height_cm"]) ||
          metadataNumber(productMetadata, ["height_cm", "package_height_cm"]) ||
          numberValue(item.variant?.height) ||
          numberValue(item.product?.height),
      }
    }

    const totalWeight = items.reduce((sum: number, item: any) => {
      const qty = Number(item.quantity || 1)

      return sum + getItemWeightKg(item) * qty
    }, 0)

    const itemDimensions = items.reduce(
      (acc: any, item: any) => {
        const qty = Math.max(1, Number(item.quantity || 1))
        const itemDimensions = getItemDimensions(item)

        return {
          length: Math.max(acc.length, itemDimensions.length),
          breadth: Math.max(acc.breadth, itemDimensions.breadth),
          height: acc.height + itemDimensions.height * qty,
        }
      },
      { length: 0, breadth: 0, height: 0 }
    )
    const dimensions = {
      length:
        numberValue(inputData?.length || inputData?.length_cm) ||
        itemDimensions.length,
      breadth:
        numberValue(
          inputData?.breadth || inputData?.breadth_cm || inputData?.width_cm
        ) || itemDimensions.breadth,
      height:
        numberValue(inputData?.height || inputData?.height_cm) ||
        itemDimensions.height,
    }

    const weight = totalWeight > 0 ? totalWeight : fallbackWeight
    const cod = inputData?.cod ? 1 : 0

    const params = new URLSearchParams({
      pickup_postcode: String(pickupPostcode),
      delivery_postcode: String(deliveryPostcode),
      weight: String(weight),
      cod: String(cod),
    })

    if (dimensions.length && dimensions.breadth && dimensions.height) {
      params.set("length", String(dimensions.length))
      params.set("breadth", String(dimensions.breadth))
      params.set("height", String(dimensions.height))
    }

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
