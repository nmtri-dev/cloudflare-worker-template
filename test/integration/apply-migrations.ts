import { applyD1Migrations } from "cloudflare:test";
import { env } from "cloudflare:workers";

/**
 * D1 migration setup for integration tests.
 *
 * The migrations are read at config time by `readD1Migrations()` in
 * `vitest.integration.config.mts` (which uses wrangler's own
 * `unstable_splitSqlQuery`) and injected as the `TEST_MIGRATIONS` binding, so
 * the test schema setup can never drift from the production migrations.
 *
 * Setup files run outside the per-test-file storage isolation, and may be run
 * multiple times. `applyD1Migrations()` only applies migrations that haven't
 * already been applied, therefore it is safe to call this function here.
 */
await applyD1Migrations(env.DB, env.TEST_MIGRATIONS);
