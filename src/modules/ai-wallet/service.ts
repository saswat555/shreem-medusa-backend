import { MedusaService } from "@medusajs/framework/utils"

import AiCreditLedger from "./models/ai-credit-ledger"
import AiWallet from "./models/ai-wallet"

class AiWalletModuleService extends MedusaService({
  AiWallet,
  AiCreditLedger,
}) {}

export default AiWalletModuleService
