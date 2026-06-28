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
  const published = posts.filter((post) => post.status === "published").length
  const draft = posts.filter((post) => post.status === "draft").length

  return res.json({
    posts: posts.map(formatJournalPost),
    count: posts.length,
    published,
    draft,
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
