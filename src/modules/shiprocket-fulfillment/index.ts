import type { ModuleProviderExports } from "@medusajs/framework/types"
import ShiprocketFulfillmentProviderService from "./service"

const services = [ShiprocketFulfillmentProviderService]

const providerExport: ModuleProviderExports = {
  services,
}

export default providerExport
