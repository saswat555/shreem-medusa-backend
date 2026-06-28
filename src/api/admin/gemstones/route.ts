import type {
  AuthenticatedMedusaRequest,
  MedusaResponse,
} from "@medusajs/framework/http"

import { saveAdminImageUpload } from "../../../lib/admin-media"
import {
  listGemstoneCommissions,
  listGemstoneProducts,
  listGemstoneVendors,
  listGemstoneVendorUsers,
  seedRatnaSagarVendor,
  createOrUpdateGemstoneVendorUser,
  updateGemstoneCommissionPayout,
  upsertGemstoneProduct,
  upsertGemstoneVendor,
} from "../../../lib/gemstone-marketplace"

const isAdminRequest = (req: any) => {
  const authContext = req.auth_context || req.authContext || {}

  return (
    authContext.actor_type === "user" ||
    authContext.actorType === "user" ||
    Boolean(authContext.user_id) ||
    Boolean(authContext.userId) ||
    Boolean(authContext.actor_id) ||
    Boolean(authContext.actorId) ||
    Boolean(req.user?.id)
  )
}

const setNoStore = (res: MedusaResponse) => {
  res.setHeader(
    "Cache-Control",
    "no-store, no-cache, must-revalidate, proxy-revalidate"
  )
  res.setHeader("Pragma", "no-cache")
  res.setHeader("Expires", "0")
}

export const GET = async (
  req: AuthenticatedMedusaRequest,
  res: MedusaResponse
) => {
  setNoStore(res)

  if (!isAdminRequest(req)) {
    return res.status(401).json({
      message: "Admin authentication is required.",
    })
  }

  const [vendors, products, commissions, vendor_users] = await Promise.all([
    listGemstoneVendors(),
    listGemstoneProducts(),
    listGemstoneCommissions(),
    listGemstoneVendorUsers(),
  ])

  return res.json({
    vendors,
    products,
    commissions,
    vendor_users,
  })
}

export const POST = async (
  req: AuthenticatedMedusaRequest<{
    action?: string
    vendor?: any
    product?: any
    commission?: any
    vendor_user?: any
    image_upload?: {
      fileName?: string
      mimeType?: string
      contentBase64?: string
      fixedBaseName?: string
    }
  }>,
  res: MedusaResponse
) => {
  setNoStore(res)

  if (!isAdminRequest(req)) {
    return res.status(401).json({
      message: "Admin authentication is required.",
    })
  }

  try {
    const action = String(req.body?.action || "")

    if (action === "seed-ratna-sagar") {
      const vendor = await seedRatnaSagarVendor()
      return res.status(201).json({ vendor })
    }

    if (action === "upload-image") {
      const upload = req.body?.image_upload || {}
      const image = await saveAdminImageUpload({
        ...upload,
        directory: "gemstones",
      })

      return res.status(201).json({ image })
    }

    if (action === "save-vendor") {
      const vendor = await upsertGemstoneVendor(req.body?.vendor || {})
      return res.status(201).json({ vendor })
    }

    if (action === "save-product") {
      const product = await upsertGemstoneProduct(req.body?.product || {})
      return res.status(201).json({ product })
    }

    if (action === "save-vendor-user") {
      const vendor_user = await createOrUpdateGemstoneVendorUser(
        req.body?.vendor_user || {}
      )
      return res.status(201).json({ vendor_user })
    }

    if (action === "update-commission") {
      const commission = await updateGemstoneCommissionPayout(
        req.body?.commission || {}
      )
      return res.json({ commission })
    }

    return res.status(400).json({
      message: "Unknown gemstone admin action.",
    })
  } catch (error: any) {
    return res.status(400).json({
      message: error?.message || "Gemstone marketplace action failed.",
    })
  }
}
