import { loadEnv, defineConfig, Modules, ContainerRegistrationKeys } from "@medusajs/framework/utils"
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
const adminCacheVersion =
  process.env.SHREEM_ADMIN_CACHE_VERSION || "2026-06-23-ai-wallet-cache-v2"
const shouldDisableBundledAdmin =
  process.env.MEDUSA_ADMIN_DISABLED === "true" ||
  process.env.SHREEM_DISABLE_BUNDLED_ADMIN === "true"

const readRootEnvValue = (key: string) => {
  try {
    const envPath = path.resolve(projectRoot, ".env")
    const raw = fs.readFileSync(envPath, "utf8")
    const line = raw
      .split(/\r?\n/)
      .find((entry) => entry.trim().startsWith(`${key}=`))

    if (!line) {
      return process.env[key]
    }

    return line
      .slice(line.indexOf("=") + 1)
      .trim()
      .replace(/^['"]|['"]$/g, "")
  } catch {
    return process.env[key]
  }
}

const requireEnvValue = (key: string) => {
  const value = process.env[key]

  if (nodeEnv === "production" && !value) {
    throw new Error(`${key} is required in production`)
  }

  return value || ""
}

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

const adminSessionGuardPlugin = () => ({
  name: "shreem-admin-session-guard",
  transformIndexHtml: {
    order: "pre" as const,
    handler: () => [
      {
        tag: "script",
        injectTo: "head" as const,
        children: `(() => {
  const startedAtKey = "shreem_admin_session_started_at_v1";
  const cacheVersionKey = "shreem_admin_cache_version_v1";
  const cacheVersion = ${JSON.stringify(adminCacheVersion)};
  const maxSessionMs = 60 * 60 * 1000;

  const removeExpiredJwtValues = (storage) => {
    if (!storage) return;
    for (let index = storage.length - 1; index >= 0; index -= 1) {
      const key = storage.key(index);
      if (!key || !/(token|auth|medusa)/i.test(key)) continue;
      const value = storage.getItem(key) || "";
      const jwt = value.match(/eyJ[A-Za-z0-9_-]+\\.eyJ[A-Za-z0-9_-]+\\.[A-Za-z0-9_-]+/)?.[0];
      if (!jwt) continue;
      try {
        const encoded = jwt.split(".")[1].replace(/-/g, "+").replace(/_/g, "/");
        const padded = encoded.padEnd(Math.ceil(encoded.length / 4) * 4, "=");
        const payload = JSON.parse(atob(padded));
        if (Number(payload.exp || 0) * 1000 <= Date.now()) storage.removeItem(key);
      } catch {}
    }
  };

  const removeAdminAuthValues = (storage) => {
    if (!storage) return;
    for (let index = storage.length - 1; index >= 0; index -= 1) {
      const key = storage.key(index);
      if (key && /(token|auth|medusa)/i.test(key)) storage.removeItem(key);
    }
  };

  const clearStaleAdminState = async () => {
    removeExpiredJwtValues(window.localStorage);
    removeExpiredJwtValues(window.sessionStorage);
    if ("caches" in window) {
      const names = await caches.keys();
      await Promise.all(names
        .filter((name) => /^shreem-|admin|medusa|dashboard/i.test(name))
        .map((name) => caches.delete(name)));
    }
    if ("serviceWorker" in navigator) {
      const registrations = await navigator.serviceWorker.getRegistrations();
      await Promise.all(registrations.map((registration) => registration.update().catch(() => undefined)));
    }
  };

  const handleAdminVersion = async () => {
    const previousVersion = window.localStorage.getItem(cacheVersionKey) || "";
    if (previousVersion === cacheVersion) return;
    await clearStaleAdminState();
    window.localStorage.setItem(cacheVersionKey, cacheVersion);
    if (!window.location.search.includes("_admin_cache_v=")) {
      const url = new URL(window.location.href);
      url.searchParams.set("_admin_cache_v", cacheVersion);
      window.location.replace(url.toString());
    }
  };

  const nativeFetch = window.fetch.bind(window);
  window.fetch = async (input, init) => {
    const response = await nativeFetch(input, init);
    const url = typeof input === "string" ? input : input?.url || "";
    if (response.status === 401 && /\\/admin\\/|\\/admin$|\\/admin\\/users\\/me/.test(url)) {
      removeAdminAuthValues(window.localStorage);
      removeAdminAuthValues(window.sessionStorage);
      window.sessionStorage.removeItem(startedAtKey);
      window.location.replace("/app/login?expired=1");
    }
    return response;
  };

  const logout = async () => {
    try {
      await fetch("/auth/session", { method: "DELETE", credentials: "include", cache: "no-store" });
    } catch {}
    removeAdminAuthValues(window.localStorage);
    removeAdminAuthValues(window.sessionStorage);
    window.sessionStorage.removeItem(startedAtKey);
    window.location.replace("/app/login");
  };

  let startedAt = Number(window.sessionStorage.getItem(startedAtKey) || 0);
  if (!startedAt || startedAt > Date.now()) {
    startedAt = Date.now();
    window.sessionStorage.setItem(startedAtKey, String(startedAt));
    handleAdminVersion().catch(() => undefined);
  } else {
    removeExpiredJwtValues(window.localStorage);
    removeExpiredJwtValues(window.sessionStorage);
    handleAdminVersion().catch(() => undefined);
  }

  const remaining = maxSessionMs - (Date.now() - startedAt);
  if (remaining <= 0) logout();
  else window.setTimeout(logout, remaining);

  window.addEventListener("focus", () => {
    if (Date.now() - startedAt >= maxSessionMs) logout();
  });
})();`,
      },
    ],
  },
})

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
            }
],
        },
      }
]
  : []

export default defineConfig({
  projectConfig: {
    databaseUrl: process.env.DATABASE_URL,
    redisUrl,
    redisPrefix: process.env.REDIS_PREFIX || "shreem:",
    sessionOptions: {
      ttl: 60 * 60 * 1000,
      rolling: false,
      resave: false,
      saveUninitialized: false,
    },
    http: {
      storeCors: process.env.STORE_CORS!,
      adminCors: process.env.ADMIN_CORS!,
      authCors: process.env.AUTH_CORS!,
      jwtSecret: requireEnvValue("JWT_SECRET") || "development-jwt-secret",
      cookieSecret: requireEnvValue("COOKIE_SECRET") || "development-cookie-secret",
    },
  },

  admin: {
    disable: shouldDisableBundledAdmin,
    vite: () => ({
      plugins: [adminSessionGuardPlugin()],
      server: {
        allowedHosts: ["www.shreemfarms.in", "shreemfarms.in", "92.4.81.69"],
      },
    }),
  },

  modules: [
    {
      resolve: "@medusajs/medusa/auth",
      dependencies: [Modules.CACHE, ContainerRegistrationKeys.LOGGER],
      options: {
        providers: [
          {
            resolve: "@medusajs/medusa/auth-emailpass",
            id: "emailpass",
          },
          {
            resolve: "@medusajs/medusa/auth-google",
            id: "google",
            options: {
              clientId: process.env.GOOGLE_CLIENT_ID,
              clientSecret: process.env.GOOGLE_CLIENT_SECRET,
              callbackUrl: process.env.GOOGLE_CALLBACK_URL,
            },
          }
],
      },
    },

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
          }
],
      },
    },

    {
      resolve: "@medusajs/medusa/payment",
      options: {
        providers: [
          {
            resolve: "./src/modules/razorpay",
            id: "razorpay",
            options: {
              key_id: readRootEnvValue("RAZORPAY_KEY_ID"),
              key_secret: readRootEnvValue("RAZORPAY_KEY_SECRET"),
            },
          },
          {
            resolve: "./src/modules/manual-upi",
            id: "manual_upi",
            options: {
              upiId: process.env.MANUAL_UPI_ID,
              payeeName: process.env.MANUAL_UPI_PAYEE_NAME,
              qrImageUrl: process.env.MANUAL_UPI_QR_IMAGE_URL,
            },
          }
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
          }
],
      },
    },

    {
      resolve: "./src/modules/ai-usage",
    },
    {
      resolve: "./src/modules/ai-wallet",
    },
    {
      resolve: "./src/modules/expert-call",
    },
    ...redisModules
],
})
