declare module "cloudflare:test" {
  interface ProvidedEnv extends CloudflareBindings {
    DB: D1Database;
    TEST_MIGRATIONS: D1Migration[];
  }
}
