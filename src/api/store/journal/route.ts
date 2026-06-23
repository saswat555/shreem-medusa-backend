import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"

import { formatJournalPost, listJournalPosts } from "../../../lib/journal"

export const GET = async (_req: MedusaRequest, res: MedusaResponse) => {
  const posts = await listJournalPosts()
  const publishedPosts = posts
    .filter((post) => post.status === "published")
    .sort((a, b) => {
      const aTime = new Date(
        a.publishedAt || a.created_at || a.updated_at || 0
      ).getTime()
      const bTime = new Date(
        b.publishedAt || b.created_at || b.updated_at || 0
      ).getTime()

      if (a.publishedAt !== b.publishedAt) {
        return bTime - aTime
      }

      return (
        new Date(b.created_at || b.updated_at || 0).getTime() -
        new Date(a.created_at || a.updated_at || 0).getTime()
      )
    })

  return res.json({
    posts: publishedPosts.map(formatJournalPost),
  })
}
