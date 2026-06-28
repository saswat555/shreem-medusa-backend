import { useEffect, useMemo, useState } from "react"
import { defineRouteConfig } from "@medusajs/admin-sdk"
import {
  Badge,
  Button,
  Container,
  Heading,
  Input,
  Label,
  Select,
  Text,
  Textarea,
} from "@medusajs/ui"
import { sdk } from "../../lib/sdk"

type BlogStatus = "draft" | "published"

type BlogPost = {
  id: string
  title: string
  slug: string
  description?: string
  excerpt: string
  content?: string
  status: BlogStatus
  category: string
  image?: string
  imageUrl?: string
  image_alt?: string
  imageAlt?: string
  read_time?: string
  readTime?: string
  published_at?: string | null
  publishedAt?: string | null
  targetKeyword?: string
  target_keyword?: string
  relatedKeywords?: string[]
  related_keywords?: string[]
  searchIntent?: string
  search_intent?: string
  focusedProduct?: {
    name?: string
    href?: string
    handle?: string
    category?: string
  }
  focused_product?: BlogPost["focusedProduct"]
  productCta?: {
    midArticle?: string
    final?: string
  }
  product_cta?: BlogPost["productCta"]
  faq?: {
    question: string
    answer: string
  }[]
  relatedLinks?: {
    label: string
    href: string
    reason?: string
  }[]
  archivedReason?: string
  archivedAt?: string
  metadata?: Record<string, any>
}

type BlogFilter = "all" | "published" | "draft"

const emptyForm = {
  id: "",
  title: "",
  slug: "",
  excerpt: "",
  content: "",
  category: "Shreem Blog",
  status: "published" as BlogStatus,
  image: "",
  image_alt: "",
  read_time: "4 min read",
  targetKeyword: "",
  relatedKeywords: "",
  searchIntent: "",
  focusedProductName: "",
  focusedProductHref: "",
  focusedProductHandle: "",
  productCtaMid: "",
  productCtaFinal: "",
  faqJson: "[]",
  relatedLinksJson: "[]",
}

const safeJson = (value: unknown) => JSON.stringify(value || [], null, 2)

const parseJsonArray = (value: string, label: string) => {
  try {
    const parsed = JSON.parse(value || "[]")

    if (!Array.isArray(parsed)) {
      throw new Error(`${label} must be a JSON array.`)
    }

    return parsed
  } catch (error: any) {
    throw new Error(error?.message || `${label} must be valid JSON.`)
  }
}

const normalizeStatus = (value: string): BlogStatus =>
  value === "draft" ? "draft" : "published"

const BlogPage = () => {
  const [posts, setPosts] = useState<BlogPost[]>([])
  const [form, setForm] = useState(emptyForm)
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [uploadingImage, setUploadingImage] = useState(false)
  const [message, setMessage] = useState("")
  const [filter, setFilter] = useState<BlogFilter>("all")
  const [query, setQuery] = useState("")

  const publishedCount = posts.filter((post) => post.status === "published").length
  const draftCount = posts.filter((post) => post.status === "draft").length

  const filteredPosts = useMemo(() => {
    const q = query.trim().toLowerCase()

    return posts.filter((post) => {
      if (filter !== "all" && post.status !== filter) {
        return false
      }

      if (!q) {
        return true
      }

      return [
        post.title,
        post.slug,
        post.category,
        post.targetKeyword || post.target_keyword,
        post.focusedProduct?.name || post.focused_product?.name,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase()
        .includes(q)
    })
  }, [filter, posts, query])

  const loadPosts = async () => {
    setLoading(true)
    setMessage("")

    try {
      const res = await sdk.client.fetch<{ posts?: BlogPost[] }>("/admin/blog", {
        method: "GET",
        query: {
          _: Date.now(),
        },
        cache: "no-store",
      } as any)
      setPosts(res.posts || [])
    } catch (error: any) {
      setMessage(error?.message || "Unable to load blog posts.")
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

  const fileToBase64 = (file: File) =>
    new Promise<string>((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = () => resolve(String(reader.result || ""))
      reader.onerror = () => reject(reader.error)
      reader.readAsDataURL(file)
    })

  const uploadBlogImage = async (file?: File | null) => {
    if (!file) return

    setUploadingImage(true)
    setMessage("")

    try {
      const contentBase64 = await fileToBase64(file)
      const res = await sdk.client.fetch<{ url?: string }>("/admin/blog/upload-image", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: {
          file_name: file.name,
          mime_type: file.type,
          content_base64: contentBase64,
        },
      })

      if (!res.url) {
        throw new Error("Upload completed but no image URL was returned.")
      }

      updateField("image", res.url)
      if (!form.image_alt) {
        updateField("image_alt", form.title || "Shreem Blog image")
      }
      setMessage("Image uploaded. Save the blog post to publish this image URL.")
    } catch (error: any) {
      setMessage(error?.message || "Unable to upload image.")
    } finally {
      setUploadingImage(false)
    }
  }

  const editPost = (post: BlogPost) => {
    const focusedProduct = post.focusedProduct || post.focused_product || {}
    const productCta = post.productCta || post.product_cta || {}

    setForm({
      id: post.id,
      title: post.title || "",
      slug: post.slug || "",
      excerpt: post.excerpt || post.description || "",
      content: post.content || "",
      category: post.category || "Shreem Blog",
      status: normalizeStatus(post.status),
      image: post.image || post.imageUrl || "",
      image_alt: post.image_alt || post.imageAlt || "",
      read_time: post.read_time || post.readTime || "4 min read",
      targetKeyword: post.targetKeyword || post.target_keyword || "",
      relatedKeywords: (post.relatedKeywords || post.related_keywords || []).join(", "),
      searchIntent: post.searchIntent || post.search_intent || "",
      focusedProductName: focusedProduct.name || "",
      focusedProductHref: focusedProduct.href || "",
      focusedProductHandle: focusedProduct.handle || "",
      productCtaMid: productCta.midArticle || "",
      productCtaFinal: productCta.final || "",
      faqJson: safeJson(post.faq),
      relatedLinksJson: safeJson(post.relatedLinks),
    })
    setMessage("")
  }

  const savePost = async () => {
    if (!form.title || !form.slug) return
    setSaving(true)
    setMessage("")
    try {
      const faq = parseJsonArray(form.faqJson, "FAQ")
      const relatedLinks = parseJsonArray(form.relatedLinksJson, "Related links")
      const relatedKeywords = form.relatedKeywords
        .split(",")
        .map((keyword) => keyword.trim())
        .filter(Boolean)
      const focusedProduct =
        form.focusedProductName || form.focusedProductHref || form.focusedProductHandle
          ? {
              name: form.focusedProductName,
              href: form.focusedProductHref,
              handle: form.focusedProductHandle,
            }
          : undefined
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
        published_at: form.status === "published" ? new Date().toISOString() : undefined,
        author_name: "Shreem Farms",
        targetKeyword: form.targetKeyword,
        relatedKeywords,
        searchIntent: form.searchIntent,
        focusedProduct,
        productCta: {
          midArticle: form.productCtaMid,
          final: form.productCtaFinal,
        },
        faq,
        relatedLinks,
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
      setMessage("Blog post saved.")
    } catch (error: any) {
      setMessage(error?.message || "Unable to save blog post.")
    } finally {
      setSaving(false)
    }
  }

  const updatePostStatus = async (post: BlogPost, status: BlogStatus) => {
    setMessage("")
    await sdk.client.fetch(`/admin/blog/${post.id}`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
      },
      body: {
        status,
        published_at:
          status === "published"
            ? post.published_at || post.publishedAt || new Date().toISOString()
            : post.published_at || post.publishedAt,
      },
    })
    await loadPosts()
    setMessage(status === "published" ? "Post published." : "Post moved to draft.")
  }

  const deletePost = async (post: BlogPost) => {
    if (!window.confirm(`Delete "${post.title}"? This cannot be undone.`)) {
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
        <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
          <div>
            <Heading level="h1">Blog</Heading>
            <Text className="text-ui-fg-subtle mt-2">
              Manage published posts, archived drafts, SEO metadata, CTAs, FAQs and
              product links for Shreem Blog.
            </Text>
          </div>
          <div className="flex flex-wrap gap-2">
            <Badge color="green">{publishedCount} published</Badge>
            <Badge color="grey">{draftCount} drafts</Badge>
            <Badge>{posts.length} total</Badge>
          </div>
        </div>
      </Container>

      <Container className="space-y-5">
        <div className="flex items-center justify-between gap-3">
          <Heading level="h2">{form.id ? "Edit Blog Post" : "Create Blog Post"}</Heading>
          {form.id && (
            <Button variant="secondary" onClick={resetForm}>
              New post
            </Button>
          )}
        </div>

        <div className="grid grid-cols-1 gap-4">
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
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
              rows={7}
            />
            <Text className="text-ui-fg-subtle mt-1">
              For generated posts, detailed sections are preserved even if this field is
              empty. Use this for manual paragraph-based posts.
            </Text>
          </div>

          <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
            <div>
              <Label>Category</Label>
              <Input
                value={form.category}
                onChange={(e) => updateField("category", e.target.value)}
              />
            </div>
            <div>
              <Label>Status</Label>
              <Select
                value={form.status}
                onValueChange={(value) => updateField("status", normalizeStatus(value))}
              >
                <Select.Trigger>
                  <Select.Value placeholder="Status" />
                </Select.Trigger>
                <Select.Content>
                  <Select.Item value="published">Published</Select.Item>
                  <Select.Item value="draft">Draft</Select.Item>
                </Select.Content>
              </Select>
            </div>
            <div>
              <Label>Read time</Label>
              <Input
                value={form.read_time}
                onChange={(e) => updateField("read_time", e.target.value)}
              />
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
            <div>
              <Label>Target keyword</Label>
              <Input
                value={form.targetKeyword}
                onChange={(e) => updateField("targetKeyword", e.target.value)}
                placeholder="gau kasht for havan"
              />
            </div>
            <div>
              <Label>Related keywords</Label>
              <Input
                value={form.relatedKeywords}
                onChange={(e) => updateField("relatedKeywords", e.target.value)}
                placeholder="comma separated"
              />
            </div>
            <div>
              <Label>Search intent</Label>
              <Input
                value={form.searchIntent}
                onChange={(e) => updateField("searchIntent", e.target.value)}
                placeholder="commercial / informational"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
            <div>
              <Label>Focused product name</Label>
              <Input
                value={form.focusedProductName}
                onChange={(e) => updateField("focusedProductName", e.target.value)}
              />
            </div>
            <div>
              <Label>Focused product URL</Label>
              <Input
                value={form.focusedProductHref}
                onChange={(e) => updateField("focusedProductHref", e.target.value)}
                placeholder="/products/..."
              />
            </div>
            <div>
              <Label>Focused product handle</Label>
              <Input
                value={form.focusedProductHandle}
                onChange={(e) => updateField("focusedProductHandle", e.target.value)}
              />
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <div>
              <Label>Mid-article CTA</Label>
              <Textarea
                value={form.productCtaMid}
                onChange={(e) => updateField("productCtaMid", e.target.value)}
                rows={3}
              />
            </div>
            <div>
              <Label>Final CTA</Label>
              <Textarea
                value={form.productCtaFinal}
                onChange={(e) => updateField("productCtaFinal", e.target.value)}
                rows={3}
              />
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <div>
              <Label>FAQ JSON</Label>
              <Textarea
                value={form.faqJson}
                onChange={(e) => updateField("faqJson", e.target.value)}
                rows={6}
              />
            </div>
            <div>
              <Label>Related links JSON</Label>
              <Textarea
                value={form.relatedLinksJson}
                onChange={(e) => updateField("relatedLinksJson", e.target.value)}
                rows={6}
              />
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <div>
              <Label>Image URL</Label>
              <div className="mt-1 flex flex-col gap-2">
                <Input
                  value={form.image}
                  onChange={(e) => updateField("image", e.target.value)}
                  placeholder="Paste an image URL or upload below"
                />
                <Input
                  type="file"
                  accept="image/png,image/jpeg,image/webp,image/gif"
                  disabled={uploadingImage}
                  onChange={(e) => uploadBlogImage(e.target.files?.[0])}
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
          </div>

          {form.image ? (
            <div className="overflow-hidden rounded-lg border bg-ui-bg-subtle">
              <img
                src={form.image}
                alt={form.image_alt || "Blog image preview"}
                className="h-44 w-full object-cover"
              />
            </div>
          ) : null}

          <div>
            <Button isLoading={saving || uploadingImage} onClick={savePost}>
              {form.id ? "Save changes" : "Create post"}
            </Button>
            {message && <Text className="text-ui-fg-subtle mt-3">{message}</Text>}
          </div>
        </div>
      </Container>

      <Container>
        <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
          <div>
            <Heading level="h2">Blog Posts</Heading>
            <Text className="text-ui-fg-subtle mt-1">
              Published posts appear on the site and sitemap. Drafts stay manageable here.
            </Text>
          </div>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-[180px_260px_auto]">
            <Select value={filter} onValueChange={(value) => setFilter(value as BlogFilter)}>
              <Select.Trigger>
                <Select.Value placeholder="Filter" />
              </Select.Trigger>
              <Select.Content>
                <Select.Item value="all">All</Select.Item>
                <Select.Item value="published">Published</Select.Item>
                <Select.Item value="draft">Drafts</Select.Item>
              </Select.Content>
            </Select>
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search title, slug, keyword"
            />
            <Button variant="secondary" isLoading={loading} onClick={loadPosts}>
              Refresh
            </Button>
          </div>
        </div>
        <div className="mt-4 space-y-3">
          {loading ? (
            <Text>Loading...</Text>
          ) : filteredPosts.length === 0 ? (
            <Text>No posts found.</Text>
          ) : (
            filteredPosts.map((post) => {
              const focusedProduct = post.focusedProduct || post.focused_product
              const targetKeyword = post.targetKeyword || post.target_keyword
              const archivedReason =
                post.archivedReason ||
                post.metadata?.growthCleanup?.reason ||
                ""

              return (
                <div key={post.id} className="rounded-lg border p-4">
                  <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                    <div>
                      <div className="font-medium">{post.title}</div>
                      <div className="text-ui-fg-subtle text-sm">/blog/{post.slug}</div>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <Badge color={post.status === "published" ? "green" : "grey"}>
                        {post.status}
                      </Badge>
                      {targetKeyword && <Badge>{targetKeyword}</Badge>}
                    </div>
                  </div>
                  <div className="text-ui-fg-subtle mt-3 grid gap-1 text-sm md:grid-cols-2">
                    <div>Category: {post.category}</div>
                    <div>Focused product: {focusedProduct?.name || "-"}</div>
                    <div>Published: {post.published_at || post.publishedAt || "-"}</div>
                    <div>FAQs: {post.faq?.length || 0}</div>
                  </div>
                  {archivedReason && (
                    <div className="mt-3 rounded-md bg-ui-bg-subtle px-3 py-2 text-sm text-ui-fg-subtle">
                      Archived reason: {archivedReason}
                    </div>
                  )}
                  <div className="mt-3 flex flex-wrap gap-2">
                    <Button variant="secondary" onClick={() => editPost(post)}>
                      Edit
                    </Button>
                    {post.status === "published" ? (
                      <Button
                        variant="secondary"
                        onClick={() => updatePostStatus(post, "draft")}
                      >
                        Move to draft
                      </Button>
                    ) : (
                      <Button
                        variant="secondary"
                        onClick={() => updatePostStatus(post, "published")}
                      >
                        Publish
                      </Button>
                    )}
                    <Button variant="danger" onClick={() => deletePost(post)}>
                      Delete
                    </Button>
                  </div>
                </div>
              )
            })
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
