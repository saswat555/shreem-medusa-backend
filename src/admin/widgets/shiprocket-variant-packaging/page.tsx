import { defineWidgetConfig } from "@medusajs/admin-sdk"
import type { AdminProduct, DetailWidgetProps } from "@medusajs/framework/types"
import { Button, Container, Heading, Input, Label, Text } from "@medusajs/ui"
import { useEffect, useMemo, useState } from "react"
import { sdk } from "../../lib/sdk"

type VariantPackaging = {
  id: string
  title: string
  sku?: string | null
  metadata?: Record<string, unknown> | null
  weight_kg: string
  length_cm: string
  breadth_cm: string
  height_cm: string
}

const metadataValue = (metadata: Record<string, unknown> | null | undefined, keys: string[]) => {
  for (const key of keys) {
    const value = metadata?.[key]

    if (value !== undefined && value !== null && String(value).trim()) {
      return String(value)
    }
  }

  return ""
}

const normalizeNumber = (value: string) => {
  const parsed = Number(value)

  return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined
}

const ShiprocketVariantPackagingWidget = ({ data }: DetailWidgetProps<AdminProduct>) => {
  const productId = data.id
  const [variants, setVariants] = useState<VariantPackaging[]>([])
  const [loading, setLoading] = useState(false)
  const [savingId, setSavingId] = useState("")
  const [message, setMessage] = useState("")

  const hasVariants = useMemo(() => variants.length > 0, [variants.length])

  const loadVariants = async () => {
    setLoading(true)
    setMessage("")

    try {
      const response = await sdk.admin.product.listVariants(productId, {
        limit: 100,
        fields: "id,title,sku,metadata,weight,length,width,height",
      } as any)
      const rows = (response.variants || []).map((variant: any) => {
        const metadata = variant.metadata || {}

        return {
          id: variant.id,
          title: variant.title || "Variant",
          sku: variant.sku,
          metadata,
          weight_kg: metadataValue(metadata, ["weight_kg", "package_weight_kg"]),
          length_cm: metadataValue(metadata, ["length_cm", "package_length_cm"]),
          breadth_cm: metadataValue(metadata, [
            "breadth_cm",
            "width_cm",
            "package_breadth_cm",
            "package_width_cm",
          ]),
          height_cm: metadataValue(metadata, ["height_cm", "package_height_cm"]),
        }
      })

      setVariants(rows)
    } catch (error: any) {
      setMessage(error?.message || "Unable to load variants.")
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadVariants()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [productId])

  const updateVariantField = (
    variantId: string,
    field: keyof Pick<VariantPackaging, "weight_kg" | "length_cm" | "breadth_cm" | "height_cm">,
    value: string
  ) => {
    setVariants((current) =>
      current.map((variant) =>
        variant.id === variantId
          ? { ...variant, [field]: value.replace(/[^0-9.]/g, "") }
          : variant
      )
    )
  }

  const saveVariant = async (variant: VariantPackaging) => {
    setSavingId(variant.id)
    setMessage("")

    try {
      const metadata = {
        ...(variant.metadata || {}),
        weight_kg: normalizeNumber(variant.weight_kg),
        package_weight_kg: normalizeNumber(variant.weight_kg),
        length_cm: normalizeNumber(variant.length_cm),
        package_length_cm: normalizeNumber(variant.length_cm),
        breadth_cm: normalizeNumber(variant.breadth_cm),
        width_cm: normalizeNumber(variant.breadth_cm),
        package_breadth_cm: normalizeNumber(variant.breadth_cm),
        package_width_cm: normalizeNumber(variant.breadth_cm),
        height_cm: normalizeNumber(variant.height_cm),
        package_height_cm: normalizeNumber(variant.height_cm),
      }

      Object.keys(metadata).forEach((key) => {
        if ((metadata as Record<string, unknown>)[key] === undefined) {
          delete (metadata as Record<string, unknown>)[key]
        }
      })

      await sdk.admin.product.updateVariant(
        productId,
        variant.id,
        { metadata } as any,
        { fields: "id,*variants" }
      )

      setMessage(`${variant.title} packaging saved for Shiprocket.`)
      await loadVariants()
    } catch (error: any) {
      setMessage(error?.message || `Unable to save ${variant.title}.`)
    } finally {
      setSavingId("")
    }
  }

  return (
    <Container className="divide-y p-0">
      <div className="p-4">
        <Heading level="h2">Shiprocket variant packaging</Heading>
        <Text size="small" className="text-ui-fg-subtle mt-2">
          Add exact packed weight and dimensions per variant. Checkout and backend
          Shiprocket rates use these values before product-level defaults.
        </Text>
      </div>

      <div className="space-y-4 p-4">
        {loading ? <Text>Loading variants...</Text> : null}
        {!loading && !hasVariants ? (
          <Text className="text-ui-fg-subtle">No variants found for this product.</Text>
        ) : null}

        <div className="space-y-4">
          {variants.map((variant) => (
            <div key={variant.id} className="rounded-lg border p-3">
              <div className="mb-3">
                <Text weight="plus">{variant.title}</Text>
                {variant.sku ? (
                  <Text size="small" className="text-ui-fg-subtle">
                    SKU: {variant.sku}
                  </Text>
                ) : null}
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>Weight kg</Label>
                  <Input
                    value={variant.weight_kg}
                    placeholder="0.5"
                    onChange={(e) =>
                      updateVariantField(variant.id, "weight_kg", e.target.value)
                    }
                  />
                </div>
                <div>
                  <Label>Length cm</Label>
                  <Input
                    value={variant.length_cm}
                    placeholder="12"
                    onChange={(e) =>
                      updateVariantField(variant.id, "length_cm", e.target.value)
                    }
                  />
                </div>
                <div>
                  <Label>Breadth cm</Label>
                  <Input
                    value={variant.breadth_cm}
                    placeholder="10"
                    onChange={(e) =>
                      updateVariantField(variant.id, "breadth_cm", e.target.value)
                    }
                  />
                </div>
                <div>
                  <Label>Height cm</Label>
                  <Input
                    value={variant.height_cm}
                    placeholder="8"
                    onChange={(e) =>
                      updateVariantField(variant.id, "height_cm", e.target.value)
                    }
                  />
                </div>
              </div>

              <Button
                className="mt-3"
                variant="secondary"
                size="small"
                isLoading={savingId === variant.id}
                onClick={() => saveVariant(variant)}
              >
                Save packaging
              </Button>
            </div>
          ))}
        </div>

        {message ? <Text className="text-ui-fg-subtle">{message}</Text> : null}
      </div>
    </Container>
  )
}

export const config = defineWidgetConfig({
  zone: "product.details.side.after",
})

export default ShiprocketVariantPackagingWidget
