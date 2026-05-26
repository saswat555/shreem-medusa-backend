import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"

import { getManualUpiQrPublicUrl } from "../../../../lib/admin-media"

const cleanUrl = (value?: string | null) => String(value || "").trim()

export const GET = async (_req: MedusaRequest, res: MedusaResponse) => {
  const uploadedQrImageUrl = await getManualUpiQrPublicUrl()
  const configuredQrImageUrl = cleanUrl(process.env.MANUAL_UPI_QR_IMAGE_URL)

  return res.json({
    ok: true,
    provider: "manual_upi",
    upi_id: cleanUrl(process.env.MANUAL_UPI_ID),
    payee_name: cleanUrl(process.env.MANUAL_UPI_PAYEE_NAME) || "Shreem Farms",
    qr_image_url: uploadedQrImageUrl || configuredQrImageUrl,
    uploaded_qr_image_url: uploadedQrImageUrl,
    configured_qr_image_url: configuredQrImageUrl,
  })
}
