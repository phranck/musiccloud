/**
 * Jamendo audio-format catalogue shared across the CC player, the audio proxy,
 * and the download menu.
 *
 * Jamendo exposes a track in four delivery formats, identified by the codes it
 * accepts in the stream URL's `format` query param and the download URL's last
 * path segment. This module is the single source of truth for those codes, their
 * display metadata, the canonical ordering, the default streaming format, and the
 * URL-rewriting helpers that swap one format for another.
 */

/**
 * The four Jamendo delivery formats, keyed by a PascalCase domain member and
 * valued by the exact Jamendo format code.
 *
 * - `Mp3Low` (`mp31`): MP3 96 kbps CBR.
 * - `Mp3High` (`mp32`): MP3 ~256 kbps VBR — the streaming default.
 * - `Ogg` (`ogg`): Ogg Vorbis.
 * - `Flac` (`flac`): lossless FLAC.
 */
export const JamendoAudioFormat = {
  Mp3Low: "mp31",
  Mp3High: "mp32",
  Ogg: "ogg",
  Flac: "flac",
} as const;

/** A Jamendo audio-format code (`"mp31" | "mp32" | "ogg" | "flac"`). */
export type JamendoAudioFormat = (typeof JamendoAudioFormat)[keyof typeof JamendoAudioFormat];

/**
 * Display + capability metadata per format. A plain `Record` (not an `as const`
 * namespace) — the keys are the Jamendo codes, mirroring `PLATFORM_CONFIG`.
 *
 * @property label - Short label shown on the player's mini-VFD format buttons.
 * @property mime - Content-Type for the proxy response and `canPlayType` probing.
 * @property lossless - True for FLAC; lets the UI flag lossless delivery.
 * @property ext - File extension (no dot) for the download filename.
 */
export const JAMENDO_FORMAT_META: Record<
  JamendoAudioFormat,
  { label: string; mime: string; lossless: boolean; ext: string }
> = {
  mp31: { label: "96k", mime: "audio/mpeg", lossless: false, ext: "mp3" },
  mp32: { label: "256k", mime: "audio/mpeg", lossless: false, ext: "mp3" },
  ogg: { label: "OGG", mime: "audio/ogg", lossless: false, ext: "ogg" },
  flac: { label: "FLAC", mime: "audio/flac", lossless: true, ext: "flac" },
};

/** Canonical low→high ordering for the format selector and the download menu. */
export const JAMENDO_FORMAT_ORDER: readonly JamendoAudioFormat[] = [
  JamendoAudioFormat.Mp3Low,
  JamendoAudioFormat.Mp3High,
  JamendoAudioFormat.Ogg,
  JamendoAudioFormat.Flac,
];

/** Default streaming format: MP3 256k — the best-compatibility, good-quality pick. */
export const DEFAULT_STREAM_FORMAT: JamendoAudioFormat = JamendoAudioFormat.Mp3High;

/**
 * Narrows an arbitrary string to a {@link JamendoAudioFormat}, falling back to
 * {@link DEFAULT_STREAM_FORMAT} when the value is missing or unrecognised.
 *
 * Used by the audio proxy to validate the `?format=` query param and by the
 * player to validate a persisted localStorage preference.
 *
 * @param value - The raw format string (query param, stored preference, …).
 * @returns A valid format code, defaulting to {@link DEFAULT_STREAM_FORMAT}.
 */
export function parseJamendoAudioFormat(value: string | null | undefined): JamendoAudioFormat {
  if (value && (JAMENDO_FORMAT_ORDER as readonly string[]).includes(value)) {
    return value as JamendoAudioFormat;
  }
  return DEFAULT_STREAM_FORMAT;
}

/**
 * Rewrites a Jamendo stream URL to deliver a different format by swapping its
 * `format` query param, preserving every other param (notably the access `from`
 * token, which is not format-bound).
 *
 * @param streamUrl - The Jamendo stream URL (`…/?trackid=X&format=mp31&from=…`).
 * @param format - The desired format code.
 * @returns The rewritten URL, or the input verbatim when it cannot be parsed.
 */
export function swapStreamFormat(streamUrl: string, format: JamendoAudioFormat): string {
  try {
    const url = new URL(streamUrl);
    url.searchParams.set("format", format);
    return url.toString();
  } catch {
    return streamUrl;
  }
}

/** Strips path and reserved characters so a value is safe in a filename on every
 *  OS, and collapses runs of whitespace (tabs / newlines included). */
function sanitizeFilenameSegment(value: string): string {
  return value
    .replace(/[\\/:*?"<>|]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Builds the download filename for a CC track in the form
 * `Artist_Album_NN_Title.ext`. The album and the zero-padded two-digit track
 * number are dropped when absent (a single, an album-less track), so the name
 * gracefully degrades to `Artist_Title.ext`. Every text segment is sanitized of
 * path / reserved / control characters so the name is safe on every OS; the
 * extension comes from {@link JAMENDO_FORMAT_META}.
 *
 * @param parts.artist - The track's artist name.
 * @param parts.album - The album name, when the track belongs to one.
 * @param parts.trackNumber - The track's position in its album, when known.
 * @param parts.title - The track title.
 * @param parts.format - The delivery format, selecting the file extension.
 * @returns The sanitized filename, e.g. `Pornophonique_8-bit lagerfeuer_03_sad robot.mp3`.
 */
export function buildCcDownloadFilename(parts: {
  artist: string;
  album?: string;
  trackNumber?: number;
  title: string;
  format: JamendoAudioFormat;
}): string {
  const segments = [
    sanitizeFilenameSegment(parts.artist),
    parts.album ? sanitizeFilenameSegment(parts.album) : "",
    parts.trackNumber != null ? String(parts.trackNumber).padStart(2, "0") : "",
    sanitizeFilenameSegment(parts.title),
  ].filter(Boolean);
  const base = segments.join("_") || "track";
  return `${base}.${JAMENDO_FORMAT_META[parts.format].ext}`;
}
