/**
 * Musiccloud Error Code Registry
 * ===============================
 *
 * Format: `MC-{AREA}-{NNNN}`
 *
 * ## Areas
 *
 * | Prefix | Meaning                                                  |
 * |--------|----------------------------------------------------------|
 * | `URL`  | URL parsing / detection                                  |
 * | `API`  | External service HTTP call failed or returned bad data   |
 * | `AUTH` | Authentication against an external service failed        |
 * | `RES`  | Resolver logic / cross-service resolution                |
 * | `DB`   | Database / persistence                                   |
 * | `CFG`  | Configuration / environment missing                      |
 * | `MAP`  | Mapping / malformed response data                        |
 *
 * ## Number scheme (first digit of NNNN = adapter group)
 *
 * | Digit | Adapter group                                            |
 * |-------|----------------------------------------------------------|
 * | `0`   | Cross-cutting / no specific adapter                      |
 * | `1`   | Apple Music                                              |
 * | `2`   | Qobuz                                                    |
 * | `3`   | Spotify                                                  |
 * | `4`   | Tidal                                                    |
 * | `5`   | Deezer                                                   |
 * | `6`   | YouTube / YouTube Music                                  |
 * | `7`   | Napster                                                  |
 * | `8`   | KKBOX, Beatport, Bandcamp, Audiomack, Audius, SoundCloud,|
 * |       | BoomPlay                                                 |
 * | `9`   | Pandora, Bugs, Melon, Netease, QQMusic, JioSaavn         |
 *
 * The remaining three digits identify the specific failure within that group.
 *
 * ## Usage
 *
 * - Backend throws `ResolveError(code, context?, overrideMessage?)`.
 * - Route handler calls `getErrorEntry(code)` and `formatUserMessage(...)` to
 *   produce the wire response. Both the canonical MC code and the rendered
 *   user message (which embeds the code as a suffix) are returned.
 * - Legacy code strings (`UNSUPPORTED_SERVICE`, `TRACK_NOT_FOUND`, …) are
 *   accepted and transparently mapped to their MC equivalents via
 *   {@link LEGACY_TO_MC}, so migration can proceed adapter by adapter.
 *
 * When a user reports an error, grep this file for the code: each entry
 * points at the file/function where the throw originates.
 */

export type ErrorArea = "URL" | "API" | "AUTH" | "RES" | "DB" | "CFG" | "MAP";

/**
 * Canonical error code. Narrow enough to distinguish areas in the type system,
 * loose enough to accept any 4-digit number without touching the type for
 * every new code.
 */
export type McErrorCode = `MC-${ErrorArea}-${string}`;

export interface ErrorCodeEntry {
  /** The canonical `MC-…` code. */
  code: McErrorCode;
  /** HTTP status the route should respond with. */
  httpStatus: number;
  /**
   * Default English user-facing message. May contain `{name}` placeholders
   * which are substituted from the `context` passed to `formatUserMessage`.
   * The rendered message always has the code appended as `(MC-…-…)` so the
   * user can quote it in bug reports.
   */
  userMessage: string;
  /** Short note for maintainers: why this code exists, what happened. */
  internalNote: string;
  /** File path + function hint for fast grep-to-source. */
  source: string;
}

/**
 * Legacy coarse error codes (used before the MC system existed). Kept alive
 * for backwards compatibility: the resolver, URL validator, and route
 * handler can continue emitting these until each adapter is migrated to an
 * MC code explicitly.
 */
export type LegacyErrorCode =
  | "UNSUPPORTED_SERVICE"
  | "NOT_MUSIC_LINK"
  | "INVALID_URL"
  | "PLAYLIST_NOT_SUPPORTED"
  | "PODCAST_NOT_SUPPORTED"
  | "ALBUM_NOT_SUPPORTED"
  | "SERVICE_DISABLED"
  | "TRACK_NOT_FOUND"
  | "NO_MATCHES"
  | "SERVICE_DOWN"
  | "ALL_DOWN"
  | "RATE_LIMITED"
  | "NETWORK_ERROR"
  | "TIMEOUT";

export const LEGACY_TO_MC: Record<LegacyErrorCode, McErrorCode> = {
  UNSUPPORTED_SERVICE: "MC-URL-0001",
  NOT_MUSIC_LINK: "MC-URL-0002",
  INVALID_URL: "MC-URL-0003",
  PLAYLIST_NOT_SUPPORTED: "MC-URL-0004",
  PODCAST_NOT_SUPPORTED: "MC-URL-0005",
  ALBUM_NOT_SUPPORTED: "MC-URL-0006",
  SERVICE_DISABLED: "MC-URL-0007",
  TRACK_NOT_FOUND: "MC-RES-0001",
  NO_MATCHES: "MC-RES-0002",
  SERVICE_DOWN: "MC-API-0001",
  ALL_DOWN: "MC-API-0002",
  RATE_LIMITED: "MC-API-0003",
  NETWORK_ERROR: "MC-API-0004",
  TIMEOUT: "MC-API-0005",
};

/**
 * Full registry of error codes. Adapter-specific codes are added here as the
 * adapter sweep in Phase 2b/2c migrates each service off the generic
 * `SERVICE_DOWN`/`NETWORK_ERROR` fallbacks.
 */
export const ERROR_CODE_REGISTRY: Record<McErrorCode, ErrorCodeEntry> = {
  // ─── URL parsing / detection ───────────────────────────────────────────────
  "MC-URL-0001": {
    code: "MC-URL-0001",
    httpStatus: 400,
    userMessage: "This platform isn't supported yet. Try a link from Spotify, Apple Music, or YouTube.",
    internalNote: "No adapter matched the URL. Either the host is unknown or the URL shape is off.",
    source: "apps/backend/src/lib/platform/url.ts validateMusicUrl",
  },
  "MC-URL-0002": {
    code: "MC-URL-0002",
    httpStatus: 400,
    userMessage: "This doesn't look like a music link. Try pasting a link from a supported service.",
    internalNote: "Input parses as a URL but none of the music adapters claim it.",
    source: "apps/backend/src/lib/platform/url.ts isMusicUrl",
  },
  "MC-URL-0003": {
    code: "MC-URL-0003",
    httpStatus: 400,
    userMessage: "That URL looks malformed. Please paste the full link from the streaming service.",
    internalNote: "URL failed validation (protocol missing, host empty, or similar).",
    source: "apps/backend/src/routes/resolve.ts body validation",
  },
  "MC-URL-0004": {
    code: "MC-URL-0004",
    httpStatus: 400,
    userMessage: "Playlists aren't supported yet. Paste a link to a single track or album instead.",
    internalNote: "URL identifies a playlist; we only support tracks/albums/artists.",
    source: "apps/backend/src/lib/platform/url.ts validateMusicUrl",
  },
  "MC-URL-0005": {
    code: "MC-URL-0005",
    httpStatus: 400,
    userMessage: "We only support music tracks at the moment. Podcasts aren't resolved.",
    internalNote: "URL identifies a podcast.",
    source: "apps/backend/src/lib/platform/url.ts validateMusicUrl",
  },
  "MC-URL-0006": {
    code: "MC-URL-0006",
    httpStatus: 400,
    userMessage: "Try pasting a link to a specific song or open the album page and share from there.",
    internalNote: "Legacy: older clients used this when album URLs weren't yet supported. Retained for compat.",
    source: "apps/backend/src/lib/platform/url.ts validateMusicUrl",
  },
  "MC-URL-0007": {
    code: "MC-URL-0007",
    httpStatus: 503,
    userMessage: "This service is currently disabled. Please try a link from another service.",
    internalNote:
      "URL recognised but the source plugin is toggled off in service_plugins. See registry.isPluginEnabled.",
    source: "apps/backend/src/services/resolver.ts / album-resolver.ts / artist-resolver.ts URL entry points",
  },

  // ─── Resolver / cross-service ──────────────────────────────────────────────
  "MC-RES-0001": {
    code: "MC-RES-0001",
    httpStatus: 404,
    userMessage: "This track doesn't seem to be available anymore on the source service.",
    internalNote: "Adapter.getTrack returned null/empty or 404 on the source service.",
    source: "apps/backend/src/services/resolver.ts resolveUrl",
  },
  "MC-RES-0002": {
    code: "MC-RES-0002",
    httpStatus: 404,
    userMessage: "We couldn't find this on other services. It may be exclusive to the source.",
    internalNote: "Cross-service resolution produced no matches above the quality threshold.",
    source: "apps/backend/src/services/resolver.ts resolveAcrossServices",
  },

  // ─── External API / network ────────────────────────────────────────────────
  "MC-API-0001": {
    code: "MC-API-0001",
    httpStatus: 503,
    userMessage: "One of the services is temporarily unavailable. We returned what we could find.",
    internalNote: "Generic service-down fallback. Adapter threw but wasn't marked unavailable.",
    source: "apps/backend/src/services/resolver.ts / album-resolver.ts",
  },
  "MC-API-0002": {
    code: "MC-API-0002",
    httpStatus: 503,
    userMessage: "All services are currently unreachable. Please try again in a few minutes.",
    internalNote: "Every adapter threw or returned nothing: likely a network-wide issue.",
    source: "apps/backend/src/services/resolver.ts",
  },
  "MC-API-0003": {
    code: "MC-API-0003",
    httpStatus: 429,
    userMessage: "Too many requests. Please wait a moment and try again.",
    internalNote: "Rate limiter tripped. See apps/backend/src/lib/infra/rate-limiter.ts.",
    source: "apps/backend/src/routes/resolve.ts apiRateLimiter",
  },
  "MC-API-0004": {
    code: "MC-API-0004",
    httpStatus: 500,
    userMessage: "Something went wrong talking to a service. Please try again.",
    internalNote: "Unhandled exception in the resolve pipeline. Legacy mapping: prefer a specific code.",
    source: "apps/backend/src/routes/resolve.ts catch-all",
  },
  "MC-API-0005": {
    code: "MC-API-0005",
    httpStatus: 408,
    userMessage: "This is taking longer than usual. Please try again.",
    internalNote: "A timeout fired on an outbound request or the whole pipeline.",
    source: "apps/backend/src/lib/infra/fetch.ts fetchWithTimeout",
  },

  // ─── Apple Music (group 1) ─────────────────────────────────────────────────
  "MC-API-1001": {
    code: "MC-API-1001",
    httpStatus: 503,
    userMessage: "Apple Music returned an unexpected response. Please try again later.",
    internalNote: "Apple Music API returned a non-OK status that isn't 401/404/429. Status is included in the message.",
    source: "apps/backend/src/services/plugins/apple-music/adapter.ts getTrack/getAlbum/getArtist",
  },
  "MC-API-1404": {
    code: "MC-API-1404",
    httpStatus: 404,
    userMessage: "Apple Music doesn't have this {kind} in the {storefront} region.",
    internalNote: "Catalog returned 404: the id is regional and doesn't exist in the storefront we queried.",
    source: "apps/backend/src/services/plugins/apple-music/adapter.ts getTrack/getAlbum/getArtist",
  },
  "MC-API-1429": {
    code: "MC-API-1429",
    httpStatus: 429,
    userMessage: "Apple Music is rate-limiting us. Please try again in a moment.",
    internalNote: "Apple Music API returned 429.",
    source: "apps/backend/src/services/plugins/apple-music/adapter.ts",
  },
  "MC-AUTH-1401": {
    code: "MC-AUTH-1401",
    httpStatus: 503,
    userMessage: "Apple Music rejected our credentials. The dev token may be expired or misconfigured.",
    internalNote: "401 from Apple Music: JWT signature/issuer rejected. Check APPLE_MUSIC_KEY_ID/TEAM_ID/PRIVATE_KEY.",
    source: "apps/backend/src/services/plugins/apple-music/adapter.ts",
  },
  "MC-CFG-1001": {
    code: "MC-CFG-1001",
    httpStatus: 503,
    userMessage: "Apple Music is not configured on this server.",
    internalNote: "APPLE_MUSIC_KEY_ID + APPLE_MUSIC_TEAM_ID + APPLE_MUSIC_PRIVATE_KEY env vars are missing.",
    source: "apps/backend/src/services/plugins/apple-music/adapter.ts generateToken",
  },
  "MC-AUTH-1501": {
    code: "MC-AUTH-1501",
    httpStatus: 503,
    userMessage: "Apple Music token signing failed on the server.",
    internalNote: "JWT signing threw: the private key is malformed or not valid PKCS8.",
    source: "apps/backend/src/services/plugins/apple-music/adapter.ts generateToken",
  },

  // ─── Qobuz (group 2) ───────────────────────────────────────────────────────
  "MC-API-2001": {
    code: "MC-API-2001",
    httpStatus: 503,
    userMessage: "Qobuz returned an unexpected response. Please try again later.",
    internalNote: "Qobuz API returned a non-OK status that isn't 401/404. Status is included in the message.",
    source: "apps/backend/src/services/plugins/qobuz/adapter.ts getTrack/getAlbum",
  },
  "MC-API-2404": {
    code: "MC-API-2404",
    httpStatus: 404,
    userMessage: "Qobuz doesn't have this track or album anymore.",
    internalNote: "Qobuz API returned 404 / empty body for the requested id.",
    source: "apps/backend/src/services/plugins/qobuz/adapter.ts getTrack/getAlbum",
  },
  "MC-AUTH-2401": {
    code: "MC-AUTH-2401",
    httpStatus: 503,
    userMessage: "Qobuz rejected our login. Credentials or app id may be wrong.",
    internalNote:
      "401 from Qobuz API. Likely causes: QOBUZ_EMAIL/PASSWORD wrong/expired, QOBUZ_APP_ID set to a web-player id (use the Chromecast id 425621600 or unset).",
    source: "apps/backend/src/services/plugins/qobuz/adapter.ts qobuzApiFetch",
  },
  "MC-CFG-2001": {
    code: "MC-CFG-2001",
    httpStatus: 503,
    userMessage: "Qobuz is not configured on this server.",
    internalNote: "QOBUZ_EMAIL or QOBUZ_PASSWORD env var is missing: no auth token can be obtained.",
    source: "apps/backend/src/services/plugins/qobuz/adapter.ts fetchAuthToken",
  },
};

/** Pattern that recognises any well-formed MC error code, even if not in the registry. */
const MC_CODE_PATTERN = /^MC-(URL|API|AUTH|RES|DB|CFG|MAP)-\d{3,4}$/;

/**
 * Resolve a raw code (MC or legacy) to its registry entry.
 *
 * Lookup order:
 * 1. Exact MC code match in `ERROR_CODE_REGISTRY`
 * 2. Legacy code mapped via `LEGACY_TO_MC`
 * 3. Well-formed MC code with no registry entry: synthesise a generic entry
 *    that **keeps the original code**. This lets `serviceHttpError` etc.
 *    emit per-adapter codes (`MC-API-3001`, `MC-API-8404`, …) without
 *    requiring a registry entry per (adapter × failure type): the code is
 *    still grep-able to the helper that produced it. Specific entries can
 *    be added later when a particular failure deserves a tailored message.
 * 4. Anything else: fall back to the catch-all `MC-API-0004`.
 */
export function getErrorEntry(code: string): ErrorCodeEntry {
  if (code in ERROR_CODE_REGISTRY) {
    return ERROR_CODE_REGISTRY[code as McErrorCode];
  }
  if (code in LEGACY_TO_MC) {
    return ERROR_CODE_REGISTRY[LEGACY_TO_MC[code as LegacyErrorCode]];
  }
  if (MC_CODE_PATTERN.test(code)) {
    const area = code.split("-")[1] as ErrorArea;
    return {
      code: code as McErrorCode,
      httpStatus: defaultHttpStatusForArea(area),
      userMessage: defaultMessageForArea(area),
      internalNote: "Synthesised entry: no specific registry entry for this code yet.",
      source: "(dynamic: see the helper that produced this code, e.g. serviceHttpError)",
    };
  }
  return ERROR_CODE_REGISTRY["MC-API-0004"];
}

function defaultHttpStatusForArea(area: ErrorArea): number {
  switch (area) {
    case "URL":
      return 400;
    case "AUTH":
    case "API":
      return 503;
    case "RES":
      return 404;
    case "CFG":
    case "DB":
    case "MAP":
      return 500;
  }
}

function defaultMessageForArea(area: ErrorArea): string {
  switch (area) {
    case "URL":
      return "That URL can't be processed right now.";
    case "API":
      return "An external service returned an unexpected response. Please try again.";
    case "AUTH":
      return "We couldn't authenticate against an external service.";
    case "RES":
      return "We couldn't resolve this request.";
    case "CFG":
      return "A required configuration is missing on the server.";
    case "DB":
      return "A database error occurred.";
    case "MAP":
      return "An external service returned data we couldn't parse.";
  }
}

/**
 * Render the user-facing message for an error.
 *
 * - Substitutes `{placeholder}` segments in the registry's `userMessage`
 *   using values from `context`.
 * - Appends the canonical MC code as a suffix so users can quote it in bug
 *   reports.
 * - An explicit `override` wins over the registry template but still gets
 *   the code appended.
 */
export function formatUserMessage(code: string, context?: Record<string, string | number>, override?: string): string {
  const entry = getErrorEntry(code);
  let message = override ?? entry.userMessage;
  if (context) {
    for (const [k, v] of Object.entries(context)) {
      message = message.replaceAll(`{${k}}`, String(v));
    }
  }
  return `${message} (${entry.code})`;
}
