import { AccessManagementService, AppVariables } from "../../../core/ports";
import { D1Database } from "@cloudflare/workers-types";

export type AppEnv = {
  Bindings: CloudflareBindings & {
    ALLOWED_ORIGINS: string;
    JWT_PUBLIC_KEY: string;
    ACCESS_MGMT: Fetcher & AccessManagementService;
    DB: D1Database;
  };
  Variables: AppVariables;
};
