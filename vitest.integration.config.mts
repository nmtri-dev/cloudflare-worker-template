import { cloudflareTest } from "@cloudflare/vitest-pool-workers";
import { defineConfig } from "vitest/config";

// Test RSA public key — corresponds to the private key in test/integration/helpers/jwt.ts.
// Used by the authenticationMiddleware when JWT_TEST_PUBLIC_KEY is present in the env.
const TEST_PUBLIC_KEY = `-----BEGIN PUBLIC KEY-----
MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEAoQDO4lxTDBX6i6ZPrhQe
oRQ3HHIB+iQv1mK83yqRP+R/dii0iKgMCG5XBnb63yZTuQRYSGHvfD6JhUSCJVTr
GRf1g/99oMd0/OkL1GTw9GtcQPrURy/RRlJsSESPM2qlOjZJS7X7YQcgvnz5tVt5
81cBQrWM5DxDZyyr2tp6IXJAJ5FmxujiRRXexBGVxYnFC30WGDDAMD4Ng8Zh0b/I
VhhYo9UMCH4eVm3eaGi5VznyuU7SaHO3hoteKQ6/sJlqxFgJ36FZySSOOJaAE0lS
buo3Qf46J9uRQn/puG67OD4dMe1p33SiDxh7jR/YFHEuXCCdXcEKR46DH3U66Tsz
IwIDAQAB
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
      },
    }),
  ],
  test: {
    include: ["test/integration/**/*.spec.ts"],
  },
});
