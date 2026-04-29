import { createMiddleware } from "hono/factory";
import assetPublicKey from "../../../../assets/local_public.key";
import { verifyJwt } from "../../../../utils";
import { AccessTokenClaims, UnauthorizedError } from "../../../../core/domain";
import { Logger } from "../../../../core/ports";
import { DefaultLogger } from "../../../secondary/loggers";

export function authenticationMiddleware() {
  return createMiddleware(async (c, next) => {
    const authHeader = c.req.header("Authorization");
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      const logger: Logger = new DefaultLogger();
      logger.error("Missing or invalid Authorization header");

      throw new UnauthorizedError("Missing or invalid Authorization header");
    }

    const token = authHeader.substring(7); // Remove "Bearer " prefix

    // JWT_TEST_PUBLIC_KEY is injected by the test environment (vitest.config.mts).
    // In production this var is never set, so assetPublicKey is always used.
    const publicKey =
      ((c.env as Record<string, unknown>).JWT_TEST_PUBLIC_KEY as
        | string
        | undefined) ?? assetPublicKey;

    const claims = await verifyJwt(token, publicKey);

    const accessTokenClaims = claims as AccessTokenClaims;

    c.set("principalId", accessTokenClaims.sub); // Assuming 'sub' claim contains principal ID
    c.set("principalType", accessTokenClaims.principal_type);
    c.set("principalRoles", accessTokenClaims.principal_roles);

    await next();
  });
}
