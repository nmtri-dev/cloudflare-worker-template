import { cloudflareTest } from "@cloudflare/vitest-pool-workers";
import { defineConfig } from "vitest/config";

// Test RSA public key — corresponds to the private key in test/integration/helpers/jwt.ts.
// Used by the authenticationMiddleware when JWT_TEST_PUBLIC_KEY is present in the env.
const TEST_PUBLIC_KEY = `-----BEGIN PUBLIC KEY-----
MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEA5DfZh1oSrJ3K7BVTZxQH
gaNTXEu/1jTfoPIwoTRWCbKzy220Ua+z0C5i+oLxno9KxhMnsnC9VYp/O2RUPkKK
bD4WY1TCCZ4WINbf/a0jzjGiduTC/hCCZyel8KQL9cGwrG01zOZrBpoyJrWGh6n3
qjGM70YdON9zVQBbPsLBTIjwhX3R2S0jsamC8+ptS/f8gVAJqEGpMuWLFmgnEw++
yxi0VG/QCYFSm7B9SSFFSuV9/QOy35ltFNOmJtAch3wy5XvavOHJmLhYDrNfEDKb
IXbUvnTdN011VAj4vtNYC07rYI8jJRMqHYg2O+c92xuNCsTbMy7xAITF/UnBGQUC
5QIDAQAB
-----END PUBLIC KEY-----`;

export default defineConfig({
  plugins: [
    cloudflareTest({
      wrangler: { configPath: "./wrangler.test.jsonc" },
      miniflare: {
        // Inject the test public key so the auth middleware uses it during tests.
        bindings: {
          JWT_TEST_PUBLIC_KEY: TEST_PUBLIC_KEY,
        },
        d1Databases: ["CREDIT_DB"],
        // Provide a mock for the ACCESS_MGMT service binding (RPC — always authorises).
        workers: [
          {
            name: "cardy-ai-access-management-local",
            compatibilityDate: "2024-01-01",
            modules: true,
            script: `
              import { WorkerEntrypoint } from 'cloudflare:workers';
              export default class extends WorkerEntrypoint {
                async authorize() {}
              }
            `,
          },
        ],
        // Mock queue for CREDIT_RESET_QUEUE binding
        queues: {
          consumers: [
            {
              queue: "credit-reset-queue",
              maxRetries: 3,
            },
          ],
          producers: [
            {
              binding: "CREDIT_RESET_QUEUE",
              queue: "credit-reset-queue",
            },
          ],
        },
      },
    }),
  ],
  test: {
    include: ["test/integration/**/*.spec.ts"],
  },
});
