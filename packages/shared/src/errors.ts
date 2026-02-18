export type ErrorCode =
  | "UNSUPPORTED_SERVICE"
  | "NOT_MUSIC_LINK"
  | "INVALID_URL"
  | "PLAYLIST_NOT_SUPPORTED"
  | "PODCAST_NOT_SUPPORTED"
  | "ALBUM_NOT_SUPPORTED"
  | "TRACK_NOT_FOUND"
  | "NO_MATCHES"
  | "SERVICE_DOWN"
  | "ALL_DOWN"
  | "RATE_LIMITED"
  | "NETWORK_ERROR"
  | "TIMEOUT";

export const ERROR_STATUS_MAP: Record<ErrorCode, number> = {
  UNSUPPORTED_SERVICE: 400,
  NOT_MUSIC_LINK: 400,
  INVALID_URL: 400,
  PLAYLIST_NOT_SUPPORTED: 400,
  PODCAST_NOT_SUPPORTED: 400,
  ALBUM_NOT_SUPPORTED: 400,
  TRACK_NOT_FOUND: 404,
  NO_MATCHES: 404,
  SERVICE_DOWN: 503,
  ALL_DOWN: 503,
  RATE_LIMITED: 429,
  NETWORK_ERROR: 500,
  TIMEOUT: 408,
};

export const USER_MESSAGES: Record<ErrorCode, string> = {
  UNSUPPORTED_SERVICE: "This platform isn't supported yet. Try a link from Spotify, Apple Music, or YouTube.",
  NOT_MUSIC_LINK: "This doesn't look like a music link. Try pasting a link from Spotify, Apple Music, or YouTube.",
  INVALID_URL: "Hmm, that doesn't look right. Try pasting a link from a streaming service.",
  PLAYLIST_NOT_SUPPORTED: "We support single tracks right now. Try pasting a link to a specific song.",
  PODCAST_NOT_SUPPORTED: "We only support music tracks at the moment.",
  ALBUM_NOT_SUPPORTED: "Try pasting a link to a specific song from this album.",
  TRACK_NOT_FOUND: "This track doesn't seem to be available anymore.",
  NO_MATCHES: "We couldn't find this song on other platforms. It might be exclusive to the source.",
  SERVICE_DOWN: "One or more services are temporarily unavailable. We're showing what we found.",
  ALL_DOWN: "We're having some technical difficulties. Please try again in a few minutes.",
  RATE_LIMITED: "You're sending too many requests. Please wait a moment and try again.",
  NETWORK_ERROR: "Looks like you're offline. Check your connection and try again.",
  TIMEOUT: "This is taking longer than usual. Please try again.",
};
