export function createRateLimiter(limit: number, windowMs: number) {
  const store = new Map<string, number[]>();

  return function check(key: string): { allowed: boolean; retryAfter?: number } {
    const now = Date.now();
    const windowStart = now - windowMs;
    const timestamps = (store.get(key) ?? []).filter((t) => t > windowStart);

    if (timestamps.length >= limit) {
      store.set(key, timestamps);
      const retryAfter = Math.ceil((timestamps[0] + windowMs - now) / 1000);
      return { allowed: false, retryAfter };
    }

    timestamps.push(now);
    store.set(key, timestamps);
    return { allowed: true };
  };
}
