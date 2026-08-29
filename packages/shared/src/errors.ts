/**
 * Legacy coarse error codes.
 *
 * This union predates `./error-codes.ts`, which holds the current registry
 * with the HTTP status and user message per canonical code. Route handlers and
 * the URL validator still throw these coarse strings, and `LEGACY_TO_MC` maps
 * every one of them to an MC code, so a wire response carries the legacy code
 * in `error` and the canonical code in `message`.
 *
 * The union is all that is left here. The status and message tables that used
 * to sit beside it were a second answer to a question `ERROR_CODE_REGISTRY`
 * already answers, and nothing read them.
 *
 * A new error belongs in `ERROR_CODE_REGISTRY`. Extend this union only when
 * another subsystem reads the coarse code directly.
 */

export type ErrorCode =
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
