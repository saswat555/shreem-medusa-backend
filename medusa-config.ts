import { loadEnv, defineConfig } from "@medusajs/framework/utils"
import path from "node:path"

const nodeEnv = process.env.NODE_ENV || "development"
const cwd = process.cwd()
const isBuiltServer =
  path.basename(cwd) === "server" && path.basename(path.dirname(cwd)) === ".medusa"

if (isBuiltServer) {
  loadEnv(nodeEnv, path.resolve(cwd, "../.."))
}

loadEnv(nodeEnv, cwd)

const redisUrl = process.env.REDIS_URL

const redisModules = redisUrl
  ? [
      {
        resolve: "@medusajs/medusa/workflow-engine-redis",
        options: {
          redis: {
            redisUrl,
          },
        },
      },
      {
        resolve: "@medusajs/medusa/cache-redis",
        options: {
          redisUrl,
        },
      },
      {
        resolve: "@medusajs/medusa/event-bus-redis",
        options: {
          redisUrl,
          workerOptions: {
            concurrency: 1,
          },
        },
      },
      {
        resolve: "@medusajs/medusa/locking",
        options: {
          providers: [
            {
              id: "locking-redis",
              resolve: "@medusajs/medusa/locking-redis",
              is_default: true,
              options: {
                redisUrl,
              },
            },
          ],
        },
      },
    ]
  : []

module.exports = defineConfig({
  projectConfig: {
    databaseUrl: process.env.DATABASE_URL,
    redisUrl,
    redisPrefix: process.env.REDIS_PREFIX || "shreem:",
    sessionOptions: {
      name: process.env.SESSION_NAME || "shreem.sid",
      resave: false,
      saveUninitialized: false,
    },
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
    ...redisModules,
  ],
})
