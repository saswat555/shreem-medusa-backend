#!/usr/bin/env node

const fs = require("node:fs")
const path = require("node:path")

const backendRoot = path.resolve(__dirname, "..")
const journalFile =
  process.env.JOURNAL_CONTENT_FILE ||
  path.join(backendRoot, "data", "blog-posts.json")

const EXISTING_LOCAL_IMAGES = new Set([
  "/logo.jpeg",
  "/shreem-scenes/bilona-process.png",
  "/shreem-scenes/bilona-process.jpg",
  "/shreem-scenes/neem-dhoop.png",
  "/shreem-scenes/neem-dhoop.jpg",
  "/shreem-scenes/living-soil.svg",
  "/shreem-scenes/postive-energy.png",
  "/shreem-scenes/postive-energy.jpg",
])

const TOPIC_IMAGES = [
  {
    matches: [
      "ghee",
      "bilona",
      "gau-kasht",
      "cow dung cooking",
      "cow dung cakes",
      "desi cow",
    ],
    queries: ["ghee", "Indian cow", "butter churn", "dairy India"],
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
    image: "https://upload.wikimedia.org/wikipedia/commons/d/db/Desi_ghee.JPG",
    imageAlt: "Golden desi ghee in a glass jar for a traditional bilona ghee article",
    imageSearchQuery: "traditional A2 bilona ghee making desi cow India",
    imageSource: "web_wikimedia",
  },
  {
    matches: ["dhoop", "pooja", "havan", "dhooni", "incense"],
    queries: ["incense India", "pooja diya", "havan India"],
    fallbackImages: [
      "https://upload.wikimedia.org/wikipedia/commons/e/e8/Incense_stick.JPG",
      "https://upload.wikimedia.org/wikipedia/commons/2/21/Incense_in_Vietnam.jpg",
      "https://upload.wikimedia.org/wikipedia/commons/0/01/Pooja_Diya_for_Indian_Wedding.jpg",
      "https://upload.wikimedia.org/wikipedia/commons/e/e2/Diwali_Pooja_Thali_with_Diya_Decoration.jpg",
    ],
    image: "https://upload.wikimedia.org/wikipedia/commons/e/e8/Incense_stick.JPG",
    imageAlt: "Burning incense representing natural dhoop for Indian pooja rituals",
    imageSearchQuery: "natural neem dhoop Indian pooja ritual",
    imageSource: "web_wikimedia",
  },
  {
    matches: [
      "vermicompost",
      "jeevamrut",
      "farming",
      "soil",
      "kitchen garden",
      "organic",
    ],
    queries: ["vermicompost", "organic farming India", "compost soil"],
    fallbackImages: [
      "https://upload.wikimedia.org/wikipedia/commons/6/68/A_Vermi_compost.JPG",
      "https://upload.wikimedia.org/wikipedia/commons/2/2b/Organik-gubre-cesitleri.jpg",
      "https://upload.wikimedia.org/wikipedia/commons/6/61/Sifted_vermicompost_vermicast.png",
      "https://upload.wikimedia.org/wikipedia/commons/f/fd/Organic_farming_uttarakhand.jpg",
    ],
    image: "https://upload.wikimedia.org/wikipedia/commons/6/68/A_Vermi_compost.JPG",
    imageAlt: "Rich vermicompost soil for natural farming and kitchen gardens",
    imageSearchQuery: "vermicompost jeevamrut natural farming living soil India",
    imageSource: "web_wikimedia",
  },
  {
    matches: ["kundli", "jyotish", "astrology", "astrologer"],
    queries: ["astrolabe", "zodiac India", "astronomy instrument"],
    fallbackImages: [
      "https://upload.wikimedia.org/wikipedia/commons/c/c9/Astrolab.JPG",
      "https://upload.wikimedia.org/wikipedia/commons/1/18/Astrolabe-Persian-18C.jpg",
      "https://upload.wikimedia.org/wikipedia/commons/6/6b/Persian_astrolabe.jpg",
      "https://upload.wikimedia.org/wikipedia/commons/c/c7/Iranian_Astrolabe_14.jpg",
    ],
    image: "https://upload.wikimedia.org/wikipedia/commons/c/c9/Astrolab.JPG",
    imageAlt: "Public domain astrolabe image for astrology and kundli guidance",
    imageSearchQuery: "vedic astrology kundli consultation India",
    imageSource: "web_wikimedia",
  },
]

const isRemoteImage = (value) => /^https?:\/\//i.test(String(value || ""))

const imageKey = (value) => String(value || "").trim().split("?")[0]

const isRenderableImageUrl = (value) => {
  const image = String(value || "").trim().split("?")[0].toLowerCase()

  if (!image) {
    return false
  }

  return !/\.(djvu|pdf|svg|txt|html?|xml)$/i.test(image)
}

const isUsableImage = (value) => {
  const image = String(value || "").trim()

  if (
    !image ||
    image === "/shreem-scenes/hero-scene.png" ||
    EXISTING_LOCAL_IMAGES.has(image)
  ) {
    return false
  }

  if (isRemoteImage(image) && isRenderableImageUrl(image)) {
    return true
  }

  return EXISTING_LOCAL_IMAGES.has(image)
}

const inferTopicImage = (post) => {
  const haystack = `${post.title || ""} ${post.slug || ""} ${
    post.description || ""
  } ${post.excerpt || ""}`.toLowerCase()

  return (
    TOPIC_IMAGES.find((topic) =>
      topic.matches.some((match) => haystack.includes(match))
    ) || {
      image: "/logo.jpeg",
      imageAlt: "Shreem Farms blog article image",
      imageSearchQuery: "Shreem Farms desi cow products India",
      imageSource: "brand_normalized",
    }
  )
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
    const response = await fetch(url, {
      headers: {
        "User-Agent": "ShreemFarmsSEO/1.0 (blog image normalization)",
      },
    })
    const body = await response.json()

    return Object.values(body?.query?.pages || {})
      .map((page) => page?.imageinfo?.[0])
      .filter((info) => info?.url && String(info.mime || "").startsWith("image/"))
      .map((info) => info.url)
      .filter(isRenderableImageUrl)
  } catch {
    return []
  }
}

const getUniqueTopicImage = async (post, usedImages) => {
  const topic = inferTopicImage(post)
  const candidates = []

  for (const query of topic.queries || []) {
    candidates.push(...(await searchCommonsImages(query)))
  }

  candidates.push(...(topic.fallbackImages || []), topic.image)

  const image =
    candidates.find((candidate) => isRemoteImage(candidate) && isRenderableImageUrl(candidate) && !usedImages.has(imageKey(candidate))) ||
    topic.fallbackImages?.find((candidate) => isRenderableImageUrl(candidate) && !usedImages.has(imageKey(candidate))) ||
    topic.image

  return {
    image,
    imageAlt: topic.imageAlt,
    imageSearchQuery: post.imageSearchQuery || topic.imageSearchQuery,
    imageSource: image.includes("upload.wikimedia.org")
      ? "web_wikimedia_unique"
      : topic.imageSource || "web_unique",
  }
}

const posts = JSON.parse(fs.readFileSync(journalFile, "utf8"))

if (!Array.isArray(posts)) {
  throw new Error("Blog posts file must contain an array.")
}

const main = async () => {
let changed = 0
const usedImages = new Set()
const normalized = []

for (const post of posts) {
  const currentImage = String(post.imageUrl || post.image || "").trim()
  const keepCurrent = isUsableImage(currentImage) && !usedImages.has(imageKey(currentImage))
  const selected = keepCurrent
    ? {
        image: currentImage,
        imageAlt: post.imageAlt || `${post.title || "Shreem Blog"} article image`,
        imageSearchQuery: post.imageSearchQuery || "",
        imageSource: post.imageSource || "existing",
      }
    : await getUniqueTopicImage(post, usedImages)

  usedImages.add(imageKey(selected.image))

  const next = {
    ...post,
    image: selected.image,
    imageUrl: selected.image,
    imageAlt:
      String(post.imageAlt || selected.imageAlt || "").trim() ||
      `${post.title || "Shreem Blog"} article image`,
    imageSearchQuery:
      String(post.imageSearchQuery || selected.imageSearchQuery || "").trim(),
    imageSource: selected.imageSource || post.imageSource || "existing",
  }

  if (
    next.image !== post.image ||
    next.imageUrl !== post.imageUrl ||
    next.imageAlt !== post.imageAlt ||
    next.imageSearchQuery !== post.imageSearchQuery ||
    next.imageSource !== post.imageSource
  ) {
    changed += 1
    next.updated_at = new Date().toISOString()
  }

  normalized.push(next)
}

fs.writeFileSync(journalFile, `${JSON.stringify(normalized, null, 2)}\n`)

console.log(
  JSON.stringify(
    {
      ok: true,
      file: journalFile,
      posts: normalized.length,
      changed,
    },
    null,
    2
  )
)
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
