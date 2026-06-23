import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"

import { formatJournalPostCard, listJournalPosts } from "../../../lib/journal"

const parsePositiveInt = (value: unknown, fallback: number, max: number) => {
  const parsed = Number(value || fallback)

  if (!Number.isFinite(parsed) || parsed <= 0) {
    return fallback
  }

  return Math.min(Math.trunc(parsed), max)
}

export const GET = async (req: MedusaRequest, res: MedusaResponse) => {
  const limit = parsePositiveInt(req.query.limit, 12, 50)
  const offset = Math.max(0, Number(req.query.offset || 0) || 0)
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

  const paginatedPosts = publishedPosts.slice(offset, offset + limit)

  return res.json({
    posts: paginatedPosts.map(formatJournalPostCard),
    count: publishedPosts.length,
    limit,
    offset,
    has_more: offset + limit < publishedPosts.length,
  })
}
