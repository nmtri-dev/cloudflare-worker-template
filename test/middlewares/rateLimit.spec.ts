import { describe, it, expect, vi } from "vitest";
import { rateLimitMiddleware } from "../../src/adapters/primary/http/middlewares/rateLimit";
import { TooManyRequestsError } from "../../src/core/domain/error";

function makeFakeContext(overrides: Record<string, unknown> = {}) {
  const c = {
    env: {
      RATE_LIMITER: {
        limit: vi.fn(),
      },
    },
    get: vi.fn((key: string) => {
      if (key === "principalId") return "principal-123";
      return undefined;
    }),
    ...overrides,
  };
  return c;
}

describe("rateLimitMiddleware", () => {
  it("calls RATE_LIMITER.limit with the principal ID as the key", async () => {
    const c = makeFakeContext();
    c.env.RATE_LIMITER.limit.mockResolvedValue({ success: true });

    const next = vi.fn();
    const middleware = rateLimitMiddleware();

    await middleware(c as any, next);

    expect(c.env.RATE_LIMITER.limit).toHaveBeenCalledWith({
      key: "principal-123",
    });
    expect(next).toHaveBeenCalledTimes(1);
  });

  it("lets the request through when the rate limit is not exceeded", async () => {
    const c = makeFakeContext();
    c.env.RATE_LIMITER.limit.mockResolvedValue({ success: true });

    const next = vi.fn();
    const middleware = rateLimitMiddleware();

    await expect(middleware(c as any, next)).resolves.toBeUndefined();
    expect(next).toHaveBeenCalledTimes(1);
  });

  it("throws TooManyRequestsError and short-circuits when the limit is exceeded", async () => {
    const c = makeFakeContext();
    c.env.RATE_LIMITER.limit.mockResolvedValue({ success: false });

    const next = vi.fn();
    const middleware = rateLimitMiddleware();

    await expect(middleware(c as any, next)).rejects.toThrow(
      TooManyRequestsError,
    );
    expect(next).not.toHaveBeenCalled();
  });
});
