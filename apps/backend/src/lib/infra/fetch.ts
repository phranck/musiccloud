/**
 * Timeout-enforcing fetch wrapper.
 *
 * Project rule (see `.claude/CLAUDE.md` > Error Handling): every external HTTP
 * call must abort after a bounded time. A hanging fetch blocks a resolver
 * entry point, starves the event loop under load, and leaks the timer
 * reference. Without this guardrail a single misbehaving upstream (e.g.
 * Qobuz geo-block timeout, Tidal 504) can wedge the whole resolve queue.
 *
 * Why 5000ms default: below that, slow-but-healthy upstreams (Melon, KKBOX,
 * cross-region Spotify) trip falsely. Above 10s, the frontend spinner feels
 * broken. 5s is the empirical middle ground. Adapters that need more (e.g.
 * Bandcamp HTML scrapes) pass an explicit override.
 *
 * Why the `finally` clearTimeout: without it, a successful fast response
 * still keeps the timer alive until the abort fires, holding a Node handle
 * open and preventing process shutdown in tests.
 */
export async function fetchWithTimeout(url: string, init?: RequestInit, timeoutMs = 5000): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timeout);
  }
}
