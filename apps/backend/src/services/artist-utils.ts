/**
 * Shared artist-name utilities used across genre-search adapters and
 * artist-info. Extracted because the same logic appears in 3+ call sites.
 */

const COLLAB_SEPARATORS = [" & ", " feat. ", " feat ", " ft. ", " ft ", " x ", " X "];

/**
 * Extract the primary (first) artist from a collaboration string.
 *
 * "Frank Sinatra & Nancy Sinatra" -> "Frank Sinatra"
 * "Drake feat. Rihanna"          -> "Drake"
 * "Miles Davis"                  -> "Miles Davis"
 */
export function extractPrimaryArtist(name: string): string {
  for (const sep of COLLAB_SEPARATORS) {
    const idx = name.indexOf(sep);
    if (idx > 0) return name.slice(0, idx).trim();
  }
  return name;
}
