/**
 * Canonical identifier namespaces for the whole codebase.
 *
 * Three enums in one file because they are always used together: an adapter
 * reports a `ServiceId`, operates on a `ResourceKind`, and records its
 * `Operation` in every error. Colocating them keeps imports short
 * (`import { SERVICE, RESOURCE_KIND, OPERATION } from "@musiccloud/shared"`)
 * and prevents the near-impossible rename where two files disagree on which
 * of three subtly-different service-id unions to use.
 *
 * Each is a `const` object plus a derived union type instead of a TypeScript
 * `enum` because const objects emit zero runtime cost, are tree-shakeable,
 * and work uniformly in ESM and the Vitest / Astro / Vite toolchains.
 * Plain string literals would give the same types but lose grep-ability:
 * `SERVICE.QOBUZ` appears once in this file and in every call site, while
 * `"qobuz"` is everywhere from URL parsers to test fixtures.
 *
 * `isValidServiceId` lives here (not in a separate `./validators.ts`)
 * because every call site that needs validation already imports this file,
 * and the project rule "No `as ServiceId` without validation" forces
 * validation at every external-data boundary.
 */

/**
 * Namespace of service identifiers. Prefer these constants over raw string
 * literals at call sites (`serviceHttpError(SERVICE.QOBUZ, …)`): they give
 * IDE autocomplete, grep-ability (`SERVICE.QOBUZ` is unique; `"qobuz"` is
 * everywhere), and compile-time typo protection.
 */
export const SERVICE = {
  SPOTIFY: "spotify",
  APPLE_MUSIC: "apple-music",
  YOUTUBE: "youtube",
  YOUTUBE_MUSIC: "youtube-music",
  SOUNDCLOUD: "soundcloud",
  TIDAL: "tidal",
  DEEZER: "deezer",
  AUDIUS: "audius",
  NAPSTER: "napster",
  PANDORA: "pandora",
  QOBUZ: "qobuz",
  BOOMPLAY: "boomplay",
  KKBOX: "kkbox",
  BANDCAMP: "bandcamp",
  AUDIOMACK: "audiomack",
  NETEASE: "netease",
  QQMUSIC: "qqmusic",
  MELON: "melon",
  BUGS: "bugs",
  JIOSAAVN: "jiosaavn",
  BEATPORT: "beatport",
  MUSICBRAINZ: "musicbrainz",
} as const;

export type ServiceId = (typeof SERVICE)[keyof typeof SERVICE];

export type MatchMethod = "isrc" | "search" | "cache" | "upc" | "isrc-inference";

/**
 * Namespace of resource kinds. Used by the error-code helpers and any other
 * place that distinguishes between track / album / artist flows.
 */
export const RESOURCE_KIND = {
  TRACK: "track",
  ALBUM: "album",
  ARTIST: "artist",
} as const;

export type ResourceKind = (typeof RESOURCE_KIND)[keyof typeof RESOURCE_KIND];

/**
 * Namespace of adapter operation labels. Threaded through error helpers so
 * the source operation appears in error messages without scattering raw
 * strings (`"getTrack"`, `"findByIsrc"`, `"album/get"`) across adapters.
 *
 * `FETCH` is the canonical "look up by id" used by `getTrack` / `getAlbum`
 * / `getArtist` and is the default in `serviceHttpError`. The other
 * operations cover the common alternate paths (ISRC / UPC lookup, search,
 * URL→track resolution).
 */
export const OPERATION = {
  FETCH: "fetch",
  ISRC_LOOKUP: "isrc-lookup",
  UPC_LOOKUP: "upc-lookup",
  SEARCH: "search",
  RESOLVE: "resolve",
} as const;

export type Operation = (typeof OPERATION)[keyof typeof OPERATION];

const VALID_SERVICE_IDS: readonly ServiceId[] = Object.values(SERVICE);

export { VALID_SERVICE_IDS };

export function isValidServiceId(value: unknown): value is ServiceId {
  return typeof value === "string" && VALID_SERVICE_IDS.includes(value as ServiceId);
}
