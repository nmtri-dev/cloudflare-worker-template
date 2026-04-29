import { tryGetContext } from "hono/context-storage";
import { AppEnv } from "../adapters/primary/http/types";

export function getDefaultLoggingContext() {
  const context = tryGetContext<AppEnv>();
  if (!context) {
    return {};
  }

  return {
    requestId: context.get("requestId"),
  };
}
