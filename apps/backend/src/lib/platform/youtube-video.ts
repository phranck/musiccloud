/**
 * @file Shared recording-id grammar for YouTube input and derived music links.
 *
 * Parsing the host and path prevents a search page or a lookalike URL from
 * becoming a recording merely because its text contains a video-looking id.
 */

/**
 * Extracts an eleven-character video id from supported watch and short URLs.
 *
 * @param input - YouTube, YouTube Music or youtu.be URL; a missing scheme is
 * accepted for the same user-input forms as the adapter.
 * @returns A validated video id, or null for other hosts, paths and search pages.
 */
export function youtubeVideoId(input: string): string | null {
  try {
    const url = new URL(/^[a-z][a-z\d+.-]*:/i.test(input) ? input : `https://${input}`);
    if (!["http:", "https:"].includes(url.protocol) || url.username || url.password) return null;
    const hostname = url.hostname.replace(/\.$/, "");
    const id =
      hostname === "youtu.be"
        ? url.pathname.slice(1).replace(/\/$/, "")
        : ["youtube.com", "www.youtube.com", "m.youtube.com", "music.youtube.com"].includes(hostname) &&
            url.pathname === "/watch"
          ? url.searchParams.get("v")
          : null;
    return id && /^[a-zA-Z0-9_-]{11}$/.test(id) ? id : null;
  } catch {
    return null;
  }
}
