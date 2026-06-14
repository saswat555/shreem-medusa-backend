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
  relatedLinks?: {
    label: string
    href: string
    reason?: string
  }[]
  created_at: string
  updated_at: string
}

type CreateJournalPostInput = Partial<JournalPost> & {
  published_at?: string
  image_alt?: string
  read_time?: string
}

const getProjectRoot = () => {
  if (process.env.MEDUSA_PROJECT_ROOT) {
    return process.env.MEDUSA_PROJECT_ROOT
  }

  const cwd = process.cwd()
  return cwd.endsWith(path.join(".medusa", "server"))
    ? path.resolve(cwd, "../..")
    : cwd
}

const getJournalFile = () =>
  process.env.JOURNAL_CONTENT_FILE ||
  path.join(getProjectRoot(), "data", "blog-posts.json")

const getJournalFileCandidates = () =>
  Array.from(
    new Set([
      getJournalFile(),
      path.join(getProjectRoot(), "static", "journal-posts.json"),
      path.join(process.cwd(), "static", "journal-posts.json"),
    ])
  )

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
        heading: String(section.heading || "Blog note").trim(),
        body: Array.isArray(section.body)
          ? section.body.map((item) => String(item).trim()).filter(Boolean)
          : [],
      }))
      .filter((section) => section.heading && section.body.length)
  }

  const paragraphs = toParagraphs(input.content || input.description)

  return [
    {
      heading: input.title || "Blog note",
      body: paragraphs.length
        ? paragraphs
        : [
            "This Shreem Blog note is being prepared by the team and will be expanded soon.",
          ],
    },
  ]
}

export const listJournalPosts = async () => {
  for (const file of getJournalFileCandidates()) {
    try {
      const raw = await fs.readFile(file, "utf8")
      const posts = JSON.parse(raw)

      return Array.isArray(posts) ? (posts as JournalPost[]) : []
    } catch (error: any) {
      if (error?.code === "ENOENT") {
        continue
      }

      throw error
    }
  }

  return []
}

export const saveJournalPosts = async (posts: JournalPost[]) => {
  const journalFile = getJournalFile()
  await fs.mkdir(path.dirname(journalFile), { recursive: true })
  await fs.writeFile(journalFile, JSON.stringify(posts, null, 2))
}

export const createJournalPost = async (input: CreateJournalPostInput) => {
  const slug = normalizeSlug(input.slug || input.title)
  const title = String(input.title || "").trim()

  if (!title || !slug) {
    throw new Error("A blog title and slug are required.")
  }

  const posts = await listJournalPosts()

  if (posts.some((post) => post.slug === slug)) {
    throw new Error("A blog post with this slug already exists.")
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
      "A Shreem Blog note on desi-cow products, ritual living, and natural care.",
    content,
    image: input.image || "/shreem-scenes/hero-scene.png",
    imageAlt:
      input.imageAlt ||
      input.image_alt ||
      `${title || "Shreem Blog"} article image`,
    category: input.category || "Shreem Blog",
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

export const updateJournalPost = async (
  idOrSlug: string,
  input: CreateJournalPostInput
) => {
  const posts = await listJournalPosts()
  const index = posts.findIndex(
    (post) => post.id === idOrSlug || post.slug === idOrSlug
  )

  if (index < 0) {
    throw new Error("Blog post not found.")
  }

  const existing = posts[index]
  const nextSlug =
    typeof input.slug !== "undefined"
      ? normalizeSlug(input.slug || input.title)
      : existing.slug
  const nextTitle =
    typeof input.title !== "undefined"
      ? String(input.title || "").trim()
      : existing.title

  if (!nextTitle || !nextSlug) {
    throw new Error("A blog title and slug are required.")
  }

  if (
    posts.some(
      (post) =>
        post.id !== existing.id && (post.slug === nextSlug || post.id === nextSlug)
    )
  ) {
    throw new Error("A blog post with this slug already exists.")
  }

  const excerpt =
    typeof input.excerpt !== "undefined" || typeof input.description !== "undefined"
      ? String(input.excerpt || input.description || "").trim()
      : existing.excerpt
  const content =
    typeof input.content !== "undefined"
      ? String(input.content || "").trim()
      : existing.content || ""
  const updatedPost: JournalPost = {
    ...existing,
    slug: nextSlug,
    title: nextTitle,
    description:
      typeof input.description !== "undefined" ||
      typeof input.excerpt !== "undefined" ||
      typeof input.content !== "undefined"
        ? String(input.description || excerpt || content || nextTitle).trim()
        : existing.description,
    excerpt: excerpt || existing.excerpt,
    content,
    image:
      typeof input.image !== "undefined"
        ? String(input.image || "").trim() || "/shreem-scenes/hero-scene.png"
        : existing.image,
    imageAlt:
      typeof input.imageAlt !== "undefined" || typeof input.image_alt !== "undefined"
        ? String(input.imageAlt || input.image_alt || "").trim() ||
          `${nextTitle} blog image`
        : existing.imageAlt,
    category:
      typeof input.category !== "undefined"
        ? String(input.category || "").trim() || "Shreem Blog"
        : existing.category,
    readTime:
      typeof input.readTime !== "undefined" || typeof input.read_time !== "undefined"
        ? String(input.readTime || input.read_time || "").trim() || "4 min read"
        : existing.readTime,
    status:
      typeof input.status !== "undefined"
        ? input.status === "draft"
          ? "draft"
          : "published"
        : existing.status,
    author_name:
      typeof input.author_name !== "undefined"
        ? String(input.author_name || "").trim() || "Shreem Farms"
        : existing.author_name,
    publishedAt:
      typeof input.published_at !== "undefined" ||
      typeof input.publishedAt !== "undefined"
        ? String(input.published_at || input.publishedAt || new Date().toISOString())
            .slice(0, 10)
        : existing.publishedAt,
    sections:
      typeof input.sections !== "undefined" ||
      typeof input.content !== "undefined" ||
      typeof input.description !== "undefined"
        ? buildSections({
            ...existing,
            ...input,
            title: nextTitle,
            content,
            description: input.description || excerpt || content,
          })
        : existing.sections,
    updated_at: new Date().toISOString(),
  }

  posts[index] = updatedPost
  await saveJournalPosts(posts)

  return updatedPost
}

export const deleteJournalPost = async (idOrSlug: string) => {
  const posts = await listJournalPosts()
  const nextPosts = posts.filter(
    (post) => post.id !== idOrSlug && post.slug !== idOrSlug
  )

  if (nextPosts.length === posts.length) {
    throw new Error("Blog post not found.")
  }

  await saveJournalPosts(nextPosts)
}

export const formatJournalPost = (post: JournalPost) => ({
  ...post,
  published_at: post.publishedAt,
  image_alt: post.imageAlt,
  read_time: post.readTime,
})
