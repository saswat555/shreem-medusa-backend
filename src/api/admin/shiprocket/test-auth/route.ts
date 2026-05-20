import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import {
  getShiprocketConfigStatus,
  getShiprocketToken,
  isShiprocketApiError,
} from "../../../../lib/shiprocket/client"

const handler = async (_req: MedusaRequest, res: MedusaResponse) => {
  try {
    const token = await getShiprocketToken()

    return res.json({
      ok: true,
      config: getShiprocketConfigStatus(),
      token_preview: `${token.slice(0, 10)}...${token.slice(-6)}`,
    })
  } catch (e: any) {
    return res.status(isShiprocketApiError(e) ? e.status : 500).json({
      ok: false,
      error: e.message || "Shiprocket auth failed",
      shiprocket_status: isShiprocketApiError(e) ? e.status : undefined,
      shiprocket_error: isShiprocketApiError(e) ? e.data : undefined,
      config: getShiprocketConfigStatus(),
    })
  }
}

export const GET = handler
export const POST = handler
