/**
 * Canonical identifier namespaces for the whole codebase.
 *
 * Three enums in one file because they are always used together: an adapter
 * reports a `ServiceId`, operates on a `ResourceKind`, and records its
 * `Operation` in every error. Colocating them keeps imports short
 * (`import { Service, ResourceKind, Operation } from "@musiccloud/shared"`)
 * and prevents the near-impossible rename where two files disagree on which
 * of three subtly-different service-id unions to use.
 *
 * Each is a `const` object plus a derived union type instead of a TypeScript
 * `enum` because const objects emit zero runtime cost, are tree-shakeable,
 * and work uniformly in ESM and the Vitest / Astro / Vite toolchains.
 * Plain string literals would give the same types but lose grep-ability:
 * `Service.Qobuz` appears once in this file and in every call site, while
 * `"qobuz"` is everywhere from URL parsers to test fixtures.
 *
 * `isValidServiceId` lives here (not in a separate `./validators.ts`)
 * because every call site that needs validation already imports this file,
 * and the project rule "No `as ServiceId` without validation" forces
 * validation at every external-data boundary.
 */

/**
 * Namespace of service identifiers. Prefer these constants over raw string
 * literals at call sites (`serviceHttpError(Service.Qobuz, …)`): they give
 * IDE autocomplete, grep-ability (`Service.Qobuz` is unique; `"qobuz"` is
 * everywhere), and compile-time typo protection.
 */
export const Service = {
  Spotify: "spotify",
  AppleMusic: "apple-music",
  YouTube: "youtube",
  YouTubeMusic: "youtube-music",
  SoundCloud: "soundcloud",
  Tidal: "tidal",
  Deezer: "deezer",
  Audius: "audius",
  Napster: "napster",
  Pandora: "pandora",
  Qobuz: "qobuz",
  Boomplay: "boomplay",
  KKBox: "kkbox",
  BandCamp: "bandcamp",
  AudioMack: "audiomack",
  NetEase: "netease",
  QQMusic: "qqmusic",
  Melon: "melon",
  Bugs: "bugs",
  JioSaavn: "jiosaavn",
  Beatport: "beatport",
  MusicBrainz: "musicbrainz",
} as const;

export type ServiceId = (typeof Service)[keyof typeof Service];

export type MatchMethod = "isrc" | "search" | "cache" | "upc" | "isrc-inference";

/**
 * Namespace of resource kinds. Used by the error-code helpers and any other
 * place that distinguishes between track / album / artist flows.
 */
export const ResourceKind = {
  Track: "track",
  Album: "album",
  Artist: "artist",
} as const;

export type ResourceKind = (typeof ResourceKind)[keyof typeof ResourceKind];

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
export const Operation = {
  Fetch: "fetch",
  IsrcLookup: "isrc-lookup",
  UpcLookup: "upc-lookup",
  Search: "search",
  Resolve: "resolve",
} as const;

export type Operation = (typeof Operation)[keyof typeof Operation];

const VALID_SERVICE_IDS: readonly ServiceId[] = Object.values(Service);

export { VALID_SERVICE_IDS };

export function isValidServiceId(value: unknown): value is ServiceId {
  return typeof value === "string" && VALID_SERVICE_IDS.includes(value as ServiceId);
}
