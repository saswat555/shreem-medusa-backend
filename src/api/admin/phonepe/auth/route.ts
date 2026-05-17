import { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { PhonePeClient } from "../../../../lib/phonepe/client"

export const GET = async (
  req: AuthenticatedMedusaRequest,
  res: MedusaResponse
) => {
  try {
    const client = new PhonePeClient()
    const auth = await client.generateAuthToken()

    return res.json({
      ok: true,
      token_preview: auth.access_token?.slice(0, 12) || "",
      raw: auth,
    })
  } catch (e: any) {
    return res.status(500).json({
      ok: false,
      error: e.message,
    })
  }
}
