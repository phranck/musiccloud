/**
 * Recognizes a Jamendo track or album page URL and translates it to the CC
 * resolve candidate the backend already understands, so pasting a Jamendo link
 * resolves that exact entity instead of running a text search.
 *
 * - Track `https://www.jamendo.com/track/26738/alone` → `jamendo:26738`
 * - Album `https://www.jamendo.com/album/3661/listen`  → `jamendo-album:3661`
 *
 * The `jamendo:` / `jamendo-album:` prefixes mirror the backend cc-resolver
 * candidate contract (the same ids a CC disambiguation round hands back). Only
 * track and album URLs are recognized; artist (and anything else) returns null.
 *
 * @param input - The raw hero-input string (a URL or free text).
 * @returns The CC resolve `selectedCandidate`, or null when `input` is not a
 *   Jamendo track or album URL.
 */
export function parseJamendoUrl(input: string): string | null {
  let url: URL;
  try {
    url = new URL(input.trim());
  } catch {
    return null;
  }

  // Jamendo serves localized subdomains (`en.`, `de.`, …) plus the apex host.
  if (!/(?:^|\.)jamendo\.com$/i.test(url.hostname)) return null;

  const [kind, id] = url.pathname.split("/").filter(Boolean);
  if (!id || !/^\d+$/.test(id)) return null;
  if (kind === "track") return `jamendo:${id}`;
  if (kind === "album") return `jamendo-album:${id}`;
  return null;
}
