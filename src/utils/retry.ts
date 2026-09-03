/**
 * Generic, framework-agnostic retry helper (pure — no Cloudflare bindings,
 * unit-testable).
 *
 * Use it for outbound calls (e.g. service bindings, external HTTP) that may
 * fail transiently. Pair it with an allowlist of retryable conditions —
 * deterministic domain errors should never be retried.
 */

import { InternalError } from "../core/domain/error";

export interface RetryPolicy {
  maxAttempts: number; // total attempts (initial + retries)
  baseDelayMs: number; // first retry delay
  maxDelayMs: number; // cap on the exponential backoff
  factor: number; // exponential base (2 = double each attempt)
  jitterRatio: number; // 0..1 — randomized fraction of the backoff window (1 = full jitter)
}

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Throws `InternalError` when a retry policy is malformed. Degenerate policies
 * (e.g. `maxAttempts: 0`) would otherwise silently misbehave — a zero-attempt
 * loop that throws `undefined`, or a backoff that never grows.
 */
export function validateRetryPolicy(policy: RetryPolicy): void {
  if (!Number.isInteger(policy.maxAttempts) || policy.maxAttempts < 1) {
    throw new InternalError(
      `Invalid retry policy: maxAttempts must be an integer >= 1, got ${policy.maxAttempts}`,
    );
  }
  if (!Number.isFinite(policy.baseDelayMs) || policy.baseDelayMs < 0) {
    throw new InternalError(
      `Invalid retry policy: baseDelayMs must be a finite number >= 0, got ${policy.baseDelayMs}`,
    );
  }
  if (!Number.isFinite(policy.maxDelayMs) || policy.maxDelayMs < 0) {
    throw new InternalError(
      `Invalid retry policy: maxDelayMs must be a finite number >= 0, got ${policy.maxDelayMs}`,
    );
  }
  if (!Number.isFinite(policy.factor) || policy.factor < 1) {
    throw new InternalError(
      `Invalid retry policy: factor must be a finite number >= 1, got ${policy.factor}`,
    );
  }
  if (
    !Number.isFinite(policy.jitterRatio) ||
    policy.jitterRatio < 0 ||
    policy.jitterRatio > 1
  ) {
    throw new InternalError(
      `Invalid retry policy: jitterRatio must be in [0, 1], got ${policy.jitterRatio}`,
    );
  }
}

/** Backoff for retry attempt `attempt` (0-based), with jitter. */
export function backoffDelayMs(attempt: number, policy: RetryPolicy): number {
  validateRetryPolicy(policy);
  const exponential = Math.min(
    policy.baseDelayMs * Math.pow(policy.factor, attempt),
    policy.maxDelayMs,
  );
  const keep = exponential * (1 - policy.jitterRatio);
  const jitter = Math.random() * exponential * policy.jitterRatio;
  return Math.round(keep + jitter);
}

export async function retryWithExponentialBackoff<T>(
  fn: () => Promise<T>,
  policy: RetryPolicy,
  shouldRetry: (error: unknown) => boolean = () => true,
  onRetry?: (attempt: number, error: unknown) => void,
): Promise<T> {
  validateRetryPolicy(policy);
  let lastError: unknown;
  for (let attempt = 0; attempt < policy.maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      const isLastAttempt = attempt === policy.maxAttempts - 1;
      if (isLastAttempt || !shouldRetry(error)) throw error;
      onRetry?.(attempt + 1, error);
      await sleep(backoffDelayMs(attempt, policy));
    }
  }
  throw lastError;
}
