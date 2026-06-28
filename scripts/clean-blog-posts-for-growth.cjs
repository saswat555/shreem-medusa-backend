#!/usr/bin/env node

const fs = require("node:fs")
const path = require("node:path")

const backendRoot = path.resolve(__dirname, "..")
const journalFile =
  process.env.JOURNAL_CONTENT_FILE ||
  path.join(backendRoot, "data", "blog-posts.json")
const apply = process.argv.includes("--apply")

const QUALITY_KEEP_SLUGS = new Set([
  "ekadashi-parana-gau-kasht-ghee-purity",
  "sade-sati-dasha-calm-guide",
  "ghee-labels-online-ekadashi-purity-checklist",
  "daily-panchang-muhurat-indian-households-weekly",
  "gau-kasht-bilona-ghee-what-careful-buyers-should-check-2026-06-23-2",
  "natural-neem-dhoop-monsoon-evening-pooja-fragrance",
  "monsoon-purity-preservative-free-d2c-india",
  "vermicompost-organic-soil-booster-kitchen-gardens",
  "black-wheat-flour-superfood-indian-kitchens",
  "from-farm-to-family-shreem-farms-honest-indian-food",
  "shreem-desi-thekua-wheat-ghee-traditional-sweet",
])

const MUST_ARCHIVE_SLUGS = new Set([
  "monsoon-soil-care-jeevamrut-vermicompost",
  "neem-dhoop-cow-dung-cakes-natural-purifiers",
  "pigeon-pea-benefits-desi-arhar-in-your-pantry",
  "stevia-powder-vs-sugar-natural-sweet-choice",
])

const DUPLICATE_PATTERNS = [
  /gau[- ]?kasht.*bilona.*ghee/i,
  /a2.*bilona.*ghee/i,
  /monsoon.*preservative[- ]free.*d2c/i,
  /ai kundli.*expert/i,
]

const getText = (post) =>
  [
    post.title,
    post.slug,
    post.description,
    post.excerpt,
    ...(post.sections || []).flatMap((section) => [
      section.heading,
      ...(section.body || []),
    ]),
  ]
    .filter(Boolean)
    .join(" ")

const getSearchIntentText = (post) =>
  [post.title, post.slug, post.description, post.excerpt]
    .filter(Boolean)
    .join(" ")

const qualityReason = (post, seenPatternKeeps) => {
  const text = getText(post)
  const searchIntentText = getSearchIntentText(post)
  const slug = post.slug || ""

  if (QUALITY_KEEP_SLUGS.has(slug)) {
    return ""
  }

  if (MUST_ARCHIVE_SLUGS.has(slug)) {
    return "old post mixes topics or makes health-forward claims; needs rewrite"
  }

  if (/jeevamrut.*vermicompost|neem dhoop.*cow dung cakes|ai kundli.*expert astrologer/i.test(searchIntentText)) {
    return "mixed two products in one article; violates one-product SEO focus"
  }

  if (/(blood sugar|blood pressure|cure|disease|diabetes|heart health|anaemia|weight management)/i.test(text)) {
    return "health/medical-style wording is risky for trust and SEO"
  }

  for (const pattern of DUPLICATE_PATTERNS) {
    if (!pattern.test(text)) {
      continue
    }

    const key = String(pattern)

    if (seenPatternKeeps.has(key)) {
      return "near-duplicate topic; archive so stronger canonical-style article can rank"
    }

    seenPatternKeeps.add(key)
    return ""
  }

  if (/monsoon.*food.*trust|pure preservative-free d2c buying/i.test(text)) {
    return "generic trust article; should be rewritten around one product"
  }

  return ""
}

const posts = JSON.parse(fs.readFileSync(journalFile, "utf8"))

if (!Array.isArray(posts)) {
  throw new Error("Blog posts file must contain an array.")
}

const seenPatternKeeps = new Set()
const now = new Date().toISOString()
const decisions = posts.map((post) => {
  const reason = qualityReason(post, seenPatternKeeps)

  return {
    post,
    archive: Boolean(reason),
    reason,
  }
})

const archived = decisions.filter((decision) => decision.archive)
const kept = decisions.filter((decision) => !decision.archive)

console.log(
  JSON.stringify(
    {
      file: journalFile,
      mode: apply ? "apply" : "dry-run",
      total: posts.length,
      kept: kept.length,
      archived: archived.length,
      archivedPosts: archived.map(({ post, reason }) => ({
        slug: post.slug,
        title: post.title,
        reason,
      })),
    },
    null,
    2
  )
)

if (!apply) {
  console.log("\nDry run only. Re-run with --apply to archive these posts.")
  process.exit(0)
}

const backupFile = path.join(
  path.dirname(journalFile),
  `blog-posts.backup-before-growth-cleanup-${now.replace(/[^0-9]/g, "").slice(0, 14)}.json`
)

fs.copyFileSync(journalFile, backupFile)

const cleanedPosts = decisions.map(({ post, archive, reason }) => {
  if (!archive) {
    return post
  }

  return {
    ...post,
    status: "draft",
    archivedReason: reason,
    archivedAt: now,
    updated_at: now,
    metadata: {
      ...(post.metadata || {}),
      growthCleanup: {
        archivedAt: now,
        reason,
      },
    },
  }
})

fs.writeFileSync(journalFile, `${JSON.stringify(cleanedPosts, null, 2)}\n`)

console.log(`\nArchived ${archived.length} posts. Backup: ${backupFile}`)
