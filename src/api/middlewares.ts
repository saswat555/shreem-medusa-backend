import {
  authenticate,
  defineMiddlewares,
  type MedusaNextFunction,
  type MedusaRequest,
  type MedusaResponse,
} from "@medusajs/framework/http"

const noStoreAdminCache = (
  _req: MedusaRequest,
  res: MedusaResponse,
  next: MedusaNextFunction
) => {
  res.setHeader(
    "Cache-Control",
    "no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0, s-maxage=0"
  )
  res.setHeader("Pragma", "no-cache")
  res.setHeader("Expires", "0")
  res.setHeader("Surrogate-Control", "no-store")
  next()
}

export default defineMiddlewares({
  routes: [
    {
      matcher: /^\/app(\/.*)?$/,
      middlewares: [noStoreAdminCache],
    },
    {
      matcher: /^\/admin(\/.*)?$/,
      middlewares: [noStoreAdminCache],
    },
    {
      matcher: "/admin/blog/upload-image",
      methods: ["POST"],
      bodyParser: {
        sizeLimit: "12mb",
      },
    },
    {
      matcher: "/admin/manual-upi/qr",
      methods: ["POST"],
      bodyParser: {
        sizeLimit: "12mb",
      },
    },
    {
      matcher: "/hooks/razorpay",
      methods: ["POST"],
      bodyParser: false,
    },

    /**
     * Admin AI Usage page.
     * Without this, /admin/ai-usage returns 401 because auth_context is missing.
     */
    {
      matcher: /^\/admin\/ai-usage(\/.*)?$/,
      middlewares: [authenticate("user", ["session", "bearer"])],
    },
    {
      matcher: /^\/admin\/site-analytics(\/.*)?$/,
      middlewares: [authenticate("user", ["session", "bearer"])],
    },
    {
      matcher: /^\/admin\/marketing-config(\/.*)?$/,
      middlewares: [authenticate("user", ["session", "bearer"])],
    },
    {
      matcher: /^\/admin\/ai-wallet(\/.*)?$/,
      middlewares: [authenticate("user", ["session", "bearer"])],
    },

    /**
     * Store/customer AI usage.
     */
    {
      matcher: /^\/store\/ai-usage\/?$/,
      middlewares: [authenticate("customer", ["session", "bearer"], {
        allowUnregistered: true,
      })],
    },

    {
      matcher: /^\/store\/ai-wallet(\/.*)?$/,
      middlewares: [authenticate("customer", ["session", "bearer"])],
    },
    {
      matcher: /^\/store\/auth\/email-verification\/(request|status)\/?$/,
      middlewares: [authenticate("customer", ["session", "bearer"])],
    },
    {
      matcher: /^\/admin\/mail(\/.*)?$/,
      middlewares: [authenticate("user", ["session", "bearer"])],
    },
    {
      matcher: /^\/admin\/manual-upi(\/.*)?$/,
      middlewares: [authenticate("user", ["session", "bearer"])],
    },
    {
      matcher: "/admin/blog/upload-image",
      middlewares: [authenticate("user", ["session", "bearer"])],
    },
    {
      matcher: /^\/admin\/blog(\/.*)?$/,
      middlewares: [authenticate("user", ["session", "bearer"])],
    },
    {
      matcher: /^\/admin\/journal(\/.*)?$/,
      middlewares: [authenticate("user", ["session", "bearer"])],
    },
  ],
})
