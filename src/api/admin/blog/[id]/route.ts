import {
  AuthenticatedMedusaRequest,
  MedusaResponse,
} from "@medusajs/framework/http"

import {
  deleteJournalPost,
  formatJournalPost,
  updateJournalPost,
} from "../../../../lib/journal"

type Params = {
  id: string
}

const isAdminRequest = (req: AuthenticatedMedusaRequest) =>
  (req as any).auth_context?.actor_type === "user" &&
  Boolean((req as any).auth_context?.actor_id)

export const PATCH = async (
  req: AuthenticatedMedusaRequest<Record<string, unknown>, Params>,
  res: MedusaResponse
) => {
  if (!isAdminRequest(req)) {
    return res.status(401).json({
      message: "Admin authentication is required.",
    })
  }

  try {
    const post = await updateJournalPost(req.params.id, req.body || {})

    return res.json({
      post: formatJournalPost(post),
    })
  } catch (error: any) {
    return res.status(400).json({
      message: error?.message || "Unable to update blog post.",
    })
  }
}

export const DELETE = async (
  req: AuthenticatedMedusaRequest<unknown, Params>,
  res: MedusaResponse
) => {
  if (!isAdminRequest(req)) {
    return res.status(401).json({
      message: "Admin authentication is required.",
    })
  }

  try {
    await deleteJournalPost(req.params.id)

    return res.status(204).send()
  } catch (error: any) {
    return res.status(400).json({
      message: error?.message || "Unable to delete blog post.",
    })
  }
}
