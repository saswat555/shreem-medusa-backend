import { MedusaService } from "@medusajs/framework/utils"

import AiUsageLog from "./models/ai-usage-log"

class AiUsageModuleService extends MedusaService({
  AiUsageLog,
}) {}

export default AiUsageModuleService
