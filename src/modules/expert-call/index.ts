import ExpertCallModuleService from "./service"
import { Module } from "@medusajs/framework/utils"

export const EXPERT_CALL_MODULE = "expertcall"

export default Module(EXPERT_CALL_MODULE, {
  service: ExpertCallModuleService,
})