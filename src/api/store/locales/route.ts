import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"

export const GET = async (_req: MedusaRequest, res: MedusaResponse) => {
  return res.json({
    locales: [
      {
        code: "in",
        name: "India",
        currency_code: "inr",
        countries: [
          {
            iso_2: "in",
            iso_3: "ind",
            num_code: "356",
            name: "India",
            display_name: "India",
          },
        ],
      },
    ],
    default_locale: "in",
  })
}
