import { ExecArgs } from "@medusajs/framework/types"
import { updateProductsWorkflow } from "@medusajs/core-flows"

const NEEM_DHOOP_ID = "prod_01KTHVVE35MAFBQB558C1BDW8J"
const COW_DUNG_CAKES_ID = "prod_01KTHT779WQ4238J6MHD92BSAA"

export default async function fixProductCatalogConsistency({
  container,
}: ExecArgs) {
  const products = [
    {
      id: NEEM_DHOOP_ID,
      title: "Organic Neem Dhoop - 15 Cones",
      handle: "organic-neem-dhoop",
      description:
        "Shreem Neem Dhoop Battis are cow dung-based herbal dhoop cones made with neem, gond, til oil, and hawan samagri powder for pooja, dhooni, and daily traditional rituals. Each pack contains 15 cone-shaped dhoop battis in easy-to-store cardboard packaging. Place one cone in a heat-safe dhoop stand, light the tip, let the flame settle, and use it in a ventilated space during morning or evening pooja. Store the remaining cones sealed and dry. This product is intended for ritual fragrance and is not presented as a medical treatment or insect-control product.",
    },
    {
      id: COW_DUNG_CAKES_ID,
      title: "Vedic Cow Dung Cakes - Pack of 6",
      description:
        "Shreem Cow Dung Cakes are sun-dried traditional discs made for hawan, pooja, dhooni, agnihotra, and ceremonial fire use. This listing contains one pack of 6 cakes, each formed in a practical disc shape for storage and handling. Keep the pack dry, burn only in a heat-safe havan kund or burner, maintain ventilation, and never leave a flame unattended. The cakes contain no added synthetic fragrance and are packed for simple household ritual use.",
    },
  ]

  const { result } = await updateProductsWorkflow(container).run({
    input: { products },
  })

  console.log(
    "[catalog-consistency] updated",
    result.map((product) => ({
      id: product.id,
      title: product.title,
      handle: product.handle,
    }))
  )
}
