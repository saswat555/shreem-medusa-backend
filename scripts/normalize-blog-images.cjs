#!/usr/bin/env node

const fs = require("node:fs")
const path = require("node:path")

const backendRoot = path.resolve(__dirname, "..")
const journalFile =
  process.env.JOURNAL_CONTENT_FILE ||
  path.join(backendRoot, "data", "blog-posts.json")

const EXISTING_LOCAL_IMAGES = new Set([
  "/shreem-scenes/bilona-process.png",
  "/shreem-scenes/bilona-process.jpg",
  "/shreem-scenes/neem-dhoop.png",
  "/shreem-scenes/neem-dhoop.jpg",
  "/shreem-scenes/postive-energy.png",
  "/shreem-scenes/postive-energy.jpg",
])

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

const TOPIC_IMAGES = [
  {
    matches: [
      "ghee",
      "bilona",
      "gau-kasht",
      "gau kasht",
      "cow dung cooking",
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
    matches: ["arhar", "toor dal", "pigeon pea", "dal"],
    queries: ["toor dal", "arhar dal India", "pigeon pea dal"],
    fallbackImages: [
      "https://upload.wikimedia.org/wikipedia/commons/0/0b/Pigeon_pea_%28Cajanus_cajan%29.jpg",
      "https://upload.wikimedia.org/wikipedia/commons/7/78/Toor_dal.jpg",
      "https://upload.wikimedia.org/wikipedia/commons/5/5c/Pigeon_peas.jpg",
    ],
    image: "https://upload.wikimedia.org/wikipedia/commons/0/0b/Pigeon_pea_%28Cajanus_cajan%29.jpg",
    imageAlt: "Pigeon pea and toor dal for a desi arhar dal buyer guide",
    imageSearchQuery: "desi arhar dal farm sourced toor dal India",
    imageSource: "web_wikimedia",
  },
  {
    matches: ["black wheat", "atta", "flour", "roti", "chapati"],
    queries: ["wheat flour India", "atta roti", "whole wheat flour"],
    fallbackImages: [
      "https://upload.wikimedia.org/wikipedia/commons/6/6f/Wheat_flour.jpg",
      "https://upload.wikimedia.org/wikipedia/commons/7/77/Chapatis_on_griddle.jpg",
      "https://upload.wikimedia.org/wikipedia/commons/1/11/Roti_with_ghee.jpg",
    ],
    image: "https://upload.wikimedia.org/wikipedia/commons/6/6f/Wheat_flour.jpg",
    imageAlt: "Wheat flour and roti for a black wheat atta guide",
    imageSearchQuery: "black wheat atta benefits India roti flour",
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
    matches: ["cow dung cake", "cowdung", "gobar", "uple", "dhooni"],
    queries: ["cow dung cakes India", "havan fire India", "rural cow dung cakes"],
    fallbackImages: [
      "https://upload.wikimedia.org/wikipedia/commons/a/a2/Cow_dung_cakes_in_India.jpg",
      "https://upload.wikimedia.org/wikipedia/commons/e/e6/Offering_of_Ghee_into_Yajna_Agni_-_Howrah_2012-12-16_2088.JPG",
      "https://upload.wikimedia.org/wikipedia/commons/7/72/Indian_village_cow_dung_cakes.jpg",
    ],
    image: "https://upload.wikimedia.org/wikipedia/commons/a/a2/Cow_dung_cakes_in_India.jpg",
    imageAlt: "Sun dried cow dung cakes for havan and dhooni rituals",
    imageSearchQuery: "cow dung cakes havan dhooni ritual India",
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
      "https://upload.wikimedia.org/wikipedia/commons/6/61/Sifted_vermicompost_vermicast.png",
      "https://upload.wikimedia.org/wikipedia/commons/f/fd/Organic_farming_uttarakhand.jpg",
    ],
    image: "https://upload.wikimedia.org/wikipedia/commons/6/68/A_Vermi_compost.JPG",
    imageAlt: "Rich vermicompost soil for natural farming and kitchen gardens",
    imageSearchQuery: "vermicompost jeevamrut natural farming living soil India",
    imageSource: "web_wikimedia",
  },
  {
    matches: ["panchang", "muhurat", "jyotish", "kundli", "astrology", "astrologer", "sade sati", "kaal sarp"],
    queries: ["astrolabe", "zodiac India", "astronomy instrument"],
    fallbackImages: [
      "https://upload.wikimedia.org/wikipedia/commons/c/c9/Astrolab.JPG",
      "https://upload.wikimedia.org/wikipedia/commons/1/18/Astrolabe-Persian-18C.jpg",
      "https://upload.wikimedia.org/wikipedia/commons/6/6b/Persian_astrolabe.jpg",
      "https://upload.wikimedia.org/wikipedia/commons/c/c7/Iranian_Astrolabe_14.jpg",
    ],
    image: "https://upload.wikimedia.org/wikipedia/commons/c/c9/Astrolab.JPG",
    imageAlt: "Astrolabe for a practical Shreem Jyotish and Panchang article",
    imageSearchQuery: "vedic astrology kundli consultation India",
    imageSource: "web_wikimedia",
  },
  {
    matches: ["preservative", "d2c", "pure food", "small batch", "label", "trust"],
    queries: ["Indian farming food market", "traditional Indian food", "small batch food India"],
    fallbackImages: [
      "https://upload.wikimedia.org/wikipedia/commons/4/41/India_Farming.jpg",
      "https://upload.wikimedia.org/wikipedia/commons/8/87/Indian_food_in_North_Kolkata.jpg",
      "https://upload.wikimedia.org/wikipedia/commons/6/62/Farmer_in_Tamil_Nadu_1993.JPG",
    ],
    image: "https://upload.wikimedia.org/wikipedia/commons/4/41/India_Farming.jpg",
    imageAlt: "Indian farm and food context for pure D2C food buying",
    imageSearchQuery: "pure preservative free D2C Indian food brand small batch",
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

  if (UNSAFE_REMOTE_IMAGE_EXTENSIONS.test(image)) {
    return false
  }

  return SAFE_REMOTE_IMAGE_EXTENSIONS.test(image)
}

const verifyRemoteImage = async (value) => {
  const image = String(value || "").trim()

  if (!isRemoteImage(image) || !isRenderableImageUrl(image)) {
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
        "User-Agent": "ShreemFarmsSEO/1.0 (blog image validation)",
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

const isUsableImage = async (value) => {
  const image = String(value || "").trim()

  if (
    !image ||
    image === "/shreem-scenes/hero-scene.png" ||
    EXISTING_LOCAL_IMAGES.has(image)
  ) {
    return false
  }

  if (isRemoteImage(image)) {
    return verifyRemoteImage(image)
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
      image: "https://upload.wikimedia.org/wikipedia/commons/4/41/India_Farming.jpg",
      imageAlt: "Indian farm context for a Shreem Farms article",
      imageSearchQuery: "Shreem Farms desi cow products India natural farming",
      imageSource: "web_wikimedia",
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
    const response = await fetchWithTimeout(url, {
      headers: {
        "User-Agent": "ShreemFarmsSEO/1.0 (blog image normalization)",
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

const getUniqueTopicImage = async (post, usedImages) => {
  const topic = inferTopicImage(post)
  const candidates = []

  for (const query of topic.queries || []) {
    candidates.push(...(await searchCommonsImages(query)))
  }

  candidates.push(...(topic.fallbackImages || []), topic.image)

  let image = topic.image

  for (const candidate of candidates) {
    if (
      candidate &&
      !usedImages.has(imageKey(candidate)) &&
      (await isUsableImage(candidate))
    ) {
      image = candidate
      break
    }
  }

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
  const keepCurrent =
    (await isUsableImage(currentImage)) && !usedImages.has(imageKey(currentImage))
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
