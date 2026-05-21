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

type BlogPost = {
  id: string
  title: string
  slug: string
  excerpt: string
  content?: string
  status: "draft" | "published"
  category: string
  image?: string
  image_alt?: string
  read_time?: string
  published_at?: string | null
}

const emptyForm = {
  id: "",
  title: "",
  slug: "",
  excerpt: "",
  content: "",
  category: "Shreem Blog",
  status: "published" as BlogPost["status"],
  image: "",
  image_alt: "",
  read_time: "4 min read",
}

const BlogPage = () => {
  const [posts, setPosts] = useState<BlogPost[]>([])
  const [form, setForm] = useState(emptyForm)
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState("")

  const loadPosts = async () => {
    setLoading(true)
    try {
      const res = await sdk.client.fetch<{ posts?: BlogPost[] }>("/admin/blog", {
        method: "GET",
      })
      setPosts(res.posts || [])
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadPosts()
  }, [])

  const updateField = (field: keyof typeof emptyForm, value: string) => {
    setForm((current) => ({
      ...current,
      [field]: value,
    }))
  }

  const resetForm = () => {
    setForm(emptyForm)
    setMessage("")
  }

  const editPost = (post: BlogPost) => {
    setForm({
      id: post.id,
      title: post.title || "",
      slug: post.slug || "",
      excerpt: post.excerpt || "",
      content: post.content || "",
      category: post.category || "Shreem Blog",
      status: post.status || "published",
      image: post.image || "",
      image_alt: post.image_alt || "",
      read_time: post.read_time || "4 min read",
    })
    setMessage("")
  }

  const savePost = async () => {
    if (!form.title || !form.slug) return
    setSaving(true)
    setMessage("")
    try {
      const body = {
        title: form.title,
        slug: form.slug,
        excerpt: form.excerpt,
        description: form.excerpt,
        content: form.content,
        category: form.category,
        status: form.status,
        image: form.image,
        image_alt: form.image_alt,
        read_time: form.read_time,
        published_at: new Date().toISOString(),
        author_name: "Shreem Farms",
      }

      if (form.id) {
        await sdk.client.fetch(`/admin/blog/${form.id}`, {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
          },
          body,
        })
      } else {
        await sdk.client.fetch("/admin/blog", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body,
        })
      }

      resetForm()
      await loadPosts()
      setMessage("Blog post saved and available through the storefront Blog API.")
    } catch (error: any) {
      setMessage(error?.message || "Unable to save blog post.")
    } finally {
      setSaving(false)
    }
  }

  const deletePost = async (post: BlogPost) => {
    if (!window.confirm(`Delete "${post.title}"?`)) {
      return
    }

    setMessage("")
    await sdk.client.fetch(`/admin/blog/${post.id}`, {
      method: "DELETE",
    })
    await loadPosts()
    if (form.id === post.id) {
      resetForm()
    }
    setMessage("Blog post deleted.")
  }

  return (
    <div className="flex flex-col gap-6">
      <Container>
        <Heading level="h1">Blog</Heading>
        <Text className="text-ui-fg-subtle mt-2">
          Create, edit, publish, draft, and remove storefront blog content.
        </Text>
      </Container>

      <Container className="space-y-4">
        <div className="flex items-center justify-between gap-3">
          <Heading level="h2">{form.id ? "Edit Blog Post" : "Create Blog Post"}</Heading>
          {form.id && (
            <Button variant="secondary" onClick={resetForm}>
              New post
            </Button>
          )}
        </div>

        <div className="grid grid-cols-1 gap-4">
          <div>
            <Label>Title</Label>
            <Input
              value={form.title}
              onChange={(e) => updateField("title", e.target.value)}
            />
          </div>

          <div>
            <Label>Slug</Label>
            <Input
              value={form.slug}
              onChange={(e) => updateField("slug", e.target.value)}
            />
          </div>

          <div>
            <Label>Excerpt / SEO description</Label>
            <Textarea
              value={form.excerpt}
              onChange={(e) => updateField("excerpt", e.target.value)}
            />
          </div>

          <div>
            <Label>Content</Label>
            <Textarea
              value={form.content}
              onChange={(e) => updateField("content", e.target.value)}
              rows={8}
            />
            <Text className="text-ui-fg-subtle mt-1">
              Separate paragraphs with a blank line.
            </Text>
          </div>

          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <div>
              <Label>Category</Label>
              <Input
                value={form.category}
                onChange={(e) => updateField("category", e.target.value)}
              />
            </div>
            <div>
              <Label>Status</Label>
              <Input
                value={form.status}
                onChange={(e) =>
                  updateField(
                    "status",
                    e.target.value === "draft" ? "draft" : "published"
                  )
                }
              />
            </div>
            <div>
              <Label>Read time</Label>
              <Input
                value={form.read_time}
                onChange={(e) => updateField("read_time", e.target.value)}
              />
            </div>
            <div>
              <Label>Image URL</Label>
              <Input
                value={form.image}
                onChange={(e) => updateField("image", e.target.value)}
              />
            </div>
          </div>

          <div>
            <Label>Image alt text</Label>
            <Input
              value={form.image_alt}
              onChange={(e) => updateField("image_alt", e.target.value)}
            />
          </div>

          <div>
            <Button isLoading={saving} onClick={savePost}>
              {form.id ? "Save changes" : "Create post"}
            </Button>
            {message && <Text className="mt-3 text-ui-fg-subtle">{message}</Text>}
          </div>
        </div>
      </Container>

      <Container>
        <Heading level="h2">Blog Posts</Heading>
        <div className="mt-4 space-y-3">
          {loading ? (
            <Text>Loading...</Text>
          ) : posts.length === 0 ? (
            <Text>No posts found.</Text>
          ) : (
            posts.map((post) => (
              <div key={post.id} className="rounded-lg border p-4">
                <div className="font-medium">{post.title}</div>
                <div className="text-ui-fg-subtle text-sm">/blog/{post.slug}</div>
                <div className="mt-1 text-sm">Category: {post.category}</div>
                <div className="text-sm">Status: {post.status}</div>
                <div className="mt-3 flex gap-2">
                  <Button variant="secondary" onClick={() => editPost(post)}>
                    Edit
                  </Button>
                  <Button variant="danger" onClick={() => deletePost(post)}>
                    Delete
                  </Button>
                </div>
              </div>
            ))
          )}
        </div>
      </Container>
    </div>
  )
}

export const config = defineRouteConfig({
  label: "Blog",
})

export default BlogPage
