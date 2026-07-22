/**
 * Returns the Unix timestamps (in seconds) for the start and end of the current UTC month.
 *
 * - effectiveFrom: first day of the current month at 00:00:00 UTC
 * - expiredAt: last day of the current month at 23:59:59 UTC
 */
export function getCurrentMonthlyPeriodUTC(): {
  effectiveFrom: number;
  expiredAt: number;
} {
  const now = new Date();
  const effectiveFrom = Math.floor(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1) / 1000,
  );
  const expiredAt = Math.floor(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 0, 23, 59, 59) / 1000,
  );
  return { effectiveFrom, expiredAt };
}
