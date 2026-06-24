/**
 * Frontend-only music-service URL detection.
 *
 * Used both for paste-to-submit detection in the Hero input and to recognise a
 * commercial streaming link inside free bio text (so it can be rendered as the
 * platform's logo). The patterns mirror the shareable track/album/artist URLs a
 * user can paste; finer content-type detection (track vs album vs artist) is the
 * backend's job. Each pattern is tagged with the {@link ServiceId} it identifies
 * so a single match yields the platform for logo rendering.
 */
import { Service, type ServiceId } from "@musiccloud/shared";

interface MusicUrlPattern {
  service: ServiceId;
  pattern: RegExp;
}

const MUSIC_URL_PATTERNS: MusicUrlPattern[] = [
  {
    service: Service.Spotify,
    pattern: /^https?:\/\/(open\.)?spotify\.com\/(track|album|artist|intl-\w+\/(track|album|artist))\//,
  },
  { service: Service.AppleMusic, pattern: /^https?:\/\/music\.apple\.com\// },
  { service: Service.YouTubeMusic, pattern: /^https?:\/\/music\.youtube\.com\// },
  {
    service: Service.YouTube,
    pattern: /^https?:\/\/(?:www\.|m\.)?(youtube\.com\/(watch|shorts|@|channel\/)|youtu\.be\/)/,
  },
  { service: Service.SoundCloud, pattern: /^https?:\/\/(?:www\.|m\.)?soundcloud\.com\/[^/]+\/[^/]+/ },
  { service: Service.SoundCloud, pattern: /^https?:\/\/on\.soundcloud\.com\/[A-Za-z0-9]+/ },
  { service: Service.Tidal, pattern: /^https?:\/\/(listen\.)?tidal\.com\/(browse\/)?(track|album|artist)\// },
  { service: Service.Deezer, pattern: /^https?:\/\/(www\.)?deezer\.com\/(([a-z]{2})\/)?(track|album|artist)\// },
  { service: Service.Deezer, pattern: /^https?:\/\/link\.deezer\.com\/s\// },
  { service: Service.Qobuz, pattern: /^https?:\/\/(?:open|play)\.qobuz\.com\/(track|album)\/[a-zA-Z0-9]+/ },
  { service: Service.BandCamp, pattern: /^https?:\/\/[a-z0-9-]+\.bandcamp\.com\/(album|track)\// },
];

/**
 * Returns the {@link ServiceId} of the commercial streaming platform a URL points
 * to, or `null` when the URL is not a recognised shareable music link.
 *
 * @param url - An absolute URL string (must carry an `http(s)://` scheme).
 * @returns The matching service id, or `null`.
 */
export function detectMusicService(url: string): ServiceId | null {
  return MUSIC_URL_PATTERNS.find(({ pattern }) => pattern.test(url))?.service ?? null;
}

/**
 * Whether a URL is a recognised shareable music link (any supported platform).
 *
 * @param url - An absolute URL string.
 * @returns `true` when {@link detectMusicService} would resolve a platform.
 */
export function isMusicUrl(url: string): boolean {
  return detectMusicService(url) !== null;
}
