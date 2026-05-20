import { Module } from "@medusajs/framework/utils"

import AiWalletModuleService from "./service"

export const AI_WALLET_MODULE = "aiWallet"

export default Module(AI_WALLET_MODULE, {
  service: AiWalletModuleService,
})
