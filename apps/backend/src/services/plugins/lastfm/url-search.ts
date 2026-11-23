/**
 * @file Turns a Last.fm link into the search that resolves it.
 *
 * Last.fm is no streaming service, so its links never resolve directly. They
 * reach the resolver from Artist Info's Popular Tracks and from genre search,
 * in three shapes:
 *
 * - `/music/Artist/_/Track` names one recording.
 * - `/music/Artist/Album` names an album.
 * - `/music/Artist` names an artist.
 */
import type { SearchQuery } from "../../types.js";

/** The hosts Last.fm serves its pages from. */
const LASTFM_HOST_RE = /^(?:www\.)?last\.fm$/i;

/** The `/music/Artist`, `/music/Artist/Album` and `/music/Artist/_/Track` paths. */
const LASTFM_MUSIC_PATH_RE = /^\/music\/([^/]+)(?:\/([^/]+)(?:\/([^/]+))?)?/;

/** The path segment Last.fm puts between an artist and one of their tracks. */
const LASTFM_TRACK_SEGMENT = "_";

/**
 * The search a Last.fm link stands for.
 *
 * @property text - The link as free text, `Artist - Track`, `Artist - Album` or `Artist`.
 * @property structured - For a track link, its title and its artist, so each
 *   service only answers a recording by that artist. Absent for album and
 *   artist links, which search as free text.
 */
export interface LastfmUrlSearch {
  text: string;
  structured?: SearchQuery;
}

/**
 * Decodes one Last.fm path segment, where a space is written as `+` and a
 * literal plus sign as `%2B`.
 *
 * @param segment - The raw path segment.
 * @returns The segment as plain text.
 */
function decodeLastfmSegment(segment: string): string {
  return decodeURIComponent(segment.replace(/\+/g, " "));
}

/**
 * Reads the search a Last.fm link stands for.
 *
 * @param url - Any URL the resolver received.
 * @returns The search for a Last.fm music link, or `null` for every other URL.
 */
export function parseLastfmUrl(url: string): LastfmUrlSearch | null {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return null;
  }
  if (!LASTFM_HOST_RE.test(parsed.hostname)) return null;

  const match = parsed.pathname.match(LASTFM_MUSIC_PATH_RE);
  if (!match) return null;

  const artist = decodeLastfmSegment(match[1]);
  const second = match[2] ? decodeLastfmSegment(match[2]) : null;
  const third = match[3] ? decodeLastfmSegment(match[3]) : null;

  if (second === LASTFM_TRACK_SEGMENT && third) {
    return { text: `${artist} - ${third}`, structured: { title: third, artist } };
  }
  if (second && second !== LASTFM_TRACK_SEGMENT) return { text: `${artist} - ${second}` };
  return { text: artist };
}
