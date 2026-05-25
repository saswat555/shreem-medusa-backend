import { authenticate, defineMiddlewares } from "@medusajs/framework/http"

export default defineMiddlewares({
  routes: [
    {
      matcher: /^\/store\/ai-usage\/?$/,
      middlewares: [authenticate("customer", ["session", "bearer"])],
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
      matcher: /^\/admin\/ai-usage(\/.*)?$/,
      middlewares: [authenticate("user", ["session", "bearer"])],
    },
    {
      matcher: /^\/admin\/ai-wallet(\/.*)?$/,
      middlewares: [authenticate("user", ["session", "bearer"])],
    },
    {
      matcher: /^\/admin\/mail(\/.*)?$/,
      middlewares: [authenticate("user", ["session", "bearer"])],
    },
    {
      matcher: /^\/admin\/shiprocket(\/.*)?$/,
      middlewares: [authenticate("user", ["session", "bearer"])],
    },
    {
      matcher: /^\/admin\/manual-upi(\/.*)?$/,
      middlewares: [authenticate("user", ["session", "bearer"])],
    },
    {
      matcher: /^\/admin\/(blog\/upload-image|manual-upi\/qr)\/?$/,
      bodyParser: {
        sizeLimit: "12mb",
      },
    },
    {
      matcher: /^\/admin\/journal(\/.*)?$/,
      middlewares: [authenticate("user", ["session", "bearer"])],
    },
    {
      matcher: /^\/admin\/blog(\/.*)?$/,
      middlewares: [authenticate("user", ["session", "bearer"])],
    },
  ],
})
