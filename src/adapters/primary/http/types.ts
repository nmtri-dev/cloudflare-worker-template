import { AccessManagementService, AppVariables } from "../../../core/ports";

export type AppEnv = {
  Bindings: CloudflareBindings & {
    ALLOWED_ORIGINS: string;
    ACCESS_MGMT: Fetcher & AccessManagementService;
  };
  Variables: AppVariables;
};
