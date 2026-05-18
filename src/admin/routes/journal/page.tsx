import { useEffect, useState } from "react"
import { defineRouteConfig } from "@medusajs/admin-sdk"
import {
  Button,
  Container,
  Heading,
  Input,
  Label,
  Text,
  Textarea,
} from "@medusajs/ui"
import { sdk } from "../../lib/sdk"

type JournalPost = {
  id: string
  title: string
  slug: string
  excerpt: string
  status: string
  category: string
  published_at?: string | null
}

const JournalPage = () => {
  const [posts, setPosts] = useState<JournalPost[]>([])
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState("")

  const [title, setTitle] = useState("")
  const [slug, setSlug] = useState("")
  const [excerpt, setExcerpt] = useState("")
  const [content, setContent] = useState("")
  const [category, setCategory] = useState("general")

  const loadPosts = async () => {
    setLoading(true)
    try {
      const res = await sdk.client.fetch<{ posts?: JournalPost[] }>(
        "/admin/journal",
        {
          method: "GET",
        }
      )
      setPosts(res.posts || [])
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadPosts()
  }, [])

  const createPost = async () => {
    if (!title || !slug) return
    setSaving(true)
    setMessage("")
    try {
      await sdk.client.fetch("/admin/journal", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: {
          title,
          slug,
          excerpt,
          content,
          category,
          status: "published",
          published_at: new Date().toISOString(),
          author_name: "Shreem Farms",
        },
      })

      setTitle("")
      setSlug("")
      setExcerpt("")
      setContent("")
      setCategory("general")

      await loadPosts()
      setMessage("Article created and available through the storefront journal API.")
    } catch (error: any) {
      setMessage(error?.message || "Unable to create article.")
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <Container>
        <Heading level="h1">Journal</Heading>
        <Text className="text-ui-fg-subtle mt-2">
          Manage blog and journal content shown on the storefront.
        </Text>
      </Container>

      <Container className="space-y-4">
        <Heading level="h2">Create Article</Heading>

        <div className="grid grid-cols-1 gap-4">
          <div>
            <Label>Title</Label>
            <Input value={title} onChange={(e) => setTitle(e.target.value)} />
          </div>

          <div>
            <Label>Slug</Label>
            <Input value={slug} onChange={(e) => setSlug(e.target.value)} />
          </div>

          <div>
            <Label>Excerpt</Label>
            <Textarea value={excerpt} onChange={(e) => setExcerpt(e.target.value)} />
          </div>

          <div>
            <Label>Content</Label>
            <Textarea value={content} onChange={(e) => setContent(e.target.value)} rows={8} />
          </div>

          <div>
            <Label>Category</Label>
            <Input value={category} onChange={(e) => setCategory(e.target.value)} />
          </div>

          <div>
            <Button isLoading={saving} onClick={createPost}>
              Create Article
            </Button>
            {message && (
              <Text className="mt-3 text-ui-fg-subtle">
                {message}
              </Text>
            )}
          </div>
        </div>
      </Container>

      <Container>
        <Heading level="h2">Articles</Heading>
        <div className="mt-4 space-y-3">
          {loading ? (
            <Text>Loading...</Text>
          ) : posts.length === 0 ? (
            <Text>No articles found.</Text>
          ) : (
            posts.map((post) => (
              <div key={post.id} className="border rounded-lg p-4">
                <div className="font-medium">{post.title}</div>
                <div className="text-sm text-ui-fg-subtle">/{post.slug}</div>
                <div className="text-sm mt-1">Category: {post.category}</div>
                <div className="text-sm">Status: {post.status}</div>
              </div>
            ))
          )}
        </div>
      </Container>
    </div>
  )
}

export const config = defineRouteConfig({
  label: "Journal",
})

export default JournalPage
