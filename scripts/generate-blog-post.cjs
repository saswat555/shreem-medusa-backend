#!/usr/bin/env node

const fs = require("node:fs")
const path = require("node:path")
const sharp = require("sharp")

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

const escapeSvg = (value) =>
  String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")

const splitTitleLines = (value) => {
  const words = String(value || "Shreem Farms")
    .replace(/\s+/g, " ")
    .trim()
    .split(" ")
  const lines = []
  let current = ""

  for (const word of words) {
    const next = current ? `${current} ${word}` : word

    if (next.length > 28 && current) {
      lines.push(current)
      current = word
    } else {
      current = next
    }

    if (lines.length === 3) {
      break
    }
  }

  if (current && lines.length < 4) {
    lines.push(current)
  }

  return lines.slice(0, 4)
}

const topicPalette = (topic) => {
  const text = `${topic?.pillar || ""} ${topic?.keyword || ""}`.toLowerCase()

  if (/astrology|kundli|panchang|jyotish|muhurat/.test(text)) {
    return { from: "#172554", to: "#8b5cf6", accent: "#facc15", motif: "Jyotish" }
  }

  if (/dhoop|havan|cow dung|gau|pooja|ritual/.test(text)) {
    return { from: "#3b1d0b", to: "#d97706", accent: "#fde68a", motif: "Ritual" }
  }

  if (/atta|arhar|ghee|food|purity|d2c|preservative/.test(text)) {
    return { from: "#123524", to: "#d4a126", accent: "#fff7ed", motif: "Pure Food" }
  }

  return { from: "#174137", to: "#65a30d", accent: "#ecfccb", motif: "Natural Farming" }
}

const createLocalBlogImage = async ({ slug, title, topic }) => {
  const safeSlug = slugify(slug || title).slice(0, 110) || `post-${Date.now()}`
  const outputDirs = [
    path.join(workspaceRoot, "persistent", "static", "blog-images"),
    path.join(workspaceRoot, "shreem-storefront", "public", "blog-images"),
    path.join(workspaceRoot, "shreem-storefront", "public", "static", "blog-images"),
  ]
  const fileName = `${safeSlug}.webp`
  const palette = topicPalette(topic)
  const lines = splitTitleLines(title)
  const lineSvg = lines
    .map(
      (line, index) =>
        `<text x="88" y="${300 + index * 72}" font-size="${
          index === 0 ? 54 : 48
        }" font-weight="800" fill="#fffaf0">${escapeSvg(line)}</text>`
    )
    .join("")
  const svg = `
<svg width="1200" height="675" viewBox="0 0 1200 675" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="bg" x1="0" x2="1" y1="0" y2="1">
      <stop offset="0%" stop-color="${palette.from}"/>
      <stop offset="100%" stop-color="${palette.to}"/>
    </linearGradient>
    <radialGradient id="glow" cx="78%" cy="20%" r="55%">
      <stop offset="0%" stop-color="${palette.accent}" stop-opacity="0.42"/>
      <stop offset="100%" stop-color="${palette.accent}" stop-opacity="0"/>
    </radialGradient>
  </defs>
  <rect width="1200" height="675" fill="url(#bg)"/>
  <rect width="1200" height="675" fill="url(#glow)"/>
  <circle cx="990" cy="160" r="112" fill="none" stroke="${palette.accent}" stroke-width="5" opacity="0.5"/>
  <circle cx="990" cy="160" r="58" fill="none" stroke="${palette.accent}" stroke-width="3" opacity="0.42"/>
  <path d="M100 560 C250 500 380 600 540 540 C700 480 835 535 1100 470" fill="none" stroke="${palette.accent}" stroke-width="8" opacity="0.32"/>
  <text x="88" y="108" font-size="30" font-weight="800" letter-spacing="7" fill="${palette.accent}">SHREEM FARMS</text>
  <text x="88" y="158" font-size="24" font-weight="700" fill="#fffaf0" opacity="0.82">${escapeSvg(palette.motif)}</text>
  ${lineSvg}
  <text x="88" y="610" font-size="24" font-weight="700" fill="#fffaf0" opacity="0.82">Pure D2C India · No-preservative mindset · Practical guidance</text>
</svg>`

  for (const outputDir of outputDirs) {
    fs.mkdirSync(outputDir, { recursive: true })
    await sharp(Buffer.from(svg)).webp({ quality: 88 }).toFile(path.join(outputDir, fileName))
  }

  return `/static/blog-images/${fileName}`
}

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

const SAFE_REMOTE_IMAGE_EXTENSIONS = /\.(jpe?g|png|webp|gif)(\?|$)/i
const UNSAFE_REMOTE_IMAGE_EXTENSIONS = /\.(avif|bmp|djvu|heic|html?|ico|pdf|svg|tif|tiff|txt|xml)(\?|$)/i
const checkedRemoteImages = new Map()
const fetchWithTimeout = async (url, options = {}, timeoutMs = 2000) => {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), timeoutMs)

  try {
    return await fetch(url, { ...options, signal: controller.signal })
  } finally {
    clearTimeout(timeout)
  }
}

const PRODUCT_FOCUS = {
  a2Ghee: {
    name: "Shreem A2 Bilona Ghee",
    href: "/products/shreem-a2-bilona-ghee",
    handle: "shreem-a2-bilona-ghee",
    category: "food",
    keywords:
      "A2 bilona ghee, desi cow ghee, gau-kasht finished ghee, curd-first bilona, no preservatives",
    promise:
      "curd-first bilona ghee, hand-churned makkhan, slow finishing, gau-kasht heat, small-batch D2C trust, no preservatives",
  },
  blackWheatAtta: {
    name: "Black Wheat Atta",
    href: "/products/black-wheat-flour",
    handle: "black-wheat-flour",
    category: "food",
    keywords:
      "black wheat atta, shreem atta, black wheat flour, organic atta from farm, atta for Indian rotis",
    promise:
      "farm-sourced black wheat atta for Indian rotis, simple daily cooking, no maida, no preservatives, clean D2C packing",
  },
  desiArhar: {
    name: "Organic Desi Arhar Dal",
    href: "/products/organic-desi-arhar",
    handle: "organic-desi-arhar",
    category: "food",
    keywords:
      "desi arhar dal, toor dal, organic arhar, farm sourced dal, dal for Indian homes",
    promise:
      "farm-sourced desi arhar/toor dal for dal, khichdi and daily Indian cooking, packed with care and no preservative positioning",
  },
  bananaPlants: {
    name: "Banana Plants",
    href: "/store",
    handle: "banana-plants",
    category: "farming",
    keywords:
      "banana plants, live plants nursery, banana saplings India, farm nursery plants",
    promise:
      "live plant and nursery guidance for Indian homes and farms, practical handling, local suitability, and honest care expectations",
  },
  neemDhoop: {
    name: "Organic Neem Dhoop",
    href: "/products/organic-neem-dhoob",
    handle: "organic-neem-dhoob",
    category: "ritual",
    keywords:
      "natural neem dhoop, pooja dhoop, home fragrance, evening ritual, chemical-conscious pooja",
    promise:
      "natural ritual fragrance for daily pooja, calm home atmosphere, transparent ingredients, no exaggerated health claims",
  },
  cowDungCake: {
    name: "Cow Dung Cakes",
    href: "/products/cowdung-cake",
    handle: "cowdung-cake",
    category: "ritual",
    keywords:
      "cow dung cakes, havan samagri, dhooni, gau kasht, natural ritual fuel",
    promise:
      "sun-dried cow dung cakes for havan, dhooni and traditional ritual use, with safe-use guidance",
  },
  vermicompost: {
    name: "Shreem Vermicompost",
    href: "/products/shreem-vermicompost",
    handle: "shreem-vermicompost",
    category: "farming",
    keywords:
      "vermicompost, living soil, kitchen garden compost, natural farming input",
    promise:
      "soil-focused organic input for kitchen gardens and small farms, practical use guidance, no miracle claims",
  },
  jeevamrut: {
    name: "Jeevamrut",
    href: "/store",
    handle: "jeevamrut",
    category: "farming",
    keywords:
      "Jeevamrut, natural farming liquid input, living soil, Indian farming",
    promise:
      "traditional natural-farming input for soil life and home gardens, explained with practical use and storage care",
  },
  aiJyotishCredits: {
    name: "Shreem AI Jyotish Credits",
    href: "/products/shreem-ai-jyotish-credits",
    handle: "shreem-ai-jyotish-credits",
    category: "astrology",
    keywords:
      "AI kundli, Jyotish credits, Vedic astrology reading, panchang, dasha",
    promise:
      "self-service Jyotish guidance for calm chart reading, question answering and timing checks",
  },
  expertAstrologerCall: {
    name: "Expert Astrologer Call",
    href: "/products/shreem-expert-jyotish-consultation",
    handle: "shreem-expert-jyotish-consultation",
    category: "astrology",
    keywords:
      "expert astrologer call, Jyotish consultation, human review, kundli guidance",
    promise:
      "human astrologer review for sensitive decisions where AI-only guidance is not enough",
  },
}

const productLink = (product, reason) => ({
  label: product.name,
  href: product.href,
  reason,
})

const buildProductContext = (topic) => {
  const product = topic.primaryProduct || PRODUCT_FOCUS.a2Ghee
  const configured = process.env.BLOG_PRODUCT_CONTEXT

  if (configured) {
    return `${configured}\n\nCurrent article focus: ${product.name} (${product.href}). Keep this article centered on this one product/service: ${product.promise}.`
  }

  return [
    `Current article focus: ${product.name}`,
    `Product URL: ${product.href}`,
    `Product category: ${product.category}`,
    `Important keywords: ${product.keywords}`,
    `Truths to use: ${product.promise}`,
    "Other Shreem products exist, but this article should not become a mixed catalogue post.",
  ].join("\n")
}

const SEO_TOPICS = [
  {
    id: "gau-kasht-bilona-ghee-buyer-guide",
    pillar: "product",
    primaryProduct: PRODUCT_FOCUS.a2Ghee,
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
      productLink(
        PRODUCT_FOCUS.a2Ghee,
        "Best product page for customers comparing gau-kasht finished bilona ghee."
      ),
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
    primaryProduct: PRODUCT_FOCUS.a2Ghee,
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
      productLink(
        PRODUCT_FOCUS.a2Ghee,
        "Lets readers inspect the actual product after reading the checklist."
      ),
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
    primaryProduct: PRODUCT_FOCUS.a2Ghee,
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
      productLink(
        PRODUCT_FOCUS.a2Ghee,
        "Best next page for readers comparing traditional ghee options."
      ),
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
    primaryProduct: PRODUCT_FOCUS.a2Ghee,
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
      productLink(
        PRODUCT_FOCUS.a2Ghee,
        "A flagship preservative-free food product for trust-led buyers."
      ),
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
    primaryProduct: PRODUCT_FOCUS.a2Ghee,
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
      productLink(
        PRODUCT_FOCUS.a2Ghee,
        "Relevant product page after reading the buyer checklist."
      ),
      {
        label: "Shipping Policy",
        href: "/shipping-policy",
        reason: "Delivery and packaging confidence matter for food orders.",
      },
    ],
  },
  {
    id: "black-wheat-atta-benefits-india",
    pillar: "product",
    primaryProduct: PRODUCT_FOCUS.blackWheatAtta,
    keyword: "black wheat atta benefits India",
    angle:
      "a practical Indian-family guide to why black wheat atta is becoming popular, how to use it for roti and paratha, and what to check before buying farm-sourced atta online",
    image: "https://upload.wikimedia.org/wikipedia/commons/6/6f/Wheat_flour.jpg",
    imageQueries: ["wheat flour India", "atta roti", "whole wheat flour"],
    fallbackImages: [
      "https://upload.wikimedia.org/wikipedia/commons/6/6f/Wheat_flour.jpg",
      "https://upload.wikimedia.org/wikipedia/commons/5/50/Wheat_flour.jpg",
      "https://upload.wikimedia.org/wikipedia/commons/7/77/Chapatis_on_griddle.jpg",
    ],
    imageAlt: "Wheat flour and roti context for black wheat atta benefits",
    imageSearchQuery: "black wheat atta benefits India roti flour",
    imageSource: "web_wikimedia",
    links: [
      productLink(
        PRODUCT_FOCUS.blackWheatAtta,
        "Best product page for readers searching for Shreem atta or black wheat atta."
      ),
    ],
  },
  {
    id: "black-wheat-atta-vs-normal-atta",
    pillar: "purity",
    primaryProduct: PRODUCT_FOCUS.blackWheatAtta,
    keyword: "black wheat atta vs normal atta",
    angle:
      "help buyers compare black wheat atta and regular atta through taste, color, roti use, family adoption, storage and clean-label buying without making disease-cure claims",
    image: "https://upload.wikimedia.org/wikipedia/commons/7/77/Chapatis_on_griddle.jpg",
    imageQueries: ["chapati atta India", "roti flour", "wheat flour bowl"],
    fallbackImages: [
      "https://upload.wikimedia.org/wikipedia/commons/7/77/Chapatis_on_griddle.jpg",
      "https://upload.wikimedia.org/wikipedia/commons/6/6f/Wheat_flour.jpg",
      "https://upload.wikimedia.org/wikipedia/commons/1/11/Roti_with_ghee.jpg",
    ],
    imageAlt: "Chapati on tawa for black wheat atta comparison article",
    imageSearchQuery: "black wheat atta vs normal atta India roti",
    imageSource: "web_wikimedia",
    links: [
      productLink(
        PRODUCT_FOCUS.blackWheatAtta,
        "Relevant next step for families comparing atta options."
      ),
    ],
  },
  {
    id: "desi-arhar-dal-farm-sourced",
    pillar: "product",
    primaryProduct: PRODUCT_FOCUS.desiArhar,
    keyword: "desi arhar dal farm sourced",
    angle:
      "why farm-sourced desi arhar/toor dal tastes different in dal, khichdi and home cooking, and what Indian families should check before buying online",
    image: "https://upload.wikimedia.org/wikipedia/commons/0/0b/Pigeon_pea_%28Cajanus_cajan%29.jpg",
    imageQueries: ["toor dal", "arhar dal India", "pigeon pea dal"],
    fallbackImages: [
      "https://upload.wikimedia.org/wikipedia/commons/0/0b/Pigeon_pea_%28Cajanus_cajan%29.jpg",
      "https://upload.wikimedia.org/wikipedia/commons/7/78/Toor_dal.jpg",
      "https://upload.wikimedia.org/wikipedia/commons/5/5c/Pigeon_peas.jpg",
    ],
    imageAlt: "Pigeon pea and toor dal for desi arhar dal article",
    imageSearchQuery: "desi arhar dal farm sourced toor dal India",
    imageSource: "web_wikimedia",
    links: [
      productLink(
        PRODUCT_FOCUS.desiArhar,
        "Best product page for readers looking for farm-sourced arhar dal."
      ),
    ],
  },
  {
    id: "neem-dhoop-pooja",
    pillar: "ritual",
    primaryProduct: PRODUCT_FOCUS.neemDhoop,
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
      productLink(
        PRODUCT_FOCUS.neemDhoop,
        "Helpful for readers looking for a simple pooja dhoop option."
      ),
    ],
  },
  {
    id: "banana-plants-home-farm-nursery",
    pillar: "farming",
    primaryProduct: PRODUCT_FOCUS.bananaPlants,
    keyword: "banana plants for home garden and farm",
    angle:
      "a practical buyer guide for banana plants and saplings, covering climate, pot or field use, watering, delivery care and what to ask before buying live plants",
    image: "https://upload.wikimedia.org/wikipedia/commons/4/4c/Banana_tree_with_fruits.jpg",
    imageQueries: ["banana plant India", "banana sapling", "banana tree garden"],
    fallbackImages: [
      "https://upload.wikimedia.org/wikipedia/commons/4/4c/Banana_tree_with_fruits.jpg",
      "https://upload.wikimedia.org/wikipedia/commons/8/8a/Banana_plant.jpg",
      "https://upload.wikimedia.org/wikipedia/commons/9/9b/Banana_tree.jpg",
    ],
    imageAlt: "Banana plant with leaves for live plant nursery guide",
    imageSearchQuery: "banana plants saplings India nursery home garden",
    imageSource: "web_wikimedia",
    links: [
      productLink(
        PRODUCT_FOCUS.bananaPlants,
        "Best next step for customers asking about live plants and nursery availability."
      ),
    ],
  },
  {
    id: "cow-dung-cakes-havan-dhooni",
    pillar: "ritual",
    primaryProduct: PRODUCT_FOCUS.cowDungCake,
    keyword: "cow dung cakes for havan and dhooni",
    angle:
      "a practical safety-first guide to using sun-dried cow dung cakes for havan, dhooni and traditional Indian rituals without mixing the article with dhoop or ghee",
    image: "https://upload.wikimedia.org/wikipedia/commons/a/a2/Cow_dung_cakes_in_India.jpg",
    imageQueries: ["cow dung cakes India", "havan fire India", "rural cow dung cakes"],
    fallbackImages: [
      "https://upload.wikimedia.org/wikipedia/commons/a/a2/Cow_dung_cakes_in_India.jpg",
      "https://upload.wikimedia.org/wikipedia/commons/e/e6/Offering_of_Ghee_into_Yajna_Agni_-_Howrah_2012-12-16_2088.JPG",
      "https://upload.wikimedia.org/wikipedia/commons/7/72/Indian_village_cow_dung_cakes.jpg",
    ],
    imageAlt: "Sun dried cow dung cakes used for traditional Indian ritual fire",
    imageSearchQuery: "cow dung cakes havan dhooni ritual India",
    imageSource: "web_wikimedia",
    links: [
      productLink(
        PRODUCT_FOCUS.cowDungCake,
        "Best next page for readers who need cow dung cakes for havan or dhooni."
      ),
    ],
  },
  {
    id: "living-soil",
    pillar: "farming",
    primaryProduct: PRODUCT_FOCUS.vermicompost,
    keyword: "vermicompost for kitchen garden soil",
    angle:
      "how vermicompost supports living soil in kitchen gardens and small farms, without giving equal attention to Jeevamrut or other soil inputs",
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
      productLink(
        PRODUCT_FOCUS.vermicompost,
        "Best product page for readers looking for compost-based soil improvement."
      ),
    ],
  },
  {
    id: "jeevamrut-natural-farming",
    pillar: "farming",
    primaryProduct: PRODUCT_FOCUS.jeevamrut,
    keyword: "Jeevamrut for natural farming and kitchen gardens",
    angle:
      "how Jeevamrut is used as one focused natural-farming input for living soil, with practical storage and use guidance for Indian homes and small farms",
    image: "https://upload.wikimedia.org/wikipedia/commons/f/fd/Organic_farming_uttarakhand.jpg",
    imageQueries: ["natural farming India", "organic farming India soil", "Indian kitchen garden"],
    fallbackImages: [
      "https://upload.wikimedia.org/wikipedia/commons/f/fd/Organic_farming_uttarakhand.jpg",
      "https://upload.wikimedia.org/wikipedia/commons/4/41/India_Farming.jpg",
      "https://upload.wikimedia.org/wikipedia/commons/3/3c/Organic_farming_in_India.jpg",
    ],
    imageAlt: "Natural farming field representing Jeevamrut and living soil",
    imageSearchQuery: "Jeevamrut natural farming kitchen garden India",
    imageSource: "web_wikimedia",
    links: [
      productLink(
        PRODUCT_FOCUS.jeevamrut,
        "Best next step for readers interested in Jeevamrut availability."
      ),
    ],
  },
  {
    id: "ai-kundli-expert-call",
    pillar: "astrology",
    primaryProduct: PRODUCT_FOCUS.aiJyotishCredits,
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
      productLink(
        PRODUCT_FOCUS.aiJyotishCredits,
        "For customers who want self-service astrology readings."
      ),
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
    primaryProduct: PRODUCT_FOCUS.aiJyotishCredits,
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
      productLink(
        PRODUCT_FOCUS.aiJyotishCredits,
        "Readers can try self-service panchang and kundli guidance."
      ),
      {
        label: "Expert Astrologer Call",
        href: "/products/shreem-expert-jyotish-consultation",
        reason: "Human review is better for sensitive life decisions.",
      },
    ],
  },
  {
    id: "prashna-kundli-meaning-use",
    pillar: "astrology",
    primaryProduct: PRODUCT_FOCUS.aiJyotishCredits,
    keyword: "Prashna Kundli kya hoti hai",
    angle:
      "a simple Hindi/Hinglish guide to Prashna Kundli, when to ask a question, why time and place matter, and when self-service AI Jyotish is enough",
    image: "https://upload.wikimedia.org/wikipedia/commons/c/c9/Astrolab.JPG",
    imageQueries: ["vedic astrology kundli India", "astrolabe astrology", "Indian astrology chart"],
    fallbackImages: [
      "https://upload.wikimedia.org/wikipedia/commons/c/c9/Astrolab.JPG",
      "https://upload.wikimedia.org/wikipedia/commons/1/18/Astrolabe-Persian-18C.jpg",
      "https://upload.wikimedia.org/wikipedia/commons/6/6b/Persian_astrolabe.jpg",
    ],
    imageAlt: "Astrolabe for Prashna Kundli and online Jyotish guidance",
    imageSearchQuery: "Prashna Kundli kya hoti hai online Jyotish India",
    imageSource: "web_wikimedia",
    links: [
      productLink(
        PRODUCT_FOCUS.aiJyotishCredits,
        "Readers can try Prashna Kundli and self-service Kundli guidance."
      ),
    ],
  },
  {
    id: "kaal-sarp-yog-upay-calm-guide",
    pillar: "astrology",
    primaryProduct: PRODUCT_FOCUS.expertAstrologerCall,
    keyword: "Kaal Sarp Yog upay",
    angle:
      "a calm traditional guide to what Kaal Sarp Yog means, why chart verification matters, and why remedies should be chosen after expert review instead of fear",
    image: "https://upload.wikimedia.org/wikipedia/commons/6/6b/Persian_astrolabe.jpg",
    imageQueries: ["vedic astrology remedies", "kundli consultation India", "astrolabe"],
    fallbackImages: [
      "https://upload.wikimedia.org/wikipedia/commons/6/6b/Persian_astrolabe.jpg",
      "https://upload.wikimedia.org/wikipedia/commons/c/c7/Iranian_Astrolabe_14.jpg",
      "https://upload.wikimedia.org/wikipedia/commons/c/c9/Astrolab.JPG",
    ],
    imageAlt: "Astrology instrument for a Kaal Sarp Yog remedy guide",
    imageSearchQuery: "Kaal Sarp Yog upay expert Jyotish consultation",
    imageSource: "web_wikimedia",
    links: [
      productLink(
        PRODUCT_FOCUS.expertAstrologerCall,
        "Best fit for sensitive yog and remedy questions that deserve human review."
      ),
    ],
  },
  {
    id: "grah-shanti-puja-guide",
    pillar: "astrology",
    primaryProduct: PRODUCT_FOCUS.expertAstrologerCall,
    keyword: "Grah Shanti Puja guide",
    angle:
      "when families traditionally consider Grah Shanti Puja, how to avoid fear-based decisions, and why remedies should match the actual Kundli",
    image: "https://upload.wikimedia.org/wikipedia/commons/e/e6/Offering_of_Ghee_into_Yajna_Agni_-_Howrah_2012-12-16_2088.JPG",
    imageQueries: ["havan India", "grah shanti puja", "vedic puja fire"],
    fallbackImages: [
      "https://upload.wikimedia.org/wikipedia/commons/e/e6/Offering_of_Ghee_into_Yajna_Agni_-_Howrah_2012-12-16_2088.JPG",
      "https://upload.wikimedia.org/wikipedia/commons/0/01/Pooja_Diya_for_Indian_Wedding.jpg",
      "https://upload.wikimedia.org/wikipedia/commons/e/e2/Diwali_Pooja_Thali_with_Diya_Decoration.jpg",
    ],
    imageAlt: "Havan fire for Grah Shanti Puja guide",
    imageSearchQuery: "Grah Shanti Puja guide Kundli remedy India",
    imageSource: "web_wikimedia",
    links: [
      productLink(
        PRODUCT_FOCUS.expertAstrologerCall,
        "Human Jyotish review is appropriate before deciding personal remedies."
      ),
    ],
  },
  {
    id: "sade-sati-dasha-calm-guide",
    pillar: "astrology",
    primaryProduct: PRODUCT_FOCUS.expertAstrologerCall,
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
      productLink(
        PRODUCT_FOCUS.expertAstrologerCall,
        "Better fit when someone needs personal judgement around a difficult period."
      ),
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
  clone.angle = `${topic.angle}; connect it naturally to the current India search interest around "${trend}" only if the connection is honest and useful`
  clone.primaryProduct = topic.primaryProduct

  return clone
}

const pickTopic = async (posts) => {
  const recentPosts = posts.slice(0, 16)
  const recentPillars = recentPosts.map(inferPillar)
  const recentProducts = recentPosts
    .map((post) => post.focusedProduct?.handle || post.primaryProduct?.handle || post.metadata?.focusedProduct?.handle)
    .filter(Boolean)
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
    const productHandle = topic.primaryProduct?.handle || ""

    if (recentIds.has(topic.id)) {
      score -= 60
    }

    score -= (usedCounts[topic.id] || 0) * 7

    if (productHandle && recentProducts.slice(0, 3).includes(productHandle)) {
      score -= 42
    }

    if (productHandle && recentProducts.slice(0, 8).includes(productHandle)) {
      score -= 16
    }

    if (topic.id.includes("gau-kasht") || /gau[- ]?kasht|cow dung cakes/.test(topic.keyword)) {
      score += 22
    }

    if (/(gau[- ]?kasht|cow dung cakes|price quality|label)/i.test(topic.keyword)) {
      score += 10
    }

    if (/(cow dung cakes|cow dung cake|gobar|dhooni)/i.test(topic.keyword)) {
      score += 24
    }

    if (/(black wheat|shreem atta|atta)/i.test(topic.keyword)) {
      score += 18
    }

    if (/(shreem astrology|ai kundli|prashna|panchang|muhurat)/i.test(topic.keyword)) {
      score += 16
    }

    if (/(desi arhar|toor dal|arhar dal|neem dhoop|gau kasht)/i.test(topic.keyword)) {
      score += 14
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

const isRenderableImageUrl = (value) => {
  const image = String(value || "").trim().split("?")[0].toLowerCase()

  if (!image) {
    return false
  }

  if (UNSAFE_REMOTE_IMAGE_EXTENSIONS.test(image)) {
    return false
  }

  return SAFE_REMOTE_IMAGE_EXTENSIONS.test(image)
}

const verifyRemoteImage = async (value) => {
  const image = String(value || "").trim()

  if (!/^https?:\/\//i.test(image) || !isRenderableImageUrl(image)) {
    return false
  }

  if (/^https:\/\/upload\.wikimedia\.org\//i.test(image)) {
    return true
  }

  const key = imageKey(image)

  if (checkedRemoteImages.has(key)) {
    return checkedRemoteImages.get(key)
  }

  try {
    const response = await fetchWithTimeout(image, {
      method: "HEAD",
      redirect: "follow",
      headers: {
        "User-Agent": "ShreemFarmsSEO/1.0 (blog cron image validation)",
      },
    })
    const contentType = response.headers.get("content-type") || ""
    const ok =
      response.ok &&
      /^image\/(jpeg|jpg|png|webp|gif)/i.test(contentType)
    checkedRemoteImages.set(key, ok)
    return ok
  } catch {
    checkedRemoteImages.set(key, false)
    return false
  }
}

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
    const response = await fetchWithTimeout(url, {
      headers: {
        "User-Agent": "ShreemFarmsSEO/1.0 (blog cron image search)",
      },
    }, 7000)
    const body = await response.json()

    return Object.values(body?.query?.pages || {})
      .map((page) => page?.imageinfo?.[0])
      .filter((info) =>
        /^image\/(jpeg|jpg|png|webp|gif)/i.test(String(info?.mime || ""))
      )
    .map((info) => info.url)
    .filter(isRenderableImageUrl)
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

    if (
      !candidate.image ||
      !isRenderableImageUrl(candidate.image) ||
      seen.has(key) ||
      usedImages.has(key) ||
      !(await verifyRemoteImage(candidate.image))
    ) {
      continue
    }

    seen.add(key)
    unique.push(candidate)
  }

  return unique.length
    ? unique
    : [
        {
          image: "https://upload.wikimedia.org/wikipedia/commons/4/41/India_Farming.jpg",
          imageAlt: "Indian farm context for a Shreem Farms article",
          source: "web_wikimedia_verified_fallback",
        },
      ]
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
You are the SEO + organic growth engine for Shreem Farms, a premium natural farming, cow-based products, astrology, and rural trust brand in India.

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
- Critical focus rule: this blog must focus on exactly ONE primary Shreem product/service. Do not give equal attention to multiple products. Other products may appear only as one-line context if needed.

Current growth context:
- Google has started discovering Shreem Farms for branded and product-adjacent searches such as shreem astrology, gau kasht, and shreem atta.
- Prefer low-competition Indian buying-intent queries over broad impossible keywords.
- Use simple Indian English with Hindi/Hinglish terms where natural, such as gau kasht, gobar ke uple, desi bilona ghee, kundli online, kaal sarp yog upay, grah shanti, organic vermicompost, and jeevamrut fertilizer.
- Sound like a real Indian farm owner explaining honestly: trustworthy, dharmic, practical, premium, not fake or over-marketed.

Primary keyword and angle:
- Keyword: ${products.topic.keyword}
- Angle: ${products.topic.angle}
- Pillar: ${products.topic.pillar}
${products.topic.hotTrend ? `- Current India trend hook: ${products.topic.hotTrend}` : ""}

Primary product/service for this article:
- Name: ${products.topic.primaryProduct?.name || "Shreem"}
- URL: ${products.topic.primaryProduct?.href || "/store"}
- Category: ${products.topic.primaryProduct?.category || products.topic.pillar}
- Search phrases: ${products.topic.primaryProduct?.keywords || products.topic.keyword}
- Product truth to use: ${products.topic.primaryProduct?.promise || products.topic.angle}

Single-product rules:
- At least 70% of the article must be about the primary product/service above.
- The title, meta description, excerpt, one H2, checklist, and CTA must all match the primary product/service.
- Do not create a combined article such as "Jeevamrut and Vermicompost", "Neem Dhoop and Cow Dung Cakes", or "AI Credits and Expert Call" unless that exact combined product is the primary product. It is not.
- relatedLinks[0] must be the primary product URL above.
- If mentioning another Shreem product, use only one sentence and clearly keep it secondary.

SEO and conversion rules:
- Target one clear keyword and 3 to 6 related keywords.
- First paragraph must directly answer the search intent.
- Add a practical FAQ section with real Google-style questions.
- Add a gentle product CTA near the middle and at the end.
- Meta title must be under 60 characters.
- Meta description must be under 155 characters.
- Avoid keyword stuffing and generic AI paragraphs.
- Do not make fake medical, disease-cure, or guaranteed astrology claims.
- For astrology, say "as per Jyotish belief", "traditional view", or "consult an expert" where needed.

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
  "seoTitle": "click-worthy article title, not clickbait",
  "title": "48-68 character title with a clear buyer benefit",
  "slug": "short-url-slug",
  "urlSlug": "same as slug",
  "metaTitle": "under 60 characters",
  "metaDescription": "under 155 characters",
  "description": "145-155 character meta description",
  "excerpt": "short blog card excerpt",
  "targetKeyword": "${products.topic.keyword}",
  "relatedKeywords": ["3 to 6 related Indian search phrases"],
  "searchIntent": "commercial | informational | local trust | comparison",
  "category": "Shreem Blog",
  "readTime": "5 min read",
  "image": "choose one relevant image path from imageCandidates",
  "imageAlt": "descriptive alt text",
  "imageSearchQuery": "search query for a licensed supporting image",
  "imageAltSuggestions": ["3 short image alt text options"],
  "focusedProduct": { "name": "${products.topic.primaryProduct?.name || "Shreem"}", "href": "${products.topic.primaryProduct?.href || "/store"}", "handle": "${products.topic.primaryProduct?.handle || ""}" },
  "relatedLinks": [
    { "label": "${products.topic.primaryProduct?.name || "Shreem"}", "href": "${products.topic.primaryProduct?.href || "/store"}", "reason": "short reason" }
  ],
  "internalLinkingSuggestions": [
    { "label": "page or blog to link", "href": "/relative-url", "reason": "why this link helps SEO/conversion" }
  ],
  "productCta": {
    "midArticle": "one warm CTA sentence for the focused product",
    "final": "one clear final CTA sentence for the focused product"
  },
  "sections": [
    { "heading": "section heading", "body": ["paragraph", "paragraph"] }
  ],
  "faq": [
    { "question": "real search question", "answer": "direct 45-90 word answer" }
  ],
  "socialCaption": "short WhatsApp/Instagram caption from the blog",
  "suggestedNextTopics": ["next useful topic 1", "next useful topic 2", "next useful topic 3"]
}

Rules:
- Write 5 to 7 sections.
- Each body paragraph should be 70 to 120 words.
- Include one section that answers a common buyer question.
- Include one section that connects only the primary product/service to its product page or store action without hard selling.
- Include one short practical checklist or decision guide.
- Use one H2/section that contains either "How to choose", "What to check", "Why it matters", or a direct buyer question.
- Include one FAQ section in the faq array, not only inside normal sections.
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

const buildRelatedKeywords = (topic, product) =>
  Array.from(
    new Set(
      [
        topic.keyword,
        ...(product.keywords || "").split(","),
        product.name,
        product.category === "food" ? "no preservatives" : "",
        product.category === "astrology" ? "kundli online" : "",
        product.category === "farming" ? "natural farming India" : "",
        product.category === "ritual" ? "daily pooja items" : "",
      ]
        .map((keyword) => String(keyword || "").trim())
        .filter(Boolean)
    )
  ).slice(0, 6)

const inferSearchIntent = (topic, product) => {
  if (/vs|compare|checklist|price|identify|choose/i.test(topic.keyword)) {
    return "comparison"
  }

  if (product.category === "astrology" || /meaning|guide|kya|upay/i.test(topic.keyword)) {
    return "informational"
  }

  return "commercial"
}

const buildFaq = (topic, product) => [
  {
    question: `What should I check before choosing ${product.name}?`,
    answer: `Check whether the product page explains the real use case, preparation or sourcing, storage, delivery and limits clearly. For ${product.name}, Shreem keeps the focus on practical Indian-home use and avoids exaggerated claims, so the buyer can decide with trust instead of confusion.`,
  },
  {
    question: `Is ${product.name} suitable for daily Indian home use?`,
    answer: `It can be suitable when the use matches your family need and you follow the product guidance. Food products should be stored carefully, ritual products should be used safely, farming inputs should be applied in the right quantity, and Jyotish guidance should be treated as traditional guidance rather than fear-based certainty.`,
  },
  {
    question: `Why buy ${product.name} from Shreem Farms?`,
    answer: `Shreem focuses on a direct, trust-led experience: clear product information, farm-connected thinking, careful packing and simple language. The goal is to help Indian families understand what they are buying and why it matters before they place an order.`,
  },
]

const getTemplatePost = ({ products }) => {
  const topic = products.topic
  const primaryProduct = topic.primaryProduct || PRODUCT_FOCUS.a2Ghee
  const titleMap = {
    [PRODUCT_FOCUS.a2Ghee.handle]:
      /price quality|label/i.test(topic.keyword)
        ? "A2 Bilona Ghee Price: What Quality Buyers Should Check"
        : "Gau-Kasht Bilona Ghee: What Careful Buyers Should Check",
    [PRODUCT_FOCUS.neemDhoop.handle]:
      "Natural Neem Dhoop: What to Check Before Daily Pooja Use",
    [PRODUCT_FOCUS.cowDungCake.handle]:
      "Cow Dung Cakes for Havan: What Careful Buyers Should Check",
    [PRODUCT_FOCUS.vermicompost.handle]:
      "Vermicompost for Kitchen Gardens: What Buyers Should Check",
    [PRODUCT_FOCUS.jeevamrut.handle]:
      "Jeevamrut for Natural Farming: What Home Gardeners Should Know",
    [PRODUCT_FOCUS.aiJyotishCredits.handle]:
      "AI Kundli Credits: When Self-Service Jyotish Is Useful",
    [PRODUCT_FOCUS.expertAstrologerCall.handle]:
      "Expert Astrologer Call: When Human Jyotish Review Matters",
  }
  const title =
    titleMap[primaryProduct.handle] ||
    `${primaryProduct.name}: What Quality-Conscious Families Should Check`
  const trendLine = topic.hotTrend
    ? ` A current search spike around ${topic.hotTrend} makes this a good moment to answer the question with care.`
    : ""

  return {
    seoTitle: title,
    title,
    slug: slugify(`${title}-${new Date().toISOString().slice(0, 10)}`),
    urlSlug: slugify(`${title}-${new Date().toISOString().slice(0, 10)}`),
    metaTitle: title.slice(0, 58),
    metaDescription:
      `A practical Shreem guide to ${primaryProduct.name}, quality checks, Indian home use and direct-from-farm trust.`.slice(0, 154),
    description:
      "A practical Shreem guide for Indian families seeking pure, transparent, preservative-free products and calm traditional guidance.",
    excerpt:
      "A practical guide from Shreem on quality, trust, and better everyday choices for Indian homes.",
    targetKeyword: topic.keyword,
    relatedKeywords: buildRelatedKeywords(topic, primaryProduct),
    searchIntent: inferSearchIntent(topic, primaryProduct),
    category: topic.pillar === "astrology" ? "Shreem Jyotish" : "Shreem Blog",
    readTime: "5 min read",
    image: products.imageCandidates?.[0]?.image || topic.image,
    imageAlt: topic.imageAlt,
    imageSearchQuery: topic.imageSearchQuery,
    imageAltSuggestions: [
      topic.imageAlt,
      `${primaryProduct.name} guide for Indian families`,
      `${primaryProduct.name} from Shreem Farms`,
    ],
    focusedProduct: {
      name: primaryProduct.name,
      href: primaryProduct.href,
      handle: primaryProduct.handle,
    },
    relatedLinks: [
      productLink(
        primaryProduct,
        `Best next step for readers interested in ${primaryProduct.name}.`
      ),
    ],
    internalLinkingSuggestions: [
      productLink(
        primaryProduct,
        `Primary conversion page for ${primaryProduct.name}.`
      ),
      {
        label: "Shop Shreem products",
        href: "/store",
        reason: "Lets readers inspect the wider Shreem catalogue after the focused article.",
      },
    ],
    productCta: {
      midArticle: `If ${primaryProduct.name} fits your need, check the Shreem product page for current availability, price and delivery details.`,
      final: `Order ${primaryProduct.name} directly from Shreem Farms when you want a clear, trust-led buying experience.`,
    },
    sections: [
      {
        heading: "Why this matters now",
        body: [
          `Indian customers are becoming more careful about ${primaryProduct.name} and the trust behind what they buy.${trendLine} At Shreem, the answer is not loud marketing. It is a slower D2C approach: clearer product information, traditional processes where they matter, transparent use guidance, and enough context for a customer to decide with confidence.`,
        ],
      },
      {
        heading: `The Shreem quality lens for ${primaryProduct.name}`,
        body: [
          `${primaryProduct.name} should be judged by clear facts, not only claims. A good page should help a buyer understand the use case, freshness or handling, storage, delivery, and the reason behind the price. The product is not only a commodity; it carries trust, tradition, and support for a specific family or household need.`,
        ],
      },
      {
        heading: "A simple checklist",
        body: [
          `Before choosing ${primaryProduct.name}, check the product use case, freshness or preparation method, packaging clarity, delivery promise, and whether the brand is easy to contact. If the product is food, labels and storage matter. If it is ritual or farming related, use instructions and safe handling matter. If it is Jyotish guidance, calm language and transparent limits matter.`,
        ],
      },
      {
        heading: "Where Shreem fits",
        body: [
          `${primaryProduct.name} is one focused part of Shreem's wider work around pure Indian D2C products and Jyotish guidance. The goal is not to push every customer to buy everything, but to make this specific next step clear enough that the right customer feels safe moving forward.`,
        ],
      },
    ],
    faq: buildFaq(topic, primaryProduct),
    socialCaption: `${primaryProduct.name}: a simple Shreem guide for Indian homes. Read before you buy, and choose with clarity.`,
    suggestedNextTopics: [
      `${primaryProduct.name}: what to check before buying online`,
      `${primaryProduct.name} for Indian homes: practical use guide`,
      `How Shreem Farms keeps ${primaryProduct.name} simple and trustworthy`,
    ],
  }
}

const normalizePost = async (draft, posts, topic) => {
  const title = String(draft.title || "").trim()
  const baseSlug = slugify(draft.urlSlug || draft.slug || title)

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

  const primaryProduct = topic.primaryProduct || PRODUCT_FOCUS.a2Ghee
  const generatedLinks = Array.isArray(draft.relatedLinks)
    ? draft.relatedLinks
        .map((link) => ({
          label: String(link.label || "").trim(),
          href: String(link.href || "").trim(),
          reason: String(link.reason || "").trim(),
        }))
        .filter((link) => link.label && link.href.startsWith("/"))
        .slice(0, 3)
    : []
  const primaryLink = productLink(
    primaryProduct,
    `Best next step for readers interested in ${primaryProduct.name}.`
  )
  const relatedLinks = [
    primaryLink,
    ...generatedLinks.filter((link) => link.href !== primaryProduct.href),
  ].slice(0, 3)
  const cleanStringArray = (value, fallback = []) =>
    (Array.isArray(value) ? value : fallback)
      .map((item) => String(item || "").trim())
      .filter(Boolean)
      .slice(0, 8)
  const faq = Array.isArray(draft.faq)
    ? draft.faq
        .map((item) => ({
          question: String(item.question || "").trim(),
          answer: String(item.answer || "").trim(),
        }))
        .filter((item) => item.question && item.answer)
        .slice(0, 6)
    : buildFaq(topic, primaryProduct)
  const productCta =
    draft.productCta && typeof draft.productCta === "object"
      ? {
          midArticle: String(draft.productCta.midArticle || "").trim(),
          final: String(draft.productCta.final || "").trim(),
        }
      : {
          midArticle: `If ${primaryProduct.name} fits your need, check the Shreem product page for price and availability.`,
          final: `Order ${primaryProduct.name} directly from Shreem Farms when you want a clear, trust-led buying experience.`,
        }
  const internalLinkingSuggestions = Array.isArray(draft.internalLinkingSuggestions)
    ? draft.internalLinkingSuggestions
        .map((link) => ({
          label: String(link.label || "").trim(),
          href: String(link.href || "").trim(),
          reason: String(link.reason || "").trim(),
        }))
        .filter((link) => link.label && link.href.startsWith("/"))
        .slice(0, 6)
    : relatedLinks

  const now = new Date().toISOString()
  const usedImages = new Set(
    posts.map((post) => imageKey(post.imageUrl || post.image)).filter(Boolean)
  )
  const image = await normalizeImage(draft, topic, usedImages)
  const localImage = await createLocalBlogImage({ slug, title, topic })

  return {
    id: `journal_${now.replace(/[^0-9]/g, "")}_${Math.random()
      .toString(16)
      .slice(2, 10)}`,
    slug,
    title,
    description:
      String(draft.metaDescription || draft.description || draft.excerpt || title)
        .trim()
        .slice(0, 155),
    excerpt:
      String(draft.excerpt || draft.description || title).trim().slice(0, 220),
    content: "",
    image: localImage,
    imageUrl: localImage,
    imageAlt: image.imageAlt,
    imageSearchQuery: image.imageSearchQuery,
    imageSource: "shreem_generated_local",
    category: String(draft.category || "Shreem Blog").trim(),
    readTime: String(draft.readTime || draft.read_time || "5 min read").trim(),
    status: "published",
    author_name: "Shreem Farms",
    publishedAt: now.slice(0, 10),
    seoTitle: String(draft.seoTitle || draft.title || title).trim().slice(0, 90),
    metaTitle: String(draft.metaTitle || draft.title || title).trim().slice(0, 60),
    metaDescription: String(
      draft.metaDescription || draft.description || draft.excerpt || title
    )
      .trim()
      .slice(0, 155),
    targetKeyword: String(draft.targetKeyword || topic.keyword).trim(),
    relatedKeywords: cleanStringArray(
      draft.relatedKeywords,
      buildRelatedKeywords(topic, primaryProduct)
    ),
    searchIntent: String(
      draft.searchIntent || inferSearchIntent(topic, primaryProduct)
    ).trim(),
    sections,
    faq,
    relatedLinks,
    internalLinkingSuggestions,
    productCta,
    imageAltSuggestions: cleanStringArray(draft.imageAltSuggestions, [
      image.imageAlt,
      `${primaryProduct.name} guide for Indian families`,
      `${primaryProduct.name} from Shreem Farms`,
    ]),
    socialCaption: String(
      draft.socialCaption ||
        `${primaryProduct.name}: a simple Shreem guide for Indian homes.`
    )
      .trim()
      .slice(0, 280),
    suggestedNextTopics: cleanStringArray(draft.suggestedNextTopics, [
      `${primaryProduct.name}: what to check before buying online`,
      `${primaryProduct.name} for Indian homes: practical use guide`,
      `How Shreem Farms keeps ${primaryProduct.name} simple and trustworthy`,
    ]).slice(0, 3),
    focusedProduct: {
      name: primaryProduct.name,
      href: primaryProduct.href,
      handle: primaryProduct.handle,
      category: primaryProduct.category,
    },
    primaryProduct: {
      name: primaryProduct.name,
      href: primaryProduct.href,
      handle: primaryProduct.handle,
      category: primaryProduct.category,
    },
    metadata: {
      topicId: topic.id,
      pillar: topic.pillar,
      hotTrend: topic.hotTrend || "",
      focusedProduct: {
        name: primaryProduct.name,
        href: primaryProduct.href,
        handle: primaryProduct.handle,
        category: primaryProduct.category,
      },
      targetKeyword: String(draft.targetKeyword || topic.keyword).trim(),
      relatedKeywords: cleanStringArray(
        draft.relatedKeywords,
        buildRelatedKeywords(topic, primaryProduct)
      ),
      searchIntent: String(
        draft.searchIntent || inferSearchIntent(topic, primaryProduct)
      ).trim(),
    },
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
    context: buildProductContext(topic),
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
