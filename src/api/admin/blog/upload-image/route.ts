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

const isAdminRequest = (req: AuthenticatedMedusaRequest) =>
  (req as any).auth_context?.actor_type === "user" &&
  Boolean((req as any).auth_context?.actor_id)

export const POST = async (
  req: AuthenticatedMedusaRequest<UploadImageBody>,
  res: MedusaResponse
) => {
  if (!isAdminRequest(req)) {
    return res.status(401).json({
      message: "Admin authentication is required.",
    })
  }

  try {
    const upload = await saveAdminImageUpload({
      directory: "blog",
      fileName: req.body?.file_name,
      mimeType: req.body?.mime_type,
      contentBase64: req.body?.content_base64,
    })

    return res.status(201).json({
      ok: true,
      upload,
      url: upload.url,
    })
  } catch (error: any) {
    return res.status(400).json({
      ok: false,
      message: error?.message || "Unable to upload blog image.",
    })
  }
}
