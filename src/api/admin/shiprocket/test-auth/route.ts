import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { getShiprocketToken } from "../../../../lib/shiprocket/client"

export const GET = async (_req: MedusaRequest, res: MedusaResponse) => {
  try {
    const token = await getShiprocketToken()

    return res.json({
      ok: true,
      token_preview: `${token.slice(0, 10)}...${token.slice(-6)}`,
    })
  } catch (e: any) {
    return res.status(500).json({
      ok: false,
      error: e.message,
    })
  }
}
