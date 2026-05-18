import { loadEnv, defineConfig } from "@medusajs/framework/utils"

loadEnv(process.env.NODE_ENV || "development", process.cwd())

module.exports = defineConfig({
  projectConfig: {
    databaseUrl: process.env.DATABASE_URL,
    http: {
      storeCors: process.env.STORE_CORS!,
      adminCors: process.env.ADMIN_CORS!,
      authCors: process.env.AUTH_CORS!,
      jwtSecret: process.env.JWT_SECRET || "supersecret",
      cookieSecret: process.env.COOKIE_SECRET || "supersecret",
    },
  },

  admin: {
    vite: () => ({
      server: {
        allowedHosts: ["www.shreemfarms.in", "shreemfarms.in", "92.4.81.69"],
      },
    }),
  },

  modules: [
    {
      resolve: "@medusajs/medusa/file",
      options: {
        providers: [
          {
            resolve: "@medusajs/medusa/file-local",
            id: "local",
            options: {
              upload_dir: "static",
              backend_url: process.env.MEDUSA_BACKEND_URL + "/static",
            },
          },
        ],
      },
    },

    {
      resolve: "@medusajs/medusa/payment",
      options: {
        providers: [
          {
            resolve: "./src/modules/phonepe",
            id: "phonepe",
            options: {
              clientId: process.env.PHONEPE_CLIENT_ID,
              clientSecret: process.env.PHONEPE_CLIENT_SECRET,
            },
          },
        ],
      },
    },

    {
      resolve: "@medusajs/medusa/fulfillment",
      options: {
        providers: [
          {
            resolve: "@medusajs/medusa/fulfillment-manual",
            id: "manual",
          },
          {
            resolve: "./src/modules/shiprocket-fulfillment",
            id: "shiprocket",
          },
        ],
      },
    },

    {
      resolve: "./src/modules/ai-usage",
    },
  ],
})
