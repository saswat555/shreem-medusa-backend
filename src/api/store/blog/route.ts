import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"

import { formatJournalPost, listJournalPosts } from "../../../lib/journal"

export const GET = async (_req: MedusaRequest, res: MedusaResponse) => {
  const posts = await listJournalPosts()
  const publishedPosts = posts
    .filter((post) => post.status === "published")
    .sort((a, b) => (a.publishedAt < b.publishedAt ? 1 : -1))

  return res.json({
    posts: publishedPosts.map(formatJournalPost),
  })
}
