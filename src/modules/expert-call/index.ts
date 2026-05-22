import ExpertCallModuleService from "./service"
import { Module } from "@medusajs/framework/utils"

export const EXPERT_CALL_MODULE = "expert-call"

export default Module(EXPERT_CALL_MODULE, {
  service: ExpertCallModuleService,
})