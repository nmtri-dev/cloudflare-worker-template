import { createMiddleware } from "hono/factory";
import { TooManyRequestsError } from "../../../../core/domain";
import { Logger } from "../../../../core/ports";
import { DefaultLogger } from "../../../secondary/loggers";

/**
 * Enforces the per-principal request rate limit (budget configured on the
 * `RATE_LIMITER` binding — see wrangler.jsonc / Terraform).
 *
 * MUST be mounted AFTER `authenticationMiddleware()` on protected route
 * groups (never globally, never on RPC entrypoints) so `principalId` is
 * already set on the context — the binding key is the principal ID, so each
 * authenticated principal gets its own independent counter.
 *
 * When the budget is exhausted the middleware logs a warning and throws
 * `TooManyRequestsError`, which `app.onError(handleError)` maps to HTTP 429
 * (`{ "error": "TooManyRequestsError" }`).
 */
export function rateLimitMiddleware() {
  return createMiddleware(async (c, next) => {
    const principalId = c.get("principalId");

    const { success } = await c.env.RATE_LIMITER.limit({ key: principalId });

    if (!success) {
      const logger: Logger = new DefaultLogger();
      logger.warn("Rate limit exceeded for principal", { principalId });

      throw new TooManyRequestsError("Rate limit exceeded");
    }

    await next();
  });
}
