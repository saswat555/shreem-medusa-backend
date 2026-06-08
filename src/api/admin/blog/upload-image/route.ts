import {
  AuthenticatedMedusaRequest,
  MedusaResponse,
} from "@medusajs/framework/http"

import { saveAdminImageUpload } from "../../../../lib/admin-media"

type UploadImageBody = {
  file_name?: unknown
  mime_type?: unknown
  content_base64?: unknown
}

export const POST = async (
  req: AuthenticatedMedusaRequest<UploadImageBody>,
  res: MedusaResponse
) => {
  try {
    console.log("[blog-upload-image] request body keys", Object.keys(req.body || {}))
    console.log("[blog-upload-image] file_name", req.body?.file_name)
    console.log("[blog-upload-image] mime_type", req.body?.mime_type)
    console.log(
      "[blog-upload-image] content_base64 length",
      typeof req.body?.content_base64 === "string" ? req.body.content_base64.length : 0
    )

    const upload = await saveAdminImageUpload({
      directory: "blog",
      fileName: req.body?.file_name,
      mimeType: req.body?.mime_type,
      contentBase64: req.body?.content_base64,
    })

    console.log("[blog-upload-image] saved", upload)

    return res.status(201).json({
      ok: true,
      upload,
      url: upload.url,
    })
  } catch (error: any) {
    console.error("[blog-upload-image] failed", {
      message: error?.message,
      stack: error?.stack,
    })

    return res.status(400).json({
      ok: false,
      message: error?.message || "Unable to upload blog image.",
    })
  }
}
