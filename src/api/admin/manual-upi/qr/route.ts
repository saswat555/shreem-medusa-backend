import {
  AuthenticatedMedusaRequest,
  MedusaResponse,
} from "@medusajs/framework/http"

import {
  getManualUpiQrPublicUrl,
  saveAdminImageUpload,
} from "../../../../lib/admin-media"

type UploadQrBody = {
  file_name?: unknown
  mime_type?: unknown
  content_base64?: unknown
}

const isAdminRequest = (req: AuthenticatedMedusaRequest) =>
  (req as any).auth_context?.actor_type === "user" &&
  Boolean((req as any).auth_context?.actor_id)

const getManualUpiConfig = async () => ({
  upi_id_configured: Boolean(process.env.MANUAL_UPI_ID),
  upi_id: process.env.MANUAL_UPI_ID || "",
  payee_name: process.env.MANUAL_UPI_PAYEE_NAME || "Shreem Farms",
  configured_qr_image_url: process.env.MANUAL_UPI_QR_IMAGE_URL || "",
  uploaded_qr_image_url: await getManualUpiQrPublicUrl(),
})

export const GET = async (
  req: AuthenticatedMedusaRequest,
  res: MedusaResponse
) => {
  if (!isAdminRequest(req)) {
    return res.status(401).json({
      message: "Admin authentication is required.",
    })
  }

  return res.json({
    ok: true,
    config: await getManualUpiConfig(),
  })
}

export const POST = async (
  req: AuthenticatedMedusaRequest<UploadQrBody>,
  res: MedusaResponse
) => {
  if (!isAdminRequest(req)) {
    return res.status(401).json({
      message: "Admin authentication is required.",
    })
  }

  try {
    const upload = await saveAdminImageUpload({
      directory: "payment",
      fixedBaseName: "shreem-upi-qr",
      fileName: req.body?.file_name,
      mimeType: req.body?.mime_type,
      contentBase64: req.body?.content_base64,
    })

    return res.status(201).json({
      ok: true,
      upload,
      url: upload.url,
      config: await getManualUpiConfig(),
      message:
        "UPI QR uploaded. New manual UPI checkouts will use this uploaded QR without a redeploy.",
    })
  } catch (error: any) {
    return res.status(400).json({
      ok: false,
      message: error?.message || "Unable to upload UPI QR.",
    })
  }
}
