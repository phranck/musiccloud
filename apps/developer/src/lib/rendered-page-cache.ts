/**
 * @file Reuse of one rendered page for a few minutes.
 *
 * The API reference carries the whole public contract, and rendering it takes
 * about 350 ms of server time for a 2.3 MB page, measured against the built
 * portal. It is the same for every visitor, so it is rendered once and handed
 * out again until the navigation it carries may have changed. It is rendered
 * on demand rather than prerendered, because a prerendered page is served
 * before the middleware runs and would go out without the portal's headers.
 */

/** A rendered page as it is kept. */
interface CachedPage {
  body: string;
  headers: [string, string][];
  expiresAt: number;
}

/** Headers that belong to one visitor and are never handed to the next. */
const VISITOR_HEADERS = new Set(["set-cookie"]);

/**
 * Creates a cache for one page.
 *
 * Only a `200` is kept, so a failed render is tried again on the next request.
 * Two requests that both find no page each render it, which costs one extra
 * render once per lifetime and keeps the cache free of locking.
 *
 * @param lifetimeMs - How long a rendered page is reused.
 * @param now - The clock, replaceable in tests.
 * @returns A function that answers from the cache or renders through `render`.
 */
export function createRenderedPageCache(lifetimeMs: number, now: () => number = Date.now) {
  let cached: CachedPage | null = null;

  return async function respond(render: () => Promise<Response>): Promise<Response> {
    if (!cached || cached.expiresAt <= now()) {
      const response = await render();
      if (response.status !== 200) return response;
      cached = {
        body: await response.text(),
        headers: [...response.headers].filter(([name]) => !VISITOR_HEADERS.has(name.toLowerCase())),
        expiresAt: now() + lifetimeMs,
      };
    }
    return new Response(cached.body, { status: 200, headers: cached.headers });
  };
}
