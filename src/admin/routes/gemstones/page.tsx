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
  Switch,
  Text,
  Textarea,
} from "@medusajs/ui"
import { sdk } from "../../lib/sdk"

type Vendor = {
  id: string
  name: string
  handle: string
  contact_email: string
  contact_phone: string
  city: string
  state: string
  bio: string
  trust_notes: string
  banner_url: string
  logo_url: string
  commission_rate_bps: number
  commission_percent: number
  active: boolean
}

type GemProduct = {
  id: string
  vendor_id: string
  vendor_name: string
  medusa_variant_id: string
  medusa_product_id: string
  title: string
  handle: string
  stone_name: string
  planet: string
  rashi: string
  metal: string
  item_type: string
  cut: string
  origin: string
  treatment: string
  certification: string
  quality_grade: string
  color_grade: string
  clarity: string
  shape: string
  sku: string
  lot_number: string
  purpose: string
  lab_report_url: string
  variant_options: GemstoneVariantOption[]
  weight_carats: number
  weight_ratti: number
  size: string
  price_inr: number
  inventory_quantity: number
  image_urls: string[]
  description: string
  recommendation_notes: string
  active: boolean
}

type GemstoneVariantOption = {
  id?: string
  label?: string
  medusa_variant_id?: string
  form?: string
  metal?: string
  size?: string
  quality_grade?: string
  weight_carats?: number
  weight_ratti?: number
  stone_price_inr?: number
  making_charge_inr?: number
  total_price_inr?: number
  inventory_quantity?: number
  active?: boolean
}

type Commission = {
  id: string
  vendor_name: string
  product_title: string
  order_id: string
  order_display_id: string
  customer_email: string
  gross_amount_inr: number
  commission_amount_inr: number
  vendor_amount_inr: number
  payout_status: string
  note: string
  created_at: string
}

type VendorUser = {
  id: string
  vendor_id: string
  vendor_name: string
  email: string
  name: string
  active: boolean
  last_login_at?: string
}

const emptyVendor = (): Partial<Vendor> => ({
  name: "Ratna Sagar",
  handle: "ratna-sagar",
  city: "Rewa",
  state: "Madhya Pradesh",
  commission_rate_bps: 2000,
  active: true,
})

const emptyProduct = (vendorId = ""): Partial<GemProduct> => ({
  vendor_id: vendorId,
  title: "",
  handle: "",
  stone_name: "",
  planet: "",
  rashi: "",
  metal: "Silver",
  item_type: "Ring",
  cut: "",
  origin: "",
  treatment: "Natural / disclose if treated",
  certification: "",
  quality_grade: "",
  color_grade: "",
  clarity: "",
  shape: "",
  sku: "",
  lot_number: "",
  purpose: "",
  lab_report_url: "",
  variant_options: [],
  weight_carats: 0,
  weight_ratti: 0,
  size: "",
  price_inr: 0,
  inventory_quantity: 0,
  image_urls: [],
  description: "",
  recommendation_notes: "",
  active: true,
})

const readFileAsBase64 = (file: File) =>
  new Promise<string>((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result || ""))
    reader.onerror = reject
    reader.readAsDataURL(file)
  })

const money = (value: number) =>
  new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 2,
  }).format(Number(value || 0))

const customerPrice = (vendorBase: unknown) =>
  Math.ceil(Number(vendorBase || 0) / 0.8)

const GemstonesPage = () => {
  const [vendors, setVendors] = useState<Vendor[]>([])
  const [products, setProducts] = useState<GemProduct[]>([])
  const [commissions, setCommissions] = useState<Commission[]>([])
  const [vendorUsers, setVendorUsers] = useState<VendorUser[]>([])
  const [vendorDraft, setVendorDraft] = useState<Partial<Vendor>>(emptyVendor())
  const [productDraft, setProductDraft] = useState<Partial<GemProduct>>(emptyProduct())
  const [vendorUserDraft, setVendorUserDraft] = useState<Partial<VendorUser> & { password?: string }>({})
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState("")

  const selectedVendor = useMemo(
    () => vendors.find((vendor) => vendor.id === productDraft.vendor_id),
    [vendors, productDraft.vendor_id]
  )

  const load = async () => {
    setLoading(true)
    setMessage("")

    try {
      const response = await sdk.client.fetch<{
        vendors: Vendor[]
        products: GemProduct[]
        commissions: Commission[]
        vendor_users: VendorUser[]
      }>("/admin/gemstones", {
        method: "GET",
        cache: "no-store",
      })

      setVendors(response.vendors || [])
      setProducts(response.products || [])
      setCommissions(response.commissions || [])
      setVendorUsers(response.vendor_users || [])

      if (!productDraft.vendor_id && response.vendors?.[0]?.id) {
        setProductDraft(emptyProduct(response.vendors[0].id))
      }
    } catch (error: any) {
      setMessage(error?.message || "Unable to load gemstone marketplace.")
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
  }, [])

  const post = async (body: Record<string, unknown>) =>
    sdk.client.fetch("/admin/gemstones", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body,
      cache: "no-store",
    })

  const seedRatnaSagar = async () => {
    setSaving(true)

    try {
      await post({ action: "seed-ratna-sagar" })
      setMessage("Ratna Sagar profile is ready.")
      await load()
    } catch (error: any) {
      setMessage(error?.message || "Could not seed Ratna Sagar.")
    } finally {
      setSaving(false)
    }
  }

  const saveVendor = async () => {
    setSaving(true)

    try {
      await post({
        action: "save-vendor",
        vendor: vendorDraft,
      })
      setMessage("Vendor saved.")
      await load()
    } catch (error: any) {
      setMessage(error?.message || "Could not save vendor.")
    } finally {
      setSaving(false)
    }
  }

  const saveProduct = async () => {
    setSaving(true)

    try {
      await post({
        action: "save-product",
        product: productDraft,
      })
      setMessage("Gemstone product saved.")
      await load()
    } catch (error: any) {
      setMessage(error?.message || "Could not save gemstone product.")
    } finally {
      setSaving(false)
    }
  }

  const updateProductOption = (
    index: number,
    patch: Partial<GemstoneVariantOption>
  ) => {
    const next = [...(productDraft.variant_options || [])]
    next[index] = { ...next[index], ...patch }
    setProductDraft({ ...productDraft, variant_options: next })
  }

  const addProductOption = () => {
    setProductDraft({
      ...productDraft,
      variant_options: [
        ...(productDraft.variant_options || []),
        {
          id: `local-${Date.now()}`,
          label: "",
          form: "Ring",
          metal: productDraft.metal || "Silver",
          size: productDraft.size || "",
          quality_grade: productDraft.quality_grade || "",
          stone_price_inr: Number(productDraft.price_inr || 0),
          making_charge_inr: 0,
          total_price_inr: Number(productDraft.price_inr || 0),
          inventory_quantity: 1,
          active: true,
        },
      ],
    })
  }

  const removeProductOption = (index: number) => {
    setProductDraft({
      ...productDraft,
      variant_options: (productDraft.variant_options || []).filter(
        (_, itemIndex) => itemIndex !== index
      ),
    })
  }

  const saveVendorUser = async () => {
    setSaving(true)

    try {
      await post({
        action: "save-vendor-user",
        vendor_user: vendorUserDraft,
      })
      setMessage("Vendor login saved.")
      setVendorUserDraft({})
      await load()
    } catch (error: any) {
      setMessage(error?.message || "Could not save vendor login.")
    } finally {
      setSaving(false)
    }
  }

  const uploadImage = async (
    file: File,
    onUrl: (url: string) => void,
    fixedBaseName?: string
  ) => {
    setSaving(true)

    try {
      const contentBase64 = await readFileAsBase64(file)
      const response = await post({
        action: "upload-image",
        image_upload: {
          fileName: file.name,
          mimeType: file.type,
          contentBase64,
          fixedBaseName,
        },
      }) as { image?: { url?: string } }

      if (response.image?.url) {
        onUrl(response.image.url)
        setMessage("Image uploaded. Save the vendor/product to keep it.")
      }
    } catch (error: any) {
      setMessage(error?.message || "Image upload failed.")
    } finally {
      setSaving(false)
    }
  }

  const markCommission = async (commission: Commission, payout_status: string) => {
    setSaving(true)

    try {
      await post({
        action: "update-commission",
        commission: {
          id: commission.id,
          payout_status,
          note: commission.note || "Manual payout status updated from admin.",
        },
      })
      await load()
    } catch (error: any) {
      setMessage(error?.message || "Could not update payout status.")
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <Container>
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <Heading level="h1">Gemstone Vendors</Heading>
            <Text className="mt-2 text-ui-fg-subtle">
              Manage vendor substores, gemstone metadata, Medusa variant mapping,
              and 20% Shreem commission ledger.
            </Text>
          </div>
          <div className="flex gap-2">
            <Button variant="secondary" onClick={load} disabled={loading}>
              Reload
            </Button>
            <Button onClick={seedRatnaSagar} isLoading={saving}>
              Seed Ratna Sagar
            </Button>
          </div>
        </div>
        {message && <Text className="mt-3 text-ui-fg-subtle">{message}</Text>}
      </Container>

      <Container className="space-y-4">
        <Heading level="h2">Vendor Profile</Heading>
        <div className="grid gap-4 md:grid-cols-2">
          <div>
            <Label>Existing vendor</Label>
            <Select
              value={vendorDraft.id || ""}
              onValueChange={(id) =>
                setVendorDraft(vendors.find((vendor) => vendor.id === id) || emptyVendor())
              }
            >
              <Select.Trigger>
                <Select.Value placeholder="Create or select vendor" />
              </Select.Trigger>
              <Select.Content>
                {vendors.map((vendor) => (
                  <Select.Item key={vendor.id} value={vendor.id}>
                    {vendor.name}
                  </Select.Item>
                ))}
              </Select.Content>
            </Select>
          </div>
          <div>
            <Label>Vendor name</Label>
            <Input
              value={vendorDraft.name || ""}
              onChange={(event) => setVendorDraft({ ...vendorDraft, name: event.target.value })}
            />
          </div>
          <div>
            <Label>Handle</Label>
            <Input
              value={vendorDraft.handle || ""}
              onChange={(event) => setVendorDraft({ ...vendorDraft, handle: event.target.value })}
              placeholder="ratna-sagar"
            />
          </div>
          <div>
            <Label>Commission bps</Label>
            <Input
              type="number"
              value={vendorDraft.commission_rate_bps || 2000}
              onChange={(event) =>
                setVendorDraft({
                  ...vendorDraft,
                  commission_rate_bps: Number(event.target.value || 2000),
                })
              }
            />
            <Text size="small" className="text-ui-fg-subtle">
              2000 bps = 20% Shreem commission.
            </Text>
          </div>
          <div>
            <Label>Contact email</Label>
            <Input
              value={vendorDraft.contact_email || ""}
              onChange={(event) => setVendorDraft({ ...vendorDraft, contact_email: event.target.value })}
            />
          </div>
          <div>
            <Label>Phone</Label>
            <Input
              value={vendorDraft.contact_phone || ""}
              onChange={(event) => setVendorDraft({ ...vendorDraft, contact_phone: event.target.value })}
            />
          </div>
          <div>
            <Label>City</Label>
            <Input
              value={vendorDraft.city || ""}
              onChange={(event) => setVendorDraft({ ...vendorDraft, city: event.target.value })}
            />
          </div>
          <div>
            <Label>State</Label>
            <Input
              value={vendorDraft.state || ""}
              onChange={(event) => setVendorDraft({ ...vendorDraft, state: event.target.value })}
            />
          </div>
        </div>
        <div className="grid gap-4 md:grid-cols-2">
          <div>
            <Label>Bio</Label>
            <Textarea
              rows={4}
              value={vendorDraft.bio || ""}
              onChange={(event) => setVendorDraft({ ...vendorDraft, bio: event.target.value })}
            />
          </div>
          <div>
            <Label>Trust notes</Label>
            <Textarea
              rows={4}
              value={vendorDraft.trust_notes || ""}
              onChange={(event) => setVendorDraft({ ...vendorDraft, trust_notes: event.target.value })}
            />
          </div>
        </div>
        <div className="grid gap-4 md:grid-cols-2">
          <div>
            <Label>Banner URL</Label>
            <Input
              value={vendorDraft.banner_url || ""}
              onChange={(event) => setVendorDraft({ ...vendorDraft, banner_url: event.target.value })}
            />
            <Input
              className="mt-2"
              type="file"
              accept="image/*"
              onChange={(event) => {
                const file = event.target.files?.[0]
                if (file) {
                  uploadImage(file, (url) => setVendorDraft((current) => ({ ...current, banner_url: url })), `${vendorDraft.handle || "vendor"}-banner`)
                }
              }}
            />
          </div>
          <div>
            <Label>Logo URL</Label>
            <Input
              value={vendorDraft.logo_url || ""}
              onChange={(event) => setVendorDraft({ ...vendorDraft, logo_url: event.target.value })}
            />
            <Input
              className="mt-2"
              type="file"
              accept="image/*"
              onChange={(event) => {
                const file = event.target.files?.[0]
                if (file) {
                  uploadImage(file, (url) => setVendorDraft((current) => ({ ...current, logo_url: url })), `${vendorDraft.handle || "vendor"}-logo`)
                }
              }}
            />
          </div>
        </div>
        <div className="flex items-center justify-between rounded-lg border p-3">
          <div>
            <Label>Vendor active</Label>
            <Text className="text-ui-fg-subtle">Inactive vendors are hidden on storefront.</Text>
          </div>
          <Switch
            checked={vendorDraft.active !== false}
            onCheckedChange={(active) => setVendorDraft({ ...vendorDraft, active })}
          />
        </div>
        <Button onClick={saveVendor} isLoading={saving}>
          Save vendor
        </Button>
      </Container>

      <Container className="space-y-4">
        <Heading level="h2">Vendor Login</Heading>
        <Text className="text-ui-fg-subtle">
          Only Shreem admins can create vendor accounts. Vendors can log into the
          light portal, edit their gemstone listings, and change their password.
          Customer/order details stay hidden from vendors.
        </Text>
        <div className="grid gap-4 md:grid-cols-4">
          <div>
            <Label>Vendor</Label>
            <Select
              value={vendorUserDraft.vendor_id || ""}
              onValueChange={(vendor_id) =>
                setVendorUserDraft({ ...vendorUserDraft, vendor_id })
              }
            >
              <Select.Trigger>
                <Select.Value placeholder="Select vendor" />
              </Select.Trigger>
              <Select.Content>
                {vendors.map((vendor) => (
                  <Select.Item key={vendor.id} value={vendor.id}>
                    {vendor.name}
                  </Select.Item>
                ))}
              </Select.Content>
            </Select>
          </div>
          <div>
            <Label>Name</Label>
            <Input
              value={vendorUserDraft.name || ""}
              onChange={(event) =>
                setVendorUserDraft({ ...vendorUserDraft, name: event.target.value })
              }
            />
          </div>
          <div>
            <Label>Email</Label>
            <Input
              type="email"
              value={vendorUserDraft.email || ""}
              onChange={(event) =>
                setVendorUserDraft({ ...vendorUserDraft, email: event.target.value })
              }
            />
          </div>
          <div>
            <Label>Password</Label>
            <Input
              type="password"
              value={vendorUserDraft.password || ""}
              onChange={(event) =>
                setVendorUserDraft({ ...vendorUserDraft, password: event.target.value })
              }
              placeholder="Min 8 characters"
            />
          </div>
        </div>
        <div className="flex items-center justify-between rounded-lg border p-3">
          <div>
            <Label>Login active</Label>
            <Text className="text-ui-fg-subtle">
              Disable this if the vendor should temporarily lose access.
            </Text>
          </div>
          <Switch
            checked={vendorUserDraft.active !== false}
            onCheckedChange={(active) =>
              setVendorUserDraft({ ...vendorUserDraft, active })
            }
          />
        </div>
        <div className="flex flex-wrap gap-2">
          <Button onClick={saveVendorUser} isLoading={saving}>
            Save vendor login
          </Button>
          <Button
            variant="secondary"
            onClick={() => setVendorUserDraft({})}
          >
            New login
          </Button>
        </div>
        <div className="grid gap-3">
          {vendorUsers.length === 0 ? (
            <Text>No vendor logins created yet.</Text>
          ) : (
            vendorUsers.map((user) => (
              <button
                key={user.id}
                className="rounded-lg border p-4 text-left"
                onClick={() => setVendorUserDraft({ ...user, password: "" })}
              >
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <Text weight="plus">{user.name || user.email}</Text>
                    <Text size="small" className="text-ui-fg-subtle">
                      {user.email} · {user.vendor_name}
                    </Text>
                  </div>
                  <Badge color={user.active ? "green" : "grey"}>
                    {user.active ? "active" : "disabled"}
                  </Badge>
                </div>
              </button>
            ))
          )}
        </div>
      </Container>

      <Container className="space-y-4">
        <Heading level="h2">Gemstone Product</Heading>
        <Text className="text-ui-fg-subtle">
          Create the actual sellable product/variant in Medusa Products first, then paste
          its variant ID here. This keeps checkout, shipping, payment and order history stable.
        </Text>
        <div className="grid gap-4 md:grid-cols-3">
          <div>
            <Label>Vendor</Label>
            <Select
              value={productDraft.vendor_id || ""}
              onValueChange={(vendor_id) => setProductDraft({ ...productDraft, vendor_id })}
            >
              <Select.Trigger>
                <Select.Value placeholder="Select vendor" />
              </Select.Trigger>
              <Select.Content>
                {vendors.map((vendor) => (
                  <Select.Item key={vendor.id} value={vendor.id}>
                    {vendor.name}
                  </Select.Item>
                ))}
              </Select.Content>
            </Select>
          </div>
          <div>
            <Label>Existing product</Label>
            <Select
              value={productDraft.id || ""}
              onValueChange={(id) =>
                setProductDraft(products.find((product) => product.id === id) || emptyProduct(selectedVendor?.id || ""))
              }
            >
              <Select.Trigger>
                <Select.Value placeholder="Create or edit product" />
              </Select.Trigger>
              <Select.Content>
                {products.map((product) => (
                  <Select.Item key={product.id} value={product.id}>
                    {product.title}
                  </Select.Item>
                ))}
              </Select.Content>
            </Select>
          </div>
          <div>
            <Label>Medusa variant ID</Label>
            <Input
              value={productDraft.medusa_variant_id || ""}
              onChange={(event) => setProductDraft({ ...productDraft, medusa_variant_id: event.target.value })}
              placeholder="variant_..."
            />
          </div>
          <div>
            <Label>Title</Label>
            <Input
              value={productDraft.title || ""}
              onChange={(event) => setProductDraft({ ...productDraft, title: event.target.value })}
            />
          </div>
          <div>
            <Label>Handle</Label>
            <Input
              value={productDraft.handle || ""}
              onChange={(event) => setProductDraft({ ...productDraft, handle: event.target.value })}
            />
          </div>
          <div>
            <Label>Stone name</Label>
            <Input
              value={productDraft.stone_name || ""}
              onChange={(event) => setProductDraft({ ...productDraft, stone_name: event.target.value })}
              placeholder="Yellow Sapphire"
            />
          </div>
          {[
            ["Planet", "planet"],
            ["Rashi", "rashi"],
            ["Metal", "metal"],
            ["Ring / Pendant / Loose", "item_type"],
            ["Cut", "cut"],
            ["Origin", "origin"],
            ["Treatment", "treatment"],
            ["Certification", "certification"],
            ["Quality grade", "quality_grade"],
            ["Color grade", "color_grade"],
            ["Clarity", "clarity"],
            ["Shape", "shape"],
            ["SKU", "sku"],
            ["Lot number", "lot_number"],
            ["Purpose / use case", "purpose"],
            ["Lab report URL", "lab_report_url"],
            ["Size", "size"],
          ].map(([label, key]) => (
            <div key={key}>
              <Label>{label}</Label>
              <Input
                value={(productDraft as any)[key] || ""}
                onChange={(event) => setProductDraft({ ...productDraft, [key]: event.target.value })}
              />
            </div>
          ))}
          <div>
            <Label>Weight carats</Label>
            <Input
              type="number"
              value={productDraft.weight_carats || 0}
              onChange={(event) => setProductDraft({ ...productDraft, weight_carats: Number(event.target.value || 0) })}
            />
          </div>
          <div>
            <Label>Weight ratti</Label>
            <Input
              type="number"
              value={productDraft.weight_ratti || 0}
              onChange={(event) => setProductDraft({ ...productDraft, weight_ratti: Number(event.target.value || 0) })}
            />
          </div>
          <div>
            <Label>Display price INR</Label>
            <Input
              type="number"
              value={productDraft.price_inr || 0}
              onChange={(event) => setProductDraft({ ...productDraft, price_inr: Number(event.target.value || 0) })}
            />
          </div>
          <div>
            <Label>Vendor inventory</Label>
            <Input
              type="number"
              value={productDraft.inventory_quantity || 0}
              onChange={(event) => setProductDraft({ ...productDraft, inventory_quantity: Number(event.target.value || 0) })}
            />
          </div>
        </div>
        <div className="rounded-lg border p-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <Heading level="h3">Sellable option matrix</Heading>
              <Text size="small" className="text-ui-fg-subtle">
                Use this for stone only, silver ring by size, gold ring by size,
                pendant, etc. Every option needs its own Medusa variant ID.
              </Text>
            </div>
            <Button size="small" variant="secondary" onClick={addProductOption}>
              Add option
            </Button>
          </div>
          <div className="mt-4 grid gap-4">
            {(productDraft.variant_options || []).map((option, index) => (
              <div key={option.id || index} className="rounded-lg border p-3">
                <div className="mb-3 flex items-center justify-between gap-2">
                  <Text weight="plus">Option {index + 1}</Text>
                  <Button size="small" variant="secondary" onClick={() => removeProductOption(index)}>
                    Remove
                  </Button>
                </div>
                <div className="grid gap-3 md:grid-cols-4">
                  {[
                    ["Label", "label"],
                    ["Variant ID", "medusa_variant_id"],
                    ["Form", "form"],
                    ["Metal", "metal"],
                    ["Size", "size"],
                    ["Quality", "quality_grade"],
                  ].map(([label, key]) => (
                    <div key={key}>
                      <Label>{label}</Label>
                      <Input
                        value={(option as any)[key] || ""}
                        onChange={(event) =>
                          updateProductOption(index, { [key]: event.target.value } as any)
                        }
                      />
                    </div>
                  ))}
                  {[
                    ["Carat", "weight_carats"],
                    ["Ratti", "weight_ratti"],
                    ["Stone price", "stone_price_inr"],
                    ["Making charge", "making_charge_inr"],
                    ["Total price", "total_price_inr"],
                    ["Stock", "inventory_quantity"],
                  ].map(([label, key]) => (
                    <div key={key}>
                      <Label>{label}</Label>
                      <Input
                        type="number"
                        value={(option as any)[key] || 0}
                        onChange={(event) => {
                          const value = Number(event.target.value || 0)
                          const patch: any = { [key]: value }
                          if (key === "stone_price_inr" || key === "making_charge_inr") {
                            const stonePrice =
                              key === "stone_price_inr" ? value : Number(option.stone_price_inr || 0)
                            const makingCharge =
                              key === "making_charge_inr" ? value : Number(option.making_charge_inr || 0)
                            patch.total_price_inr = stonePrice + makingCharge
                          }
                          updateProductOption(index, patch)
                        }}
                      />
                    </div>
                  ))}
                </div>
                <div className="mt-3 flex items-center justify-between rounded-lg border p-3">
                  <div>
                    <Label>Option live</Label>
                    <Text size="small" className="text-ui-fg-subtle">
                      Hidden options do not appear to customers.
                    </Text>
                  </div>
                  <Switch
                    checked={option.active !== false}
                    onCheckedChange={(active) => updateProductOption(index, { active })}
                  />
                </div>
                <Text size="small" className="mt-3 text-ui-fg-subtle">
                  Customer checkout price: {money(customerPrice(option.total_price_inr))}.
                  Keep the mapped Medusa variant price equal to this value.
                </Text>
              </div>
            ))}
            {!(productDraft.variant_options || []).length && (
              <Text className="text-ui-fg-subtle">
                No option matrix yet. The old single variant mapping will be used until options are added.
              </Text>
            )}
          </div>
        </div>
        <div className="grid gap-4 md:grid-cols-2">
          <div>
            <Label>Description</Label>
            <Textarea
              rows={5}
              value={productDraft.description || ""}
              onChange={(event) => setProductDraft({ ...productDraft, description: event.target.value })}
            />
          </div>
          <div>
            <Label>Recommendation notes</Label>
            <Textarea
              rows={5}
              value={productDraft.recommendation_notes || ""}
              onChange={(event) => setProductDraft({ ...productDraft, recommendation_notes: event.target.value })}
            />
          </div>
        </div>
        <div>
          <Label>Image URLs</Label>
          <Textarea
            rows={3}
            value={(productDraft.image_urls || []).join("\n")}
            onChange={(event) =>
              setProductDraft({
                ...productDraft,
                image_urls: event.target.value.split(/\n+/).map((item) => item.trim()).filter(Boolean),
              })
            }
          />
          <Input
            className="mt-2"
            type="file"
            accept="image/*"
            onChange={(event) => {
              const file = event.target.files?.[0]
              if (file) {
                uploadImage(file, (url) =>
                  setProductDraft((current) => ({
                    ...current,
                    image_urls: [...(current.image_urls || []), url],
                  }))
                )
              }
            }}
          />
        </div>
        <div className="flex items-center justify-between rounded-lg border p-3">
          <div>
            <Label>Product active</Label>
            <Text className="text-ui-fg-subtle">Inactive products are hidden on storefront.</Text>
          </div>
          <Switch
            checked={productDraft.active !== false}
            onCheckedChange={(active) => setProductDraft({ ...productDraft, active })}
          />
        </div>
        <div className="flex gap-2">
          <Button onClick={saveProduct} isLoading={saving}>
            Save gemstone product
          </Button>
          <Button variant="secondary" onClick={() => setProductDraft(emptyProduct(selectedVendor?.id || vendors[0]?.id || ""))}>
            New product
          </Button>
        </div>
      </Container>

      <Container className="space-y-4">
        <Heading level="h2">Commission & Manual Payout</Heading>
        <Text className="text-ui-fg-subtle">
          Every matched gemstone order keeps 20% commission for Shreem by default.
          Vendor payout is manual and tracked here.
        </Text>
        <div className="grid gap-3">
          {commissions.length === 0 ? (
            <Text>No gemstone commission entries yet.</Text>
          ) : (
            commissions.map((commission) => (
              <div key={commission.id} className="rounded-lg border p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <Text weight="plus">{commission.vendor_name} · {commission.product_title || "Gemstone"}</Text>
                    <Text size="small" className="text-ui-fg-subtle">
                      Order {commission.order_display_id || commission.order_id} · {commission.customer_email}
                    </Text>
                  </div>
                  <Badge color={commission.payout_status === "paid" ? "green" : "orange"}>
                    {commission.payout_status}
                  </Badge>
                </div>
                <div className="mt-3 grid gap-2 md:grid-cols-3">
                  <Text>Gross: {money(commission.gross_amount_inr)}</Text>
                  <Text>Shreem 20%: {money(commission.commission_amount_inr)}</Text>
                  <Text>Vendor payable: {money(commission.vendor_amount_inr)}</Text>
                </div>
                <div className="mt-3 flex gap-2">
                  <Button size="small" variant="secondary" onClick={() => markCommission(commission, "pending")} disabled={saving}>
                    Pending
                  </Button>
                  <Button size="small" variant="secondary" onClick={() => markCommission(commission, "approved")} disabled={saving}>
                    Approved
                  </Button>
                  <Button size="small" onClick={() => markCommission(commission, "paid")} disabled={saving}>
                    Mark paid
                  </Button>
                </div>
              </div>
            ))
          )}
        </div>
      </Container>
    </div>
  )
}

export const config = defineRouteConfig({
  label: "Gemstones",
})

export default GemstonesPage
