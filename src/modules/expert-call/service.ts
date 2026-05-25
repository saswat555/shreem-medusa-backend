import { MedusaService } from "@medusajs/framework/utils"
import { ExpertCall } from "./models/expertcall"

class ExpertCallModuleService extends MedusaService({
  ExpertCall,
}) {}

export default ExpertCallModuleService