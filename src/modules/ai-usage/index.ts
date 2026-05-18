import { Module } from "@medusajs/framework/utils"

import AiUsageModuleService from "./service"

export const AI_USAGE_MODULE = "aiUsage"

export default Module(AI_USAGE_MODULE, {
  service: AiUsageModuleService,
})
