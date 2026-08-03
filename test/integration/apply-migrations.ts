import { env, applyD1Migrations } from "cloudflare:test";

// Applies the real migrations from ./migrations to the test D1 database.
// Safe to run multiple times (migrations are idempotent / tracked).
await applyD1Migrations(env.DB, env.TEST_MIGRATIONS);
