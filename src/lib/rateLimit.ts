// A small, in-process (single Node server, no external store) rate limiter
// for public, unauthenticated form submissions — this app has no existing
// rate-limiting mechanism to reuse (confirmed by grep across src/), and a
// public /reschedule form needs one. Deliberately simple: a fixed window
// per key, kept in memory. Good enough to blunt a basic script hammering
// the endpoint; not a distributed/serverless-safe limiter, which this app's
// single-process deployment doesn't need.
const attempts = new Map<string, number[]>();

export const DEFAULT_WINDOW_MS = 15 * 60 * 1000;
export const DEFAULT_MAX_ATTEMPTS = 5;

// Returns true if `key` is still within its allowance (and records this
// attempt), false if it's over the limit for the current window.
export function checkRateLimit(
  key: string,
  now: number = Date.now(),
  windowMs: number = DEFAULT_WINDOW_MS,
  max: number = DEFAULT_MAX_ATTEMPTS
): boolean {
  const recent = (attempts.get(key) ?? []).filter((t) => now - t < windowMs);
  if (recent.length >= max) {
    attempts.set(key, recent);
    return false;
  }
  recent.push(now);
  attempts.set(key, recent);
  return true;
}

// Test-only reset — clears one key, or everything when called with none.
export function resetRateLimit(key?: string): void {
  if (key) attempts.delete(key);
  else attempts.clear();
}
