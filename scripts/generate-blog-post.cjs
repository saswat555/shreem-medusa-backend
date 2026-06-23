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
const lockFile =
  process.env.BLOG_CRON_LOCK_FILE ||
  path.join(backendRoot, "data", "blog-cron.lock")

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

const withLock = async (fn) => {
  fs.mkdirSync(path.dirname(lockFile), { recursive: true })

  try {
    const existing = fs.existsSync(lockFile)
      ? JSON.parse(fs.readFileSync(lockFile, "utf8"))
      : null
    const createdAt = existing?.createdAt ? new Date(existing.createdAt) : null

    if (
      createdAt &&
      Number.isFinite(createdAt.getTime()) &&
      Date.now() - createdAt.getTime() < 45 * 60 * 1000
    ) {
      appendLog("skipped_locked", { lockFile, createdAt: existing.createdAt })
      console.log(JSON.stringify({ ok: true, skipped: "locked" }, null, 2))
      return
    }
  } catch {
    // Ignore malformed old lock files and replace them below.
  }

  fs.writeFileSync(
    lockFile,
    JSON.stringify({ pid: process.pid, createdAt: new Date().toISOString() })
  )

  try {
    await fn()
  } finally {
    fs.rmSync(lockFile, { force: true })
  }
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
    id: "gau-kasht-bilona-ghee-buyer-guide",
    pillar: "product",
    keyword: "gau kasht bilona ghee",
    angle: "a buyer-first guide explaining why finishing ghee on gau-kasht gives a roasted traditional aroma, how it differs from generic online ghee, and what a careful Indian family should check before buying",
    image: "https://upload.wikimedia.org/wikipedia/commons/6/61/Pure_Ghee.jpg",
    imageQueries: ["pure ghee jar", "traditional ghee India", "ghee cooking"],
    fallbackImages: [
      "https://upload.wikimedia.org/wikipedia/commons/6/61/Pure_Ghee.jpg",
      "https://upload.wikimedia.org/wikipedia/commons/d/db/Desi_ghee.JPG",
      "https://upload.wikimedia.org/wikipedia/commons/6/65/Pure_Ghee-Homemade-Maharashtra.jpg",
      "https://upload.wikimedia.org/wikipedia/commons/e/e6/Offering_of_Ghee_into_Yajna_Agni_-_Howrah_2012-12-16_2088.JPG",
      "https://upload.wikimedia.org/wikipedia/commons/3/38/Ghee_2.jpg",
    ],
    imageAlt: "Pure desi ghee for a gau-kasht bilona ghee buyer guide",
    imageSearchQuery: "gau kasht bilona ghee traditional Indian ghee buyer guide",
    imageSource: "web_wikimedia",
    links: [
      {
        label: "Shreem A2 Bilona Ghee",
        href: "/products/shreem-a2-bilona-ghee",
        reason: "Best product page for customers comparing gau-kasht finished bilona ghee.",
      },
      {
        label: "A2 Bilona Ghee Guide",
        href: "/a2-bilona-ghee",
        reason: "Explains the curd-first bilona method and Shreem process.",
      },
    ],
  },
  {
    id: "a2-ghee-price-quality-checklist",
    pillar: "purity",
    keyword: "A2 bilona ghee price quality checklist",
    angle: "help buyers understand why cheaper ghee and real bilona ghee are not always comparable by checking curd-first method, batch care, aroma, date, packaging, delivery, and trust signals",
    image: "https://upload.wikimedia.org/wikipedia/commons/f/f8/Butterschmalz-3.jpg",
    imageQueries: ["ghee jar", "homemade ghee", "pure ghee"],
    fallbackImages: [
      "https://upload.wikimedia.org/wikipedia/commons/f/f8/Butterschmalz-3.jpg",
      "https://upload.wikimedia.org/wikipedia/commons/1/1b/Ghee_Leila.JPG",
      "https://upload.wikimedia.org/wikipedia/commons/3/38/Ghee_2.jpg",
      "https://upload.wikimedia.org/wikipedia/commons/d/db/Desi_ghee.JPG",
    ],
    imageAlt: "Ghee jar for an A2 bilona ghee price and quality checklist",
    imageSearchQuery: "A2 bilona ghee price quality checklist online India",
    imageSource: "web_wikimedia",
    links: [
      {
        label: "Shreem A2 Bilona Ghee",
        href: "/products/shreem-a2-bilona-ghee",
        reason: "Lets readers inspect the actual product after reading the checklist.",
      },
      {
        label: "Shipping Policy",
        href: "/shipping-policy",
        reason: "Food buyers care about delivery safety and packaging.",
      },
    ],
  },
  {
    id: "a2-ghee-gau-kasht",
    pillar: "product",
    keyword: "A2 bilona ghee cooked on cow dung cakes",
    angle: "how cultured curd, hand churning, and slow gau-kasht finishing change aroma and buyer confidence",
    image: "https://upload.wikimedia.org/wikipedia/commons/d/db/Desi_ghee.JPG",
    imageQueries: ["ghee", "Indian cow", "butter churn", "dairy India"],
    fallbackImages: [
      "https://upload.wikimedia.org/wikipedia/commons/d/db/Desi_ghee.JPG",
      "https://upload.wikimedia.org/wikipedia/commons/f/f8/Butterschmalz-3.jpg",
      "https://upload.wikimedia.org/wikipedia/commons/3/38/Ghee_2.jpg",
      "https://upload.wikimedia.org/wikipedia/commons/1/1b/Ghee_Leila.JPG",
      "https://upload.wikimedia.org/wikipedia/commons/f/f3/Ghee_lamps.JPG",
      "https://upload.wikimedia.org/wikipedia/commons/e/e6/Offering_of_Ghee_into_Yajna_Agni_-_Howrah_2012-12-16_2088.JPG",
      "https://upload.wikimedia.org/wikipedia/commons/6/61/Pure_Ghee.jpg",
      "https://upload.wikimedia.org/wikipedia/commons/6/65/Pure_Ghee-Homemade-Maharashtra.jpg",
      "https://upload.wikimedia.org/wikipedia/commons/6/62/Farmer_in_Tamil_Nadu_1993.JPG",
    ],
    imageAlt: "Golden desi ghee in a glass jar for a traditional bilona ghee article",
    imageSearchQuery: "traditional A2 bilona ghee hand churning desi cow India",
    imageSource: "web_wikimedia",
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
    id: "pure-d2c-no-preservatives",
    pillar: "purity",
    keyword: "pure preservative free D2C food brand India",
    angle: "how a small Indian D2C brand can build trust through short labels, small batches, transparent sourcing, and no preservative positioning",
    image: "https://upload.wikimedia.org/wikipedia/commons/4/41/India_Farming.jpg",
    imageQueries: ["Indian farming food market", "traditional Indian food", "small batch food India"],
    fallbackImages: [
      "https://upload.wikimedia.org/wikipedia/commons/4/41/India_Farming.jpg",
      "https://upload.wikimedia.org/wikipedia/commons/7/74/Food_Fair_%282025%29_11.jpg",
      "https://upload.wikimedia.org/wikipedia/commons/8/87/Indian_food_in_North_Kolkata.jpg",
    ],
    imageAlt: "Indian farm and food context for a pure D2C brand article",
    imageSearchQuery: "pure preservative free D2C Indian food brand small batch",
    imageSource: "web_wikimedia",
    links: [
      {
        label: "A2 Bilona Ghee",
        href: "/products/shreem-a2-bilona-ghee",
        reason: "A flagship preservative-free food product for trust-led buyers.",
      },
      {
        label: "Shop Shreem products",
        href: "/store",
        reason: "Helps readers inspect the wider Shreem catalogue.",
      },
    ],
  },
  {
    id: "read-ghee-label",
    pillar: "purity",
    keyword: "how to read ghee labels before buying online",
    angle: "a practical buyer checklist for ingredient lists, manufacturing dates, storage, aroma, texture, packaging, and brand transparency",
    image: "https://upload.wikimedia.org/wikipedia/commons/6/61/Pure_Ghee.jpg",
    imageQueries: ["ghee label", "pure ghee", "ghee jar"],
    fallbackImages: [
      "https://upload.wikimedia.org/wikipedia/commons/6/61/Pure_Ghee.jpg",
      "https://upload.wikimedia.org/wikipedia/commons/6/65/Pure_Ghee-Homemade-Maharashtra.jpg",
      "https://upload.wikimedia.org/wikipedia/commons/f/f8/Butterschmalz-3.jpg",
    ],
    imageAlt: "Pure ghee jar for a label-reading buyer guide",
    imageSearchQuery: "pure ghee label reading India online buying guide",
    imageSource: "web_wikimedia",
    links: [
      {
        label: "A2 Bilona Ghee",
        href: "/products/shreem-a2-bilona-ghee",
        reason: "Relevant product page after reading the buyer checklist.",
      },
      {
        label: "Shipping Policy",
        href: "/shipping-policy",
        reason: "Delivery and packaging confidence matter for food orders.",
      },
    ],
  },
  {
    id: "neem-dhoop-pooja",
    pillar: "ritual",
    keyword: "natural neem dhoop for pooja and home fragrance",
    angle: "why neem dhoop fits evening rituals without making exaggerated health claims",
    image: "https://upload.wikimedia.org/wikipedia/commons/e/e8/Incense_stick.JPG",
    imageQueries: ["incense India", "pooja diya", "havan India"],
    fallbackImages: [
      "https://upload.wikimedia.org/wikipedia/commons/e/e8/Incense_stick.JPG",
      "https://upload.wikimedia.org/wikipedia/commons/2/21/Incense_in_Vietnam.jpg",
      "https://upload.wikimedia.org/wikipedia/commons/0/01/Pooja_Diya_for_Indian_Wedding.jpg",
      "https://upload.wikimedia.org/wikipedia/commons/e/e2/Diwali_Pooja_Thali_with_Diya_Decoration.jpg",
    ],
    imageAlt: "Burning incense representing natural dhoop for Indian pooja rituals",
    imageSearchQuery: "natural neem dhoop Indian pooja ritual home fragrance",
    imageSource: "web_wikimedia",
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
    id: "living-soil",
    pillar: "farming",
    keyword: "Jeevamrut and vermicompost for natural farming",
    angle: "how living soil inputs support kitchen gardens and small farms",
    image: "https://upload.wikimedia.org/wikipedia/commons/6/68/A_Vermi_compost.JPG",
    imageQueries: ["vermicompost", "organic farming India", "compost soil"],
    fallbackImages: [
      "https://upload.wikimedia.org/wikipedia/commons/6/68/A_Vermi_compost.JPG",
      "https://upload.wikimedia.org/wikipedia/commons/2/2b/Organik-gubre-cesitleri.jpg",
      "https://upload.wikimedia.org/wikipedia/commons/6/61/Sifted_vermicompost_vermicast.png",
      "https://upload.wikimedia.org/wikipedia/commons/f/fd/Organic_farming_uttarakhand.jpg",
    ],
    imageAlt: "Rich vermicompost soil for natural farming and kitchen gardens",
    imageSearchQuery: "vermicompost jeevamrut natural farming living soil India",
    imageSource: "web_wikimedia",
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
    id: "ai-kundli-expert-call",
    pillar: "astrology",
    keyword: "AI kundli and expert astrologer call",
    angle: "when an AI reading is enough and when a human astrologer review is wiser",
    image: "https://upload.wikimedia.org/wikipedia/commons/c/c9/Astrolab.JPG",
    imageQueries: ["astrolabe", "zodiac India", "astronomy instrument"],
    fallbackImages: [
      "https://upload.wikimedia.org/wikipedia/commons/c/c9/Astrolab.JPG",
      "https://upload.wikimedia.org/wikipedia/commons/1/18/Astrolabe-Persian-18C.jpg",
      "https://upload.wikimedia.org/wikipedia/commons/6/6b/Persian_astrolabe.jpg",
      "https://upload.wikimedia.org/wikipedia/commons/c/c7/Iranian_Astrolabe_14.jpg",
    ],
    imageAlt: "Public domain astrolabe image for astrology and kundli guidance",
    imageSearchQuery: "vedic astrology kundli consultation India",
    imageSource: "web_wikimedia",
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
  {
    id: "panchang-muhurat-home",
    pillar: "astrology",
    keyword: "daily panchang and muhurat for Indian households",
    angle: "how families can use tithi, nakshatra, and simple muhurat awareness for planning rituals without fear-based predictions",
    image: "https://upload.wikimedia.org/wikipedia/commons/1/18/Astrolabe-Persian-18C.jpg",
    imageQueries: ["panchang astrology", "astrolabe", "Indian calendar"],
    fallbackImages: [
      "https://upload.wikimedia.org/wikipedia/commons/1/18/Astrolabe-Persian-18C.jpg",
      "https://upload.wikimedia.org/wikipedia/commons/6/6b/Persian_astrolabe.jpg",
      "https://upload.wikimedia.org/wikipedia/commons/c/c9/Astrolab.JPG",
    ],
    imageAlt: "Astrology instrument for a panchang and muhurat article",
    imageSearchQuery: "daily panchang muhurat Indian household astrology",
    imageSource: "web_wikimedia",
    links: [
      {
        label: "AI Jyotish Credits",
        href: "/products/shreem-ai-jyotish-credits",
        reason: "Readers can try self-service panchang and kundli guidance.",
      },
      {
        label: "Expert Astrologer Call",
        href: "/products/shreem-expert-jyotish-consultation",
        reason: "Human review is better for sensitive life decisions.",
      },
    ],
  },
  {
    id: "sade-sati-dasha-calm-guide",
    pillar: "astrology",
    keyword: "Sade Sati and dasha periods explained calmly",
    angle: "a grounded, non-fearful guide to difficult astrology periods, planning, remedies, and when to consult an expert",
    image: "https://upload.wikimedia.org/wikipedia/commons/6/6b/Persian_astrolabe.jpg",
    imageQueries: ["vedic astrology", "astrolabe", "zodiac"],
    fallbackImages: [
      "https://upload.wikimedia.org/wikipedia/commons/6/6b/Persian_astrolabe.jpg",
      "https://upload.wikimedia.org/wikipedia/commons/c/c7/Iranian_Astrolabe_14.jpg",
      "https://upload.wikimedia.org/wikipedia/commons/c/c9/Astrolab.JPG",
    ],
    imageAlt: "Astrolabe image for a calm dasha and Sade Sati guide",
    imageSearchQuery: "Sade Sati dasha period calm Vedic astrology guide",
    imageSource: "web_wikimedia",
    links: [
      {
        label: "AI Jyotish Credits",
        href: "/products/shreem-ai-jyotish-credits",
        reason: "Useful for checking chart periods and follow-up questions.",
      },
      {
        label: "Expert Astrologer Call",
        href: "/products/shreem-expert-jyotish-consultation",
        reason: "Better fit when someone needs personal judgement.",
      },
    ],
  },
]

const decodeXml = (value) =>
  String(value || "")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")

const getIndiaTrends = async () => {
  if (process.env.BLOG_USE_TRENDS === "false") {
    return []
  }

  const url = process.env.BLOG_TRENDS_RSS_URL || "https://trends.google.com/trending/rss?geo=IN"

  try {
    const response = await fetch(url, {
      headers: {
        "User-Agent": "ShreemFarmsSEO/1.0 (trend-aware blog topics)",
      },
    })
    const xml = await response.text()

    return Array.from(xml.matchAll(/<item>[\s\S]*?<title>([\s\S]*?)<\/title>[\s\S]*?<\/item>/g))
      .map((match) => decodeXml(match[1]).trim())
      .filter(Boolean)
      .slice(0, 30)
  } catch (error) {
    appendLog("trends_fetch_failed", { message: error.message })
    return []
  }
}

const inferPillar = (post) => {
  const text = `${post.title || ""} ${post.slug || ""} ${post.description || ""}`.toLowerCase()

  if (/(kundli|jyotish|astrology|panchang|muhurat|sade sati|dasha)/.test(text)) {
    return "astrology"
  }

  if (/(dhoop|pooja|havan|ritual|cow dung cake)/.test(text)) {
    return "ritual"
  }

  if (/(vermicompost|jeevamrut|farming|soil|garden)/.test(text)) {
    return "farming"
  }

  if (/(preservative|pure|label|d2c|quality|trust)/.test(text)) {
    return "purity"
  }

  return "product"
}

const getTrendContext = (trends) => {
  const relevant = trends.find((trend) =>
    /(festival|pooja|vrat|ekadashi|shivratri|navratri|diwali|holi|wedding|muhurat|rashi|kundli|astrology|monsoon|heat|food|milk|ghee|health|organic|farming|soil|plant|ayurveda)/i.test(
      trend
    )
  )

  return relevant || ""
}

const getSeasonalHook = (pillar) => {
  const month = new Date().getMonth() + 1

  if ([6, 7, 8, 9].includes(month)) {
    if (pillar === "product" || pillar === "purity") {
      return "monsoon food storage and preservative-free buying"
    }

    if (pillar === "farming") {
      return "monsoon soil care for kitchen gardens"
    }

    if (pillar === "ritual") {
      return "monsoon evening pooja and home fragrance"
    }
  }

  if ([10, 11].includes(month)) {
    return pillar === "astrology"
      ? "festival muhurat and panchang planning"
      : "festival gifting and pure Indian home essentials"
  }

  if ([1, 2, 3].includes(month)) {
    return pillar === "farming"
      ? "spring kitchen garden preparation"
      : "new year family health and household planning"
  }

  return pillar === "astrology"
    ? "weekly panchang and family planning"
    : "quality-first Indian D2C shopping"
}

const withTrendAngle = (topic, trends) => {
  const trend = getTrendContext(trends) || getSeasonalHook(topic.pillar)

  if (!trend) {
    return topic
  }

  const clone = { ...topic }
  clone.hotTrend = trend
  clone.keyword = `${topic.keyword} ${trend}`.slice(0, 120)
  clone.angle = `${topic.angle}; connect it naturally to the current India search interest around "${trend}" only if the connection is honest and useful`

  return clone
}

const pickTopic = async (posts) => {
  const recentPosts = posts.slice(0, 16)
  const recentPillars = recentPosts.map(inferPillar)
  const recentIds = new Set(
    recentPosts.map((post) => post.topicId || post.metadata?.topicId || slugify(post.slug || post.title))
  )
  const hour = new Date().getHours()
  const lastPillar = recentPillars[0] || ""
  const morning = hour < 12
  const preferredPillars =
    lastPillar === "astrology"
      ? ["purity", "product", "ritual", "farming"]
      : lastPillar
        ? ["astrology", "purity", "product", "ritual", "farming"]
        : morning
          ? ["purity", "product", "farming", "ritual", "astrology"]
          : ["astrology", "ritual", "purity", "product", "farming"]
  const trends = await getIndiaTrends()

  const usedCounts = posts.reduce((acc, post) => {
    const key = post.topicId || post.metadata?.topicId || slugify(post.slug || post.title)
    acc[key] = (acc[key] || 0) + 1
    return acc
  }, {})
  const recentText = recentPosts
    .map((post) => `${post.title || ""} ${post.slug || ""} ${post.description || ""}`)
    .join(" ")
    .toLowerCase()

  const scoreTopic = (topic, pillarRank) => {
    let score = 100 - pillarRank * 8

    if (recentIds.has(topic.id)) {
      score -= 60
    }

    score -= (usedCounts[topic.id] || 0) * 7

    if (topic.id.includes("gau-kasht") || /gau[- ]?kasht|cow dung cakes/.test(topic.keyword)) {
      score += 22
    }

    if (/(gau[- ]?kasht|cow dung cakes|price quality|label)/i.test(topic.keyword)) {
      score += 10
    }

    for (const term of String(topic.keyword).toLowerCase().split(/\s+/)) {
      if (term.length > 4 && recentText.includes(term)) {
        score -= 2
      }
    }

    return score
  }

  const ranked = preferredPillars
    .flatMap((pillar, pillarRank) =>
      SEO_TOPICS.filter((topic) => topic.pillar === pillar).map((topic) => ({
        topic,
        score: scoreTopic(topic, pillarRank),
      }))
    )
    .sort((a, b) => b.score - a.score)

  return withTrendAngle(
    ranked[0]?.topic || SEO_TOPICS[posts.length % SEO_TOPICS.length],
    trends
  )
}

const parseJsonEnv = (key, fallback) => {
  try {
    const raw = process.env[key]
    return raw ? JSON.parse(raw) : fallback
  } catch {
    return fallback
  }
}

const getImageCandidates = (topic) => {
  const configured = parseJsonEnv("BLOG_IMAGE_CANDIDATES_JSON", {})
  const topicCandidates = Array.isArray(configured[topic.keyword])
    ? configured[topic.keyword]
    : []

  return [
    ...topicCandidates,
    ...(topic.fallbackImages || []).map((image, index) => ({
      image,
      imageAlt: topic.imageAlt,
      source: index === 0 ? topic.imageSource || "topic_default" : "web_wikimedia_unique",
    })),
    {
      image: topic.image,
      imageAlt: topic.imageAlt,
      source: topic.imageSource || "topic_default",
    },
  ].filter((candidate) => candidate.image)
}

const imageKey = (value) => String(value || "").trim().split("?")[0]

const searchCommonsImages = async (query) => {
  const url = new URL("https://commons.wikimedia.org/w/api.php")
  url.searchParams.set("action", "query")
  url.searchParams.set("generator", "search")
  url.searchParams.set("gsrsearch", query)
  url.searchParams.set("gsrnamespace", "6")
  url.searchParams.set("gsrlimit", "10")
  url.searchParams.set("prop", "imageinfo")
  url.searchParams.set("iiprop", "url|mime")
  url.searchParams.set("format", "json")
  url.searchParams.set("origin", "*")

  try {
    const response = await fetch(url, {
      headers: {
        "User-Agent": "ShreemFarmsSEO/1.0 (blog cron image search)",
      },
    })
    const body = await response.json()

    return Object.values(body?.query?.pages || {})
      .map((page) => page?.imageinfo?.[0])
      .filter((info) => info?.url && String(info.mime || "").startsWith("image/"))
      .map((info) => info.url)
  } catch {
    return []
  }
}

const getUniqueImageCandidates = async (topic, usedImages) => {
  const candidates = [...getImageCandidates(topic)]

  for (const query of topic.imageQueries || []) {
    const images = await searchCommonsImages(query)
    candidates.push(
      ...images.map((image) => ({
        image,
        imageAlt: topic.imageAlt,
        source: "web_wikimedia_search",
      }))
    )
  }

  const unique = []
  const seen = new Set()

  for (const candidate of candidates) {
    const key = imageKey(candidate.image)

    if (!candidate.image || seen.has(key) || usedImages.has(key)) {
      continue
    }

    seen.add(key)
    unique.push(candidate)
  }

  return unique.length ? unique : candidates
}

const normalizeImage = async (draft, topic, usedImages) => {
  const candidates = await getUniqueImageCandidates(topic, usedImages)
  const requested = String(draft.image || "").trim()
  const unsafeHero = !requested || requested === "/shreem-scenes/hero-scene.png"
  const matched =
    !unsafeHero &&
    !usedImages.has(imageKey(requested)) &&
    candidates.find((candidate) => candidate.image === requested)
  const selected = matched || candidates[0]

  return {
    image: selected.image,
    imageUrl: selected.image,
    imageAlt:
      String(draft.imageAlt || draft.image_alt || selected.imageAlt || topic.imageAlt)
        .trim()
        .slice(0, 180) || `${draft.title || "Shreem Blog"} image`,
    imageSearchQuery:
      String(draft.imageSearchQuery || draft.image_search_query || topic.imageSearchQuery)
        .trim()
        .slice(0, 220),
    imageSource: selected.source || "topic_default",
  }
}

const buildPrompt = ({ recentTitles, products }) => `
You are writing one SEO-focused blog article for Shreem Cow Products, an Indian desi-cow products site.

Goals:
- Improve organic reach with useful search intent.
- Improve click-through by writing a concrete title and meta description that answer why the article is worth opening.
- Stay truthful and practical.
- Do not make medical cure claims.
- Build Shreem's image as a pure D2C India brand focused on quality, transparent sourcing, traditional processes, and no preservatives in food products.
- Use natural keywords around bilona A2 ghee, preservative-free food, desi cow ghee, neem dhoop, cow dung cakes, Jeevamrut, vermicompost, natural farming, pooja rituals, astrology, panchang, kundli, Indian homes, and Shreem Farms only where relevant.
- Mention Shreem products naturally, but do not sound like an ad.
- For Shreem ghee, mention the real differentiator when relevant: curd-first bilona, hand-churned makkhan, slow finishing, and gau-kasht heat.
- Make the article useful enough for a real customer to read.
- Build topical authority and help a buyer move to a relevant Shreem product page.
- Avoid cliche generic introductions like "In today's fast-paced world". Start with a specific buyer concern, seasonal/trending context, or practical Indian household situation.
- If a hot trend is provided, use it only as a timely hook. Do not write unrelated celebrity, cricket, politics, or gossip content.
- For astrology content: stay calm, non-fearful, and practical. Do not predict death, cancer, serious disease, or guaranteed harm.
- For product content: highlight no preservatives, small-batch care, clear labels, traditional quality, and D2C trust without making cure claims.

Primary keyword and angle:
- Keyword: ${products.topic.keyword}
- Angle: ${products.topic.angle}
- Pillar: ${products.topic.pillar}
${products.topic.hotTrend ? `- Current India trend hook: ${products.topic.hotTrend}` : ""}

Known product/catalog context:
${products.context}

Required internal links to include in relatedLinks:
${products.topic.links.map((link) => `- ${link.label}: ${link.href} — ${link.reason}`).join("\n")}

Image candidates you are allowed to use:
${products.imageCandidates
  .map((candidate) => `- ${candidate.image}: ${candidate.imageAlt}`)
  .join("\n")}

Also return imageSearchQuery so an admin can later search/replace the image with a licensed photo. Choose one unique URL from imageCandidates only. Do not invent random remote image URLs. Do not reuse images from recent posts.

Avoid repeating these recent titles:
${recentTitles.map((title) => `- ${title}`).join("\n")}

Return only JSON with this shape:
{
  "title": "48-68 character title with a clear buyer benefit",
  "slug": "short-url-slug",
  "description": "145-160 character meta description",
  "excerpt": "short blog card excerpt",
  "category": "Shreem Blog",
  "readTime": "5 min read",
  "image": "choose one relevant image path from imageCandidates",
  "imageAlt": "descriptive alt text",
  "imageSearchQuery": "search query for a licensed supporting image",
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
- Include one short practical checklist or decision guide.
- Use one H2/section that contains either "How to choose", "What to check", "Why it matters", or a direct buyer question.
- Use Indian English and simple language.
- Do not claim backlinks are created.
- Do not use /shreem-scenes/hero-scene.png unless every topic image candidate is missing.
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
    ])
  ).filter((model) => model !== "gemini-2.0-flash")

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

const getTemplatePost = ({ products }) => {
  const topic = products.topic
  const title =
    /gau[- ]?kasht|cow dung cakes/i.test(topic.keyword)
      ? "Gau-Kasht Bilona Ghee: What Careful Buyers Should Check"
      : /price quality|label/i.test(topic.keyword)
        ? "A2 Bilona Ghee Price: What Quality Buyers Should Check"
        : topic.pillar === "astrology"
      ? "A Calm Indian Guide to Panchang, Kundli, and Better Timing"
      : topic.pillar === "purity"
        ? "How Pure D2C Food Brands Build Trust Without Preservatives"
        : topic.pillar === "farming"
          ? "Living Soil at Home: Jeevamrut, Vermicompost, and Better Gardens"
          : topic.pillar === "ritual"
            ? "Natural Pooja Essentials for Cleaner Daily Rituals"
            : "Pure Indian Products: What Quality-Conscious Families Should Check"
  const trendLine = topic.hotTrend
    ? ` A current search spike around ${topic.hotTrend} makes this a good moment to answer the question with care.`
    : ""

  return {
    title,
    slug: slugify(`${title}-${new Date().toISOString().slice(0, 10)}`),
    description:
      "A practical Shreem guide for Indian families seeking pure, transparent, preservative-free products and calm traditional guidance.",
    excerpt:
      "A practical guide from Shreem on quality, trust, and better everyday choices for Indian homes.",
    category: topic.pillar === "astrology" ? "Shreem Jyotish" : "Shreem Blog",
    readTime: "5 min read",
    image: products.imageCandidates?.[0]?.image || topic.image,
    imageAlt: topic.imageAlt,
    imageSearchQuery: topic.imageSearchQuery,
    relatedLinks: topic.links,
    sections: [
      {
        heading: "Why this matters now",
        body: [
          `Indian customers are becoming more careful about what they bring into the kitchen, pooja room, and family routine.${trendLine} At Shreem, the answer is not loud marketing. It is a slower D2C approach: clearer product information, traditional processes where they matter, no unnecessary preservatives in food products, and enough context for a customer to decide with confidence.`,
        ],
      },
      {
        heading: "The Shreem quality lens",
        body: [
          "A good product page should help a buyer understand ingredients, use, storage, delivery, and the reason behind the price. This is especially important for ghee, dhoop, cow dung cakes, vermicompost, Jeevamrut, and astrology services because people are not buying only a commodity. They are buying trust, tradition, and support for a specific family or household need.",
        ],
      },
      {
        heading: "A simple checklist",
        body: [
          "Before buying, check the ingredient list, product use case, manufacturing freshness, packaging clarity, delivery promise, and whether the brand is easy to contact. For astrology, check whether the guidance is calm, transparent, and suitable for the seriousness of the question. AI can help with quick direction, while sensitive life decisions deserve expert human review.",
        ],
      },
      {
        heading: "Where Shreem fits",
        body: [
          "Shreem is building a pure Indian D2C brand around products and guidance that fit real homes: traditional ghee, natural ritual essentials, soil-care inputs, and Jyotish help. The goal is not to push every customer to buy everything, but to make each next step clear enough that the right customer feels safe moving forward.",
        ],
      },
    ],
  }
}

const normalizePost = async (draft, posts, topic) => {
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
  const usedImages = new Set(
    posts.map((post) => imageKey(post.imageUrl || post.image)).filter(Boolean)
  )
  const image = await normalizeImage(draft, topic, usedImages)

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
    image: image.image,
    imageUrl: image.imageUrl,
    imageAlt: image.imageAlt,
    imageSearchQuery: image.imageSearchQuery,
    imageSource: image.imageSource,
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
  const topic = await pickTopic(posts)
  const products = {
    topic,
    imageCandidates: await getUniqueImageCandidates(
      topic,
      new Set(posts.map((post) => imageKey(post.imageUrl || post.image)).filter(Boolean))
    ),
    context:
      process.env.BLOG_PRODUCT_CONTEXT ||
      "Current Shreem focus: bilona A2 desi cow ghee with traditional slow preparation and gau-kasht finish, neem dhoop for pooja and home fragrance, cow dung cakes for havan/dhooni, Jeevamrut and vermicompost for living soil, and Shreem AI Jyotish credits/expert astrology calls as digital services.",
  }

  let draft
  const preferOllama =
    process.env.BLOG_AI_PROVIDER === "ollama" ||
    process.env.BLOG_USE_OLLAMA === "true"

  if (process.env.BLOG_AI_PROVIDER === "template") {
    draft = getTemplatePost({ products })
  } else if (preferOllama) {
    try {
      draft = await getOllamaPost({ recentTitles, products })
    } catch (error) {
      appendLog("ollama_failed_falling_back", { message: error.message })
      try {
        draft = await getGeminiPost({ recentTitles, products })
      } catch (geminiError) {
        appendLog("gemini_failed_using_template", { message: geminiError.message })
        draft = getTemplatePost({ products })
      }
    }
  } else {
    try {
      draft = await getGeminiPost({ recentTitles, products })
    } catch (error) {
      appendLog("gemini_failed_falling_back", { message: error.message })

      try {
        draft = await getOllamaPost({ recentTitles, products })
      } catch (ollamaError) {
        appendLog("ollama_failed_using_template", { message: ollamaError.message })
        draft = getTemplatePost({ products })
      }
    }
  }

  const post = await normalizePost(draft, posts, topic)
  post.topicId = topic.id
  post.pillar = topic.pillar
  post.hotTrend = topic.hotTrend || ""

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

withLock(main).catch((error) => {
  appendLog("failed", { message: error.message })
  console.error(error)
  process.exit(1)
})
