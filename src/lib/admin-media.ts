import fs from "node:fs/promises"
import path from "node:path"

type SaveImageInput = {
  fileName?: unknown
  mimeType?: unknown
  contentBase64?: unknown
  directory: "blog" | "payment"
  fixedBaseName?: string
}

const MAX_IMAGE_BYTES = 8 * 1024 * 1024

const mimeToExtension: Record<string, string> = {
  "image/jpeg": ".jpg",
  "image/jpg": ".jpg",
  "image/png": ".png",
  "image/webp": ".webp",
  "image/gif": ".gif",
}

const getProjectRoot = () => {
  if (process.env.MEDUSA_PROJECT_ROOT) {
    return process.env.MEDUSA_PROJECT_ROOT
  }

  const cwd = process.cwd()
  return cwd.endsWith(path.join(".medusa", "server"))
    ? path.resolve(cwd, "../..")
    : cwd
}

const getStaticRoot = () => {
  const configuredUploadDir =
    process.env.FILE_UPLOAD_DIR || process.env.LOCAL_FILE_UPLOAD_DIR || "static"

  return path.isAbsolute(configuredUploadDir)
    ? configuredUploadDir
    : path.resolve(getProjectRoot(), configuredUploadDir)
}

const getBackendUrl = () =>
  String(process.env.MEDUSA_BACKEND_URL || process.env.BACKEND_URL || "")
    .trim()
    .replace(/\/+$/, "")

const sanitizeBaseName = (value: string) =>
  value
    .toLowerCase()
    .replace(/\.[a-z0-9]+$/i, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "")
    .slice(0, 80) || "image"

const parseImageUpload = (input: SaveImageInput) => {
  const mimeType = String(input.mimeType || "").trim().toLowerCase()
  const extension = mimeToExtension[mimeType]

  if (!extension) {
    throw new Error("Upload a JPG, PNG, WebP, or GIF image.")
  }

  const rawContent = String(input.contentBase64 || "")
  const contentBase64 = rawContent.includes(",")
    ? rawContent.split(",").pop() || ""
    : rawContent

  if (!contentBase64) {
    throw new Error("Image data is missing.")
  }

  const buffer = Buffer.from(contentBase64, "base64")

  if (!buffer.length || buffer.length > MAX_IMAGE_BYTES) {
    throw new Error("Image must be smaller than 8 MB.")
  }

  return { buffer, extension, mimeType }
}

export const saveAdminImageUpload = async (input: SaveImageInput) => {
  const { buffer, extension, mimeType } = parseImageUpload(input)
  const staticRoot = getStaticRoot()
  const uploadDir = path.join(staticRoot, input.directory)
  const baseName = input.fixedBaseName
    ? sanitizeBaseName(input.fixedBaseName)
    : `${Date.now()}-${sanitizeBaseName(String(input.fileName || "image"))}`
  const fileName = `${baseName}${extension}`
  const filePath = path.join(uploadDir, fileName)

  await fs.mkdir(uploadDir, { recursive: true })
  if (input.fixedBaseName) {
    await Promise.all(
      Object.values(mimeToExtension).map(async (candidateExtension) => {
        if (candidateExtension === extension) {
          return
        }

        try {
          await fs.unlink(path.join(uploadDir, `${baseName}${candidateExtension}`))
        } catch {
          // ignore older QR/image variants that do not exist
        }
      })
    )
  }
  await fs.writeFile(filePath, buffer)

  const publicPath = `/static/${input.directory}/${fileName}`
  const backendUrl = getBackendUrl()

  return {
    file_name: fileName,
    mime_type: mimeType,
    path: publicPath,
    url: backendUrl ? `${backendUrl}${publicPath}` : publicPath,
  }
}

export const getManualUpiQrPublicUrl = async () => {
  const backendUrl = getBackendUrl()
  const staticRoot = getStaticRoot()
  const candidates = [".png", ".jpg", ".webp", ".gif"].map((extension) => ({
    extension,
    filePath: path.join(staticRoot, "payment", `shreem-upi-qr${extension}`),
    publicPath: `/static/payment/shreem-upi-qr${extension}`,
  }))

  for (const candidate of candidates) {
    try {
      await fs.access(candidate.filePath)
      return backendUrl ? `${backendUrl}${candidate.publicPath}` : candidate.publicPath
    } catch {
      // keep looking for the uploaded QR in another supported format
    }
  }

  return ""
}
