declare module "cloudflare:test" {
  interface ProvidedEnv extends CloudflareBindings {
    DB: D1Database;
    TEST_MIGRATIONS: import("cloudflare:test").D1Migration[]; // Defined in `vitest.integration.config.mts`
  }
}
