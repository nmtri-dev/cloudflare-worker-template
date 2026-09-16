import type { Context } from "hono";
import { ErrorName } from "../../../../core/domain";
import { Logger } from "../../../../core/ports";
import { DefaultLogger } from "../../../secondary/loggers";

export function handleError(error: Error, c: Context) {
  const logger: Logger = new DefaultLogger();
  logger.error("An error occurred while processing the request", {
    error: {
      name: error.name,
      message: error.message,
      stack: error.stack,
    },
  });

  switch (error.name) {
    case ErrorName.BadRequestError:
      return c.json({ error: error.name }, 400);
    case ErrorName.UnauthorizedError:
      return c.json({ error: error.name }, 401);
    case ErrorName.NotFoundError:
      return c.json({ error: error.name }, 404);
    case ErrorName.ConflictError:
      return c.json({ error: error.name }, 409);
    case ErrorName.ForbiddenError:
      return c.json({ error: error.name }, 403);
    case ErrorName.TooManyRequestsError:
      return c.json({ error: error.name }, 429);
    case ErrorName.InternalError:
      return c.json({ error: error.name }, 500);
    default:
      logger.info(
        "There is a raw error that is not handled by the error handler middleware",
        {
          error: {
            name: error.name,
            message: error.message,
            stack: error.stack,
          },
        },
      );

      return c.json({ error: ErrorName.InternalError }, 500);
  }
}
