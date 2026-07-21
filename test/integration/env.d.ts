declare module "cloudflare:test" {
  interface ProvidedEnv extends CloudflareBindings {
    CREDIT_DB: D1Database;
  }
}
