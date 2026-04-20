/**
 * Best-effort User-Agent classifier for SSR rendering decisions.
 *
 * Used by share-page rendering to decide between two paths:
 *  - bots get a fully SSR-rendered HTML response with OG/Twitter meta
 *    in `<head>` so link-preview crawlers can scrape it
 *  - browsers get an instant shell (background + logo) and the share
 *    content streams in via a deferred Server Island
 *
 * False positives (treating a real browser as a bot) just give that user
 * the slower SSR path — visually identical, only delayed. False negatives
 * (treating a crawler as a browser) break the OG preview because the
 * crawler typically does not wait for the deferred island. We therefore
 * err on the side of "bot" for empty/unknown UAs.
 */
const BOT_PATTERNS =
  /bot|crawler|spider|crawl|slurp|facebookexternalhit|whatsapp|telegram|embedly|opengraph|linkpreview|preview|fetcher|curl|wget|httpie|python-requests|node-fetch|go-http|java\/|okhttp|axios|got\//i;

export function isBot(userAgent: string | null | undefined): boolean {
  if (!userAgent) return true;
  return BOT_PATTERNS.test(userAgent);
}
