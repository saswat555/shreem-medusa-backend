import {
  AuthenticatedMedusaRequest,
  MedusaResponse,
} from "@medusajs/framework/http"

import {
  createJournalPost,
  formatJournalPost,
  listJournalPosts,
} from "../../../lib/journal"

const isAdminRequest = (req: AuthenticatedMedusaRequest) =>
  (req as any).auth_context?.actor_type === "user" &&
  Boolean((req as any).auth_context?.actor_id)

export const GET = async (
  req: AuthenticatedMedusaRequest,
  res: MedusaResponse
) => {
  if (!isAdminRequest(req)) {
    return res.status(401).json({
      message: "Admin authentication is required.",
      posts: [],
    })
  }

  const posts = await listJournalPosts()

  return res.json({
    posts: posts.map(formatJournalPost),
  })
}

export const POST = async (
  req: AuthenticatedMedusaRequest,
  res: MedusaResponse
) => {
  if (!isAdminRequest(req)) {
    return res.status(401).json({
      message: "Admin authentication is required.",
    })
  }

  try {
    const post = await createJournalPost(req.body || {})

    return res.status(201).json({
      post: formatJournalPost(post),
    })
  } catch (error: any) {
    return res.status(400).json({
      message: error?.message || "Unable to create blog post.",
    })
  }
}
