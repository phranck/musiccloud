/**
 * Best-effort User-Agent classifier for SSR rendering decisions.
 *
 * Used only to choose between static editorial content for crawlers and the
 * interactive overlay for browsers. Share data, rendered content and metadata
 * are synchronously rendered for every user agent before this choice is made.
 *
 * False positives give a browser static editorial content. False negatives give
 * a crawler the interactive overlay. Neither choice removes share metadata.
 */
const BOT_PATTERNS =
  /bot|crawler|spider|crawl|slurp|facebookexternalhit|whatsapp|telegram|embedly|opengraph|linkpreview|preview|fetcher|curl|wget|httpie|python-requests|node-fetch|go-http|java\/|okhttp|axios|got\//i;

export function isBot(userAgent: string | null | undefined): boolean {
  if (!userAgent) return true;
  return BOT_PATTERNS.test(userAgent);
}
