import path from "node:path";
import {
  cloudflareTest,
  readD1Migrations,
} from "@cloudflare/vitest-pool-workers";
import { defineConfig } from "vitest/config";

// Test RSA public key — corresponds to the private key in test/integration/helpers/jwt.ts.
// Used by the authenticationMiddleware when JWT_TEST_PUBLIC_KEY is present in the env.
const TEST_PUBLIC_KEY = `-----BEGIN PUBLIC KEY-----
MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEAud3tnWh4XEVUsA952xWV
y6SB7vPFf1GO9dtSFspDJhqxeEfrNfcfPQj6iG97LAjFf1/dIe/0gWw/lDb6UwrO
Hx1ez0sDFdLYM5GM1Q9qetmERcNihvz8MxWjvhxtoelamj0jmnzugjF/M1flraw2
KXb0Byorpi4jsrskjza6+KRgxP/3yG57znrbVnqQyI3qGBaMz/mRLtia54iqva3/
7nzCSU+CbsbSb+edIwqIOyQv9dg1ZXzixsxUX8s2aheo0/aZ8+6hOPop1CtE+Kba
mnrxQ1jnTkWvCZgG/NNS06FG9B6Al0a2NXGPbDNZIkySUYJ7XRAUXxRee1NTbWit
FwIDAQAB
-----END PUBLIC KEY-----`;

export default defineConfig(async () => {
  // Read all migrations in the `migrations` directory. Uses wrangler's own
  // `unstable_splitSqlQuery` (via `readD1Migrations`) so the test schema setup
  // can never drift from the production migrations — no vendored SQL splitter.
  const migrationsPath = path.join(import.meta.dirname, "migrations");
  const migrations = await readD1Migrations(migrationsPath);

  return {
    plugins: [
      cloudflareTest({
        wrangler: { configPath: "./wrangler.test.jsonc" },
        miniflare: {
          // Inject the test public key so the auth middleware uses it during tests.
          bindings: {
            JWT_TEST_PUBLIC_KEY: TEST_PUBLIC_KEY,
            // Test-only binding so `applyD1Migrations` can be called from a setup file.
            TEST_MIGRATIONS: migrations,
          },
          d1Databases: ["DB"],
          // Provide a mock for the ACCESS_MGMT service binding (RPC — always
          // authorises). The named entrypoint must match the binding declared
          // in wrangler.jsonc / wrangler.test.jsonc
          // (`AccessManagementEntrypoint`).
          workers: [
            {
              name: "cardy-ai-access-management-local",
              compatibilityDate: "2024-01-01",
              modules: true,
              script: `
                import { WorkerEntrypoint } from 'cloudflare:workers';
                export class AccessManagementEntrypoint extends WorkerEntrypoint {
                  async authorize() {}
                }
                export default AccessManagementEntrypoint;
              `,
            },
          ],
        },
      }),
    ],
    test: {
      include: ["test/integration/**/*.spec.ts"],
      setupFiles: ["./test/integration/apply-migrations.ts"],
    },
  };
});
