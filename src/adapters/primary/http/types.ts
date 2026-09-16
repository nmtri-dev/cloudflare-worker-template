import { AccessManagementService, AppVariables } from "../../../core/ports";
import { D1Database } from "@cloudflare/workers-types";

export type AppEnv = {
  Bindings: CloudflareBindings & {
    ALLOWED_ORIGINS: string;
    JWT_PUBLIC_KEY: string;
    ACCESS_MGMT: Fetcher & AccessManagementService;
    DB: D1Database;
    // cf-typegen emits RATE_LIMITER as optional in the generated
    // Cloudflare.Env surface; the app always wires it (wrangler.jsonc /
    // Terraform), so it is declared required here.
    RATE_LIMITER: RateLimit;
  };
  Variables: AppVariables;
};
