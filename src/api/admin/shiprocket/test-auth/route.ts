import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import {
  getCheapestShiprocketRate,
  getShiprocketConfigStatus,
  isShiprocketApiError,
  testShiprocketConnection,
} from "../../../../lib/shiprocket/client"

const summarizeServiceability = (data: any) => {
  const companies =
    data?.data?.available_courier_companies ||
    data?.available_courier_companies ||
    []

  return {
    status: data?.status,
    available_couriers: Array.isArray(companies) ? companies.length : 0,
    recommended_courier_company_id:
      data?.data?.recommended_courier_company_id ||
      data?.recommended_courier_company_id ||
      null,
    cheapest: getCheapestShiprocketRate(data),
    sample_couriers: Array.isArray(companies)
      ? companies.slice(0, 3).map((company: any) => ({
          courier_company_id: company.courier_company_id,
          courier_name: company.courier_name,
          rate:
            company.rate ??
            company.freight_charge ??
            company.estimated_charges ??
            null,
          etd: company.etd ?? null,
        }))
      : [],
  }
}

const handler = async (_req: MedusaRequest, res: MedusaResponse) => {
  try {
    const { auth_mode, data, test, token } = await testShiprocketConnection()

    return res.json({
      ok: true,
      auth_mode,
      config: getShiprocketConfigStatus(),
      token_preview: `${token.slice(0, 10)}...${token.slice(-6)}`,
      test,
      serviceability: summarizeServiceability(data),
    })
  } catch (e: any) {
    return res.status(isShiprocketApiError(e) ? e.status : 500).json({
      ok: false,
      error: e.message || "Shiprocket auth failed",
      shiprocket_status: isShiprocketApiError(e) ? e.status : undefined,
      shiprocket_error: isShiprocketApiError(e) ? e.data : undefined,
      shiprocket_path: isShiprocketApiError(e) ? e.path : undefined,
      config: getShiprocketConfigStatus(),
    })
  }
}

export const GET = handler
export const POST = handler
