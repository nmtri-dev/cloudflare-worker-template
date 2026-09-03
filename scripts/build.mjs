/**
 * Production bundle build for the Cloudflare Worker Template.
 *
 * Produces `dist/worker.js` — a single ESM module that Terraform uploads via
 * `cloudflare_workers_script.content` (see the `main.tf` under `terraform/`).
 *
 * The JWT public key is NOT bundled into the worker. It is provided at
 * runtime as the `JWT_PUBLIC_KEY` Worker variable — locally via `.dev.vars`,
 * in deployed environments via Terraform (sourced from the GitHub Environment
 * vars). The build is therefore environment-agnostic: the same
 * `dist/worker.js` artifact is used for all environments.
 */
import { build } from "esbuild";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");

console.log("Building dist/worker.js");

await build({
  entryPoints: [path.join(root, "src", "index.ts")],
  bundle: true,
  minify: true,
  format: "esm",
  outfile: path.join(root, "dist", "worker.js"),
  // `node:*` and `cloudflare:workers` are provided by the Workers runtime
  // (nodejs_compat compatibility flag).
  external: ["node:*", "cloudflare:workers"],
  logLevel: "info",
});
