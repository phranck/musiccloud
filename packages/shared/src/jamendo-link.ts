import { ResourceKind } from "./services.js";

/**
 * The Jamendo entity a pasted link points at.
 *
 * @property kind - Whether the link opens a track, an album or an artist page.
 * @property jamendoId - The numeric Jamendo id from the link's path.
 */
export interface JamendoLink {
  kind: ResourceKind;
  jamendoId: string;
}

/** Jamendo serves the apex host and subdomains such as `www.` and `en.`. */
const JAMENDO_HOST_PATTERN = /(?:^|\.)jamendo\.com$/i;

/**
 * Jamendo accepts a language segment in front of the entity path
 * (`/de/track/459544`) and redirects it to the canonical page, so a link copied
 * from a localized page carries one.
 */
const LANGUAGE_SEGMENT_PATTERN = /^[a-z]{2}$/i;

const NUMERIC_ID_PATTERN = /^\d+$/;

/** The first path segment of each Jamendo page that musiccloud can resolve. */
const JAMENDO_PATH_KINDS: ReadonlyMap<string, ResourceKind> = new Map([
  ["track", ResourceKind.Track],
  ["album", ResourceKind.Album],
  ["artist", ResourceKind.Artist],
]);

/**
 * Recognizes a link to a Jamendo track, album or artist page.
 *
 * The web input uses it to send a pasted link to the Creative Commons endpoint,
 * that endpoint uses it to resolve the linked entity directly instead of running
 * a text search, and the commercial endpoints use it to point such a link at the
 * Creative Commons endpoint. All three read this one function, so they cannot
 * disagree about which links count.
 *
 * Accepted shapes, each with or without `http(s)://`, a trailing name slug and
 * a query string:
 *
 * - `https://jamendo.com/track/459544`
 * - `https://www.jamendo.com/album/54844/best-of-vol-2`
 * - `https://www.jamendo.com/de/artist/5261`
 *
 * @param input - A raw query string, as typed or pasted.
 * @returns The linked entity, or `null` when `input` is not a link to a Jamendo
 *   track, album or artist page with a numeric id.
 */
export function parseJamendoLink(input: string): JamendoLink | null {
  const url = parseLinkCandidate(input);
  if (!url || !JAMENDO_HOST_PATTERN.test(url.hostname)) return null;

  const segments = url.pathname.split("/").filter(Boolean);
  if (segments.length > 0 && LANGUAGE_SEGMENT_PATTERN.test(segments[0])) segments.shift();

  const [kindSegment, jamendoId] = segments;
  const kind = kindSegment ? JAMENDO_PATH_KINDS.get(kindSegment.toLowerCase()) : undefined;
  if (!kind || !jamendoId || !NUMERIC_ID_PATTERN.test(jamendoId)) return null;
  return { kind, jamendoId };
}

/**
 * Parses `input` as an http(s) URL, adding `https://` when the scheme is
 * missing, because a link copied from an address bar often comes without one.
 *
 * @param input - A raw query string.
 * @returns The parsed URL, or `null` for empty input, input containing
 *   whitespace, or anything that does not parse as an http(s) URL.
 */
function parseLinkCandidate(input: string): URL | null {
  const trimmed = input.trim();
  if (!trimmed || /\s/.test(trimmed)) return null;
  const withScheme = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
  try {
    const url = new URL(withScheme);
    return url.protocol === "http:" || url.protocol === "https:" ? url : null;
  } catch {
    return null;
  }
}
