import { ModuleProvider, Modules } from "@medusajs/framework/utils"

import ManualUpiPaymentProviderService from "./service"

export default ModuleProvider(Modules.PAYMENT, {
  services: [ManualUpiPaymentProviderService],
})
