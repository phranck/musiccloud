/**
 * The canonical origin used to resolve relative musiccloud short URLs.
 *
 * Short URLs returned by the resolve endpoint can be relative (`/abc123`) or
 * absolute. To turn them into a {@link URL} they need a base origin. During
 * client rendering the live origin is authoritative; during SSR there is no
 * `window`, so this falls back to the production origin. Centralizing the
 * fallback here keeps the `"https://musiccloud.io"` convention in a single
 * place instead of being repeated across the short-url helpers.
 *
 * @returns The current `window.location.origin` in the browser, or the
 *   production origin (`https://musiccloud.io`) during SSR.
 */
function originBase(): string {
  return typeof window === "undefined" ? "https://musiccloud.io" : window.location.origin;
}

/**
 * Resolves a (possibly relative) musiccloud short URL to its path component.
 *
 * Uses {@link originBase} as the resolution base so relative short URLs become
 * absolute before the pathname is read. Falls back to `"/"` when the input
 * cannot be parsed into a URL.
 *
 * @param shortUrl - The short URL to resolve (relative or absolute).
 * @returns The pathname of the resolved URL (e.g. `/abc123`), or `"/"` when
 *   the URL cannot be parsed.
 */
export function pathFromShortUrl(shortUrl: string): string {
  try {
    return new URL(shortUrl, originBase()).pathname;
  } catch {
    return "/";
  }
}

/**
 * Rewrites the browser's address bar to the share page's short URL without a
 * navigation, via `history.replaceState`.
 *
 * Used after an in-place resolve so the visible URL reflects the freshly
 * resolved share page. The path is taken from {@link pathFromShortUrl}; the
 * query string and hash are cleared so the canonical short URL stands alone.
 * No-ops during SSR (no `window`).
 *
 * @param shortUrl - The short URL the address bar should display.
 */
export function replaceBrowserUrlWithShortUrl(shortUrl: string): void {
  if (typeof window === "undefined") return;
  const nextPath = pathFromShortUrl(shortUrl);
  const nextUrl = new URL(window.location.href);
  nextUrl.pathname = nextPath;
  nextUrl.search = "";
  nextUrl.hash = "";
  window.history.replaceState(window.history.state, "", nextUrl);
}
