import { Service } from "@musiccloud/shared";

/** Stored recording destinations provide refresh identity independently of the canonical source's ISRC. */
interface PreviewDestination {
  service: string;
  url: string;
}

/**
 * Reads the confirmed Deezer recording identity without following its URL.
 *
 * A video-origin track can have no canonical ISRC while already having a matched
 * Deezer destination. Only an actual Deezer track URL supplies this identity;
 * search pages, other hosts, credentials, and non-recording paths do not.
 *
 * @param links - Destinations already associated with the recording.
 * @returns The numeric Deezer recording id, or null when none is usable.
 */
export function deezerTrackIdFromLinks(links: readonly PreviewDestination[]): string | null {
  for (const link of links) {
    if (link.service !== Service.Deezer) continue;
    try {
      const url = new URL(link.url);
      if (
        !["http:", "https:"].includes(url.protocol) ||
        !["deezer.com", "www.deezer.com"].includes(url.hostname.replace(/\.$/, "")) ||
        url.username ||
        url.password
      )
        continue;
      const match = /^\/(?:[a-z]{2}\/)?track\/(\d{1,20})\/?$/.exec(url.pathname);
      if (match) return match[1];
    } catch {
      // A malformed stored destination cannot identify an outbound lookup.
    }
  }
  return null;
}

/**
 * Decides whether the existing preview endpoint can identify this recording.
 *
 * Both the share reader and resolve response use the same predicate so the
 * player is not told that a known Deezer recording has no refresh path merely
 * because its original source supplied no ISRC. This check makes no requests.
 *
 * @param isrc - Canonical ISRC, which may be absent on video-origin recordings.
 * @param links - Confirmed destinations belonging to the same recording.
 * @returns Whether identifier lookup or an actual Deezer track link permits refresh.
 */
export function isTrackPreviewRefreshable(
  isrc: string | null | undefined,
  links: readonly PreviewDestination[],
): boolean {
  return Boolean(isrc) || deezerTrackIdFromLinks(links) !== null;
}
