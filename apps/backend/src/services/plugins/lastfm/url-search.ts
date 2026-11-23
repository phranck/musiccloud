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

/** Every `+` in a Last.fm path segment, which Last.fm writes for a space. */
const LASTFM_ENCODED_SPACE_RE = /\+/g;

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
 * @returns The segment as plain text, or `null` when it holds a broken
 *   percent escape such as `%E0%A4%A`, which `decodeURIComponent` rejects
 *   with a `URIError`.
 */
function decodeLastfmSegment(segment: string): string | null {
  try {
    return decodeURIComponent(segment.replace(LASTFM_ENCODED_SPACE_RE, " "));
  } catch (error) {
    if (error instanceof URIError) return null;
    throw error;
  }
}

/**
 * Reads the search a Last.fm link stands for.
 *
 * @param url - Any URL the resolver received.
 * @returns The search for a Last.fm music link, or `null` for every other URL,
 *   including a Last.fm music link whose path holds a broken percent escape.
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
  const second = match[2] ? decodeLastfmSegment(match[2]) : undefined;
  const third = match[3] ? decodeLastfmSegment(match[3]) : undefined;
  // A segment that does not decode is a link this parser cannot read, so the
  // whole link is not a Last.fm search rather than a search for part of it.
  if (artist === null || second === null || third === null) return null;

  if (second === LASTFM_TRACK_SEGMENT && third) {
    return { text: `${artist} - ${third}`, structured: { title: third, artist } };
  }
  if (second && second !== LASTFM_TRACK_SEGMENT) return { text: `${artist} - ${second}` };
  return { text: artist };
}
