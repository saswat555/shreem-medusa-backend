import { MedusaService } from "@medusajs/framework/utils"
import { ExpertCall } from "./models/expert-call"

class ExpertCallModuleService extends MedusaService({
  ExpertCall,
}) {}

export default ExpertCallModuleService