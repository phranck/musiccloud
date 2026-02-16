export class RateLimiter {
  private windows: Map<string, number[]> = new Map();

  constructor(
    private readonly maxRequests: number,
    private readonly windowMs: number,
  ) {}

  isLimited(key: string): boolean {
    const now = Date.now();
    const windowStart = now - this.windowMs;

    let timestamps = this.windows.get(key) ?? [];
    timestamps = timestamps.filter((t) => t > windowStart);

    if (timestamps.length >= this.maxRequests) {
      this.windows.set(key, timestamps);
      return true;
    }

    timestamps.push(now);
    this.windows.set(key, timestamps);
    return false;
  }

  cleanup(): void {
    const now = Date.now();
    const windowStart = now - this.windowMs;
    for (const [key, timestamps] of this.windows) {
      const filtered = timestamps.filter((t) => t > windowStart);
      if (filtered.length === 0) {
        this.windows.delete(key);
      } else {
        this.windows.set(key, filtered);
      }
    }
  }
}

export const apiRateLimiter = new RateLimiter(30, 60_000);
setInterval(() => apiRateLimiter.cleanup(), 5 * 60 * 1000);
