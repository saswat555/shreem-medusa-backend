import { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { PhonePeClient } from "../../../../../lib/phonepe/client"

export const GET = async (
  req: AuthenticatedMedusaRequest<{ merchant_order_id: string }>,
  res: MedusaResponse
) => {
  try {
    const client = new PhonePeClient()
    const result = await client.getPaymentStatus(req.params.merchant_order_id)

    return res.json({
      ok: true,
      result,
    })
  } catch (e: any) {
    return res.status(500).json({
      ok: false,
      error: e.message,
    })
  }
}

