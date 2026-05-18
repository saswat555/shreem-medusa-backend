import { randomUUID } from "node:crypto"
import fs from "node:fs/promises"
import path from "node:path"

export type JournalSection = {
  heading: string
  body: string[]
}

export type JournalPost = {
  id: string
  slug: string
  title: string
  description: string
  excerpt: string
  content?: string
  image: string
  imageAlt: string
  category: string
  readTime: string
  status: "draft" | "published"
  author_name: string
  publishedAt: string
  sections: JournalSection[]
  created_at: string
  updated_at: string
}

type CreateJournalPostInput = Partial<JournalPost> & {
  published_at?: string
  image_alt?: string
  read_time?: string
}

const journalFile =
  process.env.JOURNAL_CONTENT_FILE ||
  path.join(process.cwd(), "static", "journal-posts.json")

const normalizeSlug = (value?: string) =>
  (value || "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "")

const toParagraphs = (value?: string) =>
  (value || "")
    .split(/\n{2,}/)
    .map((item) => item.trim())
    .filter(Boolean)

const buildSections = (input: CreateJournalPostInput): JournalSection[] => {
  if (Array.isArray(input.sections) && input.sections.length) {
    return input.sections
      .map((section) => ({
        heading: String(section.heading || "Journal note").trim(),
        body: Array.isArray(section.body)
          ? section.body.map((item) => String(item).trim()).filter(Boolean)
          : [],
      }))
      .filter((section) => section.heading && section.body.length)
  }

  const paragraphs = toParagraphs(input.content || input.description)

  return [
    {
      heading: input.title || "Journal note",
      body: paragraphs.length
        ? paragraphs
        : [
            "This Shreem Journal note is being prepared by the team and will be expanded soon.",
          ],
    },
  ]
}

export const listJournalPosts = async () => {
  try {
    const raw = await fs.readFile(journalFile, "utf8")
    const posts = JSON.parse(raw)

    return Array.isArray(posts) ? (posts as JournalPost[]) : []
  } catch (error: any) {
    if (error?.code === "ENOENT") {
      return []
    }

    throw error
  }
}

export const saveJournalPosts = async (posts: JournalPost[]) => {
  await fs.mkdir(path.dirname(journalFile), { recursive: true })
  await fs.writeFile(journalFile, JSON.stringify(posts, null, 2))
}

export const createJournalPost = async (input: CreateJournalPostInput) => {
  const slug = normalizeSlug(input.slug || input.title)
  const title = String(input.title || "").trim()

  if (!title || !slug) {
    throw new Error("A journal title and slug are required.")
  }

  const posts = await listJournalPosts()

  if (posts.some((post) => post.slug === slug)) {
    throw new Error("A journal post with this slug already exists.")
  }

  const now = new Date().toISOString()
  const excerpt = String(input.excerpt || input.description || "").trim()
  const content = String(input.content || "").trim()
  const post: JournalPost = {
    id: input.id || `journal_${randomUUID().replace(/-/g, "")}`,
    slug,
    title,
    description:
      String(input.description || excerpt || content || title).trim() || title,
    excerpt:
      excerpt ||
      "A Shreem Journal note on desi-cow products, ritual living, and natural care.",
    content,
    image: input.image || "/shreem-scenes/hero-scene.png",
    imageAlt:
      input.imageAlt ||
      input.image_alt ||
      `${title || "Shreem Journal"} article image`,
    category: input.category || "Shreem Journal",
    readTime: input.readTime || input.read_time || "4 min read",
    status: input.status === "draft" ? "draft" : "published",
    author_name: input.author_name || "Shreem Farms",
    publishedAt: String(input.published_at || input.publishedAt || now).slice(
      0,
      10
    ),
    sections: buildSections(input),
    created_at: now,
    updated_at: now,
  }

  posts.unshift(post)
  await saveJournalPosts(posts)

  return post
}

export const formatJournalPost = (post: JournalPost) => ({
  ...post,
  published_at: post.publishedAt,
  image_alt: post.imageAlt,
  read_time: post.readTime,
})
