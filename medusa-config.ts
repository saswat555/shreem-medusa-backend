import { loadEnv, defineConfig } from "@medusajs/framework/utils"
import fs from "node:fs"
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
const projectRoot = isBuiltServer ? path.resolve(cwd, "../..") : cwd
const configuredUploadDir =
  process.env.FILE_UPLOAD_DIR || process.env.LOCAL_FILE_UPLOAD_DIR || "static"
const persistentStaticDir = path.isAbsolute(configuredUploadDir)
  ? configuredUploadDir
  : path.resolve(projectRoot, configuredUploadDir)
const runtimeStaticDir = path.resolve(cwd, "static")

const ensureStaticUploadDir = () => {
  try {
    fs.mkdirSync(persistentStaticDir, { recursive: true })

    if (!isBuiltServer) {
      return
    }

    if (fs.existsSync(runtimeStaticDir)) {
      const runtimeStat = fs.lstatSync(runtimeStaticDir)

      if (runtimeStat.isSymbolicLink()) {
        return
      }

      const runtimeRealPath = fs.realpathSync(runtimeStaticDir)
      const persistentRealPath = fs.realpathSync(persistentStaticDir)

      if (runtimeRealPath === persistentRealPath) {
        return
      }

      fs.cpSync(runtimeStaticDir, persistentStaticDir, {
        recursive: true,
        force: false,
        errorOnExist: false,
      })
      fs.renameSync(
        runtimeStaticDir,
        `${runtimeStaticDir}.migrated-${Date.now()}`
      )
    }

    fs.symlinkSync(path.relative(cwd, persistentStaticDir), runtimeStaticDir, "dir")
  } catch (error) {
    console.warn("Unable to prepare persistent static upload directory", error)
  }
}

ensureStaticUploadDir()

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
              upload_dir: isBuiltServer ? runtimeStaticDir : persistentStaticDir,
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
    {
      resolve: "./src/modules/ai-wallet",
    },
    ...redisModules,
  ],
})
