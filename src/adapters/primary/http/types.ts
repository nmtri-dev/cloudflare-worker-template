import { AccessManagementService, AppVariables } from "../../../core/ports";

export type AppEnv = {
  Bindings: CloudflareBindings & {
    ALLOWED_ORIGINS: string;
    ACCESS_MGMT: Fetcher & AccessManagementService;
    CREDIT_DB: D1Database;
    CREDIT_RESET_QUEUE: Queue<{ userId: string }>;
  };
  Variables: AppVariables;
};
