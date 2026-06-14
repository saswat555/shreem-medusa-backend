#!/usr/bin/env node

const fs = require("node:fs")
const path = require("node:path")

const backendRoot = path.resolve(__dirname, "..")
const workspaceRoot = path.resolve(backendRoot, "..")
const journalFile =
  process.env.JOURNAL_CONTENT_FILE ||
  path.join(backendRoot, "data", "blog-posts.json")
const logFile =
  process.env.BLOG_CRON_LOG_FILE ||
  path.join(backendRoot, "data", "blog-cron.log")

const envFiles = [
  path.join(backendRoot, ".env"),
  path.join(workspaceRoot, "shreem-storefront", ".env"),
  path.join(workspaceRoot, "shreem-storefront", ".env.local"),
]

const loadEnvFile = (file) => {
  if (!fs.existsSync(file)) {
    return
  }

  const raw = fs.readFileSync(file, "utf8")

  for (const line of raw.split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)=(.*)\s*$/)

    if (!match) {
      continue
    }

    const key = match[1]
    let value = match[2] || ""

    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1)
    }

    if (!process.env[key]) {
      process.env[key] = value
    }
  }
}

envFiles.forEach(loadEnvFile)

const slugify = (value) =>
  String(value || "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "")

const appendLog = (message, data = {}) => {
  fs.mkdirSync(path.dirname(logFile), { recursive: true })
  fs.appendFileSync(
    logFile,
    `${new Date().toISOString()} ${message} ${JSON.stringify(data)}\n`
  )
}

const readPosts = () => {
  if (!fs.existsSync(journalFile)) {
    return []
  }

  const posts = JSON.parse(fs.readFileSync(journalFile, "utf8"))

  return Array.isArray(posts) ? posts : []
}

const savePosts = (posts) => {
  fs.mkdirSync(path.dirname(journalFile), { recursive: true })
  fs.writeFileSync(journalFile, `${JSON.stringify(posts, null, 2)}\n`)
}

const extractJson = (text) => {
  const clean = String(text || "")
    .replace(/```json\s*/gi, "```")
    .replace(/^```|```$/g, "")
    .trim()
  const match = clean.match(/\{[\s\S]*\}/)

  if (!match) {
    throw new Error("Gemini response did not contain JSON.")
  }

  return JSON.parse(match[0])
}

const sleep = (ms) =>
  new Promise((resolve) => {
    setTimeout(resolve, ms)
  })

const SEO_TOPICS = [
  {
    keyword: "A2 bilona ghee cooked on cow dung cakes",
    angle: "how cultured curd, hand churning, and slow gau-kasht finishing change aroma and buyer confidence",
    links: [
      {
        label: "A2 Bilona Ghee",
        href: "/products/shreem-a2-bilona-ghee",
        reason: "Best next page for readers comparing traditional ghee options.",
      },
      {
        label: "Shop Shreem products",
        href: "/store",
        reason: "Move from research to the full cow-product catalogue.",
      },
    ],
  },
  {
    keyword: "natural neem dhoop for pooja and home fragrance",
    angle: "why neem dhoop fits evening rituals without making exaggerated health claims",
    links: [
      {
        label: "Neem Dhoop",
        href: "/products/organic-neem-dhoob",
        reason: "Helpful for readers looking for a simple pooja dhoop option.",
      },
      {
        label: "Cow Dung Cakes",
        href: "/products/cowdung-cake",
        reason: "Related ritual product for havan and dhooni use.",
      },
    ],
  },
  {
    keyword: "Jeevamrut and vermicompost for natural farming",
    angle: "how living soil inputs support kitchen gardens and small farms",
    links: [
      {
        label: "Jeevamrut",
        href: "/store",
        reason: "Relevant next step for natural-farming readers.",
      },
      {
        label: "Vermicompost",
        href: "/products/shreem-vermicompost",
        reason: "Pairs naturally with soil-care topics.",
      },
    ],
  },
  {
    keyword: "AI kundli and expert astrologer call",
    angle: "when an AI reading is enough and when a human astrologer review is wiser",
    links: [
      {
        label: "AI Jyotish Credits",
        href: "/products/shreem-ai-jyotish-credits",
        reason: "For customers who want self-service astrology readings.",
      },
      {
        label: "Expert Astrologer Call",
        href: "/products/shreem-expert-jyotish-consultation",
        reason: "For sensitive decisions that deserve human review.",
      },
    ],
  },
]

const pickTopic = (posts) => {
  const usedText = posts
    .slice(0, 12)
    .map((post) => `${post.title} ${post.description} ${post.slug}`)
    .join(" ")
    .toLowerCase()

  return (
    SEO_TOPICS.find((topic) => !usedText.includes(topic.keyword.toLowerCase())) ||
    SEO_TOPICS[posts.length % SEO_TOPICS.length]
  )
}

const buildPrompt = ({ recentTitles, products }) => `
You are writing one SEO-focused blog article for Shreem Cow Products, an Indian desi-cow products site.

Goals:
- Improve organic reach with useful search intent.
- Stay truthful and practical.
- Do not make medical cure claims.
- Use natural keywords around bilona A2 ghee, desi cow ghee, neem dhoop, cow dung cakes, Jeevamrut, vermicompost, natural farming, pooja rituals, Indian homes, and Shreem Farms only where relevant.
- Mention Shreem products naturally, but do not sound like an ad.
- Make the article useful enough for a real customer to read.
- Build topical authority and help a buyer move to a relevant Shreem product page.

Primary keyword and angle:
- Keyword: ${products.topic.keyword}
- Angle: ${products.topic.angle}

Known product/catalog context:
${products.context}

Required internal links to include in relatedLinks:
${products.topic.links.map((link) => `- ${link.label}: ${link.href} — ${link.reason}`).join("\n")}

Avoid repeating these recent titles:
${recentTitles.map((title) => `- ${title}`).join("\n")}

Return only JSON with this shape:
{
  "title": "55-70 character title",
  "slug": "short-url-slug",
  "description": "145-160 character meta description",
  "excerpt": "short blog card excerpt",
  "category": "Shreem Blog",
  "readTime": "5 min read",
  "image": "/shreem-scenes/hero-scene.png",
  "imageAlt": "descriptive alt text",
  "relatedLinks": [
    { "label": "A2 Bilona Ghee", "href": "/products/shreem-a2-bilona-ghee", "reason": "short reason" }
  ],
  "sections": [
    { "heading": "section heading", "body": ["paragraph", "paragraph"] }
  ]
}

Rules:
- Write 4 to 6 sections.
- Each body paragraph should be 70 to 120 words.
- Include one section that answers a common buyer question.
- Include one section that connects the topic to a product page or store action without hard selling.
- Use Indian English and simple language.
- Do not claim backlinks are created.
`

const getGeminiPost = async ({ recentTitles, products }) => {
  const apiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY

  if (!apiKey) {
    throw new Error("GEMINI_API_KEY is missing.")
  }

  const models = Array.from(
    new Set([
      process.env.BLOG_GEMINI_MODEL || process.env.GEMINI_MODEL || "gemini-2.5-flash",
      "gemini-2.5-flash-lite",
      "gemini-2.0-flash",
    ])
  )

  let lastError = null

  for (const model of models) {
    for (let attempt = 1; attempt <= 3; attempt += 1) {
      const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(
          model
        )}:generateContent?key=${encodeURIComponent(apiKey)}`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            contents: [
              {
                role: "user",
                parts: [{ text: buildPrompt({ recentTitles, products }) }],
              },
            ],
            generationConfig: {
              temperature: 0.72,
              maxOutputTokens: 5000,
              responseMimeType: "application/json",
            },
          }),
        }
      )
      const body = await response.json().catch(() => ({}))

      if (response.ok) {
        const text =
          body?.candidates?.[0]?.content?.parts
            ?.map((part) => part.text || "")
            .join("\n") || ""

        return extractJson(text)
      }

      lastError = new Error(
        body?.error?.message || `Gemini request failed with ${response.status}`
      )

      if (![408, 409, 429].includes(response.status) && response.status < 500) {
        throw lastError
      }

      await sleep(900 * attempt)
    }
  }

  throw lastError || new Error("Gemini request failed.")
}

const getOllamaPost = async ({ recentTitles, products }) => {
  const ollamaUrl = process.env.OLLAMA_URL

  if (!ollamaUrl) {
    throw new Error("OLLAMA_URL is missing.")
  }

  const response = await fetch(`${ollamaUrl.replace(/\/+$/, "")}/api/generate`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: process.env.BLOG_OLLAMA_MODEL || process.env.OLLAMA_MODEL || "llama3.1:8b",
      prompt: buildPrompt({ recentTitles, products }),
      stream: false,
      format: "json",
      options: {
        temperature: 0.68,
        num_predict: 5000,
      },
    }),
  })
  const body = await response.json().catch(() => ({}))

  if (!response.ok) {
    throw new Error(body?.error || `Ollama request failed with ${response.status}`)
  }

  return extractJson(body.response || "")
}

const normalizePost = (draft, posts) => {
  const title = String(draft.title || "").trim()
  const baseSlug = slugify(draft.slug || title)

  if (!title || !baseSlug) {
    throw new Error("Generated post is missing title or slug.")
  }

  const existingSlugs = new Set(posts.map((post) => post.slug))
  let slug = baseSlug
  let suffix = 2

  while (existingSlugs.has(slug)) {
    slug = `${baseSlug}-${suffix}`
    suffix += 1
  }

  const sections = Array.isArray(draft.sections)
    ? draft.sections
        .map((section) => ({
          heading: String(section.heading || "").trim(),
          body: Array.isArray(section.body)
            ? section.body.map((item) => String(item || "").trim()).filter(Boolean)
            : [],
        }))
        .filter((section) => section.heading && section.body.length)
    : []

  if (sections.length < 3) {
    throw new Error("Generated post needs at least 3 useful sections.")
  }

  const relatedLinks = Array.isArray(draft.relatedLinks)
    ? draft.relatedLinks
        .map((link) => ({
          label: String(link.label || "").trim(),
          href: String(link.href || "").trim(),
          reason: String(link.reason || "").trim(),
        }))
        .filter((link) => link.label && link.href.startsWith("/"))
        .slice(0, 4)
    : []

  const now = new Date().toISOString()

  return {
    id: `journal_${now.replace(/[^0-9]/g, "")}_${Math.random()
      .toString(16)
      .slice(2, 10)}`,
    slug,
    title,
    description:
      String(draft.description || draft.excerpt || title).trim().slice(0, 170),
    excerpt:
      String(draft.excerpt || draft.description || title).trim().slice(0, 220),
    content: "",
    image: String(draft.image || "/shreem-scenes/hero-scene.png").trim(),
    imageAlt:
      String(draft.imageAlt || draft.image_alt || `${title} article image`).trim(),
    category: String(draft.category || "Shreem Blog").trim(),
    readTime: String(draft.readTime || draft.read_time || "5 min read").trim(),
    status: "published",
    author_name: "Shreem Farms",
    publishedAt: now.slice(0, 10),
    sections,
    relatedLinks,
    created_at: now,
    updated_at: now,
  }
}

const main = async () => {
  const posts = readPosts()
  const recentTitles = posts.slice(0, 10).map((post) => post.title)
  const topic = pickTopic(posts)
  const products = {
    topic,
    context:
      process.env.BLOG_PRODUCT_CONTEXT ||
      "Current Shreem focus: bilona A2 desi cow ghee with traditional slow preparation and gau-kasht finish, neem dhoop for pooja and home fragrance, cow dung cakes for havan/dhooni, Jeevamrut and vermicompost for living soil, and Shreem AI Jyotish credits/expert astrology calls as digital services.",
  }

  let draft
  const preferOllama =
    process.env.BLOG_AI_PROVIDER === "ollama" ||
    process.env.BLOG_USE_OLLAMA === "true"

  if (preferOllama) {
    try {
      draft = await getOllamaPost({ recentTitles, products })
    } catch (error) {
      appendLog("ollama_failed_falling_back", { message: error.message })
      draft = await getGeminiPost({ recentTitles, products })
    }
  } else {
    draft = await getGeminiPost({ recentTitles, products })
  }

  const post = normalizePost(draft, posts)

  savePosts([post, ...posts])
  appendLog("created_blog_post", {
    title: post.title,
    slug: post.slug,
    keyword: topic.keyword,
    file: journalFile,
  })

  console.log(
    JSON.stringify(
      {
        ok: true,
        title: post.title,
        slug: post.slug,
        file: journalFile,
      },
      null,
      2
    )
  )
}

main().catch((error) => {
  appendLog("failed", { message: error.message })
  console.error(error)
  process.exit(1)
})
