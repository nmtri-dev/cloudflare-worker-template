import { describe, it, expect, vi } from "vitest";
import { handleError } from "../../src/adapters/primary/http/middlewares/errorHandler";
import {
  BadRequestError,
  ConflictError,
  ForbiddenError,
  InternalError,
  NotFoundError,
  TooManyRequestsError,
  UnauthorizedError,
} from "../../src/core/domain/error";

function makeFakeContext() {
  return {
    json: vi.fn((body: unknown, status: number) => ({ body, status })),
  };
}

describe("handleError", () => {
  it.each([
    { error: new BadRequestError("bad request"), status: 400 },
    { error: new UnauthorizedError("unauthorized"), status: 401 },
    { error: new ForbiddenError("forbidden"), status: 403 },
    { error: new NotFoundError("not found"), status: 404 },
    { error: new ConflictError("conflict"), status: 409 },
    { error: new TooManyRequestsError("rate limit exceeded"), status: 429 },
    { error: new InternalError("internal"), status: 500 },
  ])("maps $error.name to HTTP $status", ({ error, status }) => {
    const c = makeFakeContext();

    const result = handleError(error, c as any);

    expect(result).toEqual({
      body: { error: error.name },
      status,
    });
  });
});
