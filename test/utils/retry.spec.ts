import { describe, it, expect, vi } from "vitest";
import {
  backoffDelayMs,
  retryWithExponentialBackoff,
  validateRetryPolicy,
  RetryPolicy,
} from "../../src/utils/retry";
import { InternalError } from "../../src/core/domain";

const validPolicy: RetryPolicy = {
  maxAttempts: 3,
  baseDelayMs: 100,
  maxDelayMs: 1000,
  factor: 2,
  jitterRatio: 0,
};

describe("validateRetryPolicy", () => {
  it("accepts a valid policy", () => {
    expect(() => validateRetryPolicy(validPolicy)).not.toThrow();
  });

  it("rejects maxAttempts < 1", () => {
    expect(() =>
      validateRetryPolicy({ ...validPolicy, maxAttempts: 0 }),
    ).toThrow(InternalError);
  });

  it("rejects negative baseDelayMs", () => {
    expect(() =>
      validateRetryPolicy({ ...validPolicy, baseDelayMs: -1 }),
    ).toThrow(InternalError);
  });

  it("rejects factor < 1", () => {
    expect(() =>
      validateRetryPolicy({ ...validPolicy, factor: 0.5 }),
    ).toThrow(InternalError);
  });

  it("rejects jitterRatio outside [0,1]", () => {
    expect(() =>
      validateRetryPolicy({ ...validPolicy, jitterRatio: 1.5 }),
    ).toThrow(InternalError);
  });
});

describe("backoffDelayMs", () => {
  it("computes exponential backoff without jitter", () => {
    expect(backoffDelayMs(0, validPolicy)).toBe(100);
    expect(backoffDelayMs(1, validPolicy)).toBe(200);
    expect(backoffDelayMs(2, validPolicy)).toBe(400);
  });

  it("caps at maxDelayMs", () => {
    const policy = { ...validPolicy, maxDelayMs: 250 };
    expect(backoffDelayMs(2, policy)).toBe(250);
  });
});

describe("retryWithExponentialBackoff", () => {
  it("returns the result on first success", async () => {
    const fn = vi.fn().mockResolvedValue("ok");
    await expect(retryWithExponentialBackoff(fn, validPolicy)).resolves.toBe("ok");
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("retries until success", async () => {
    const fn = vi
      .fn()
      .mockRejectedValueOnce(new Error("boom"))
      .mockResolvedValue("ok");
    await expect(retryWithExponentialBackoff(fn, validPolicy)).resolves.toBe("ok");
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it("gives up after maxAttempts", async () => {
    const fn = vi.fn().mockRejectedValue(new Error("boom"));
    await expect(retryWithExponentialBackoff(fn, validPolicy)).rejects.toThrow(
      "boom",
    );
    expect(fn).toHaveBeenCalledTimes(validPolicy.maxAttempts);
  });

  it("does not retry when shouldRetry returns false", async () => {
    const fn = vi.fn().mockRejectedValue(new Error("boom"));
    await expect(
      retryWithExponentialBackoff(fn, validPolicy, () => false),
    ).rejects.toThrow("boom");
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("invokes onRetry callback", async () => {
    const fn = vi
      .fn()
      .mockRejectedValueOnce(new Error("boom"))
      .mockResolvedValue("ok");
    const onRetry = vi.fn();
    await retryWithExponentialBackoff(fn, validPolicy, undefined, onRetry);
    expect(onRetry).toHaveBeenCalledWith(1, expect.any(Error));
  });
});
