import { parseLinkCandidate } from "./link-candidate.js";
import { Service, type ServiceId } from "./services.js";

/**
 * Where one service's links live.
 *
 * @property hosts - The exact hosts its links are served from.
 * @property hostSuffixes - Domain suffixes for a service that puts each artist
 *   on a subdomain of its own, such as Bandcamp's `<artist>.bandcamp.com`.
 * @property shortLinkHosts - Hosts of the service's short links, which redirect
 *   to a link on one of its {@link MusicLinkSource.hosts}.
 */
export interface MusicLinkSource {
  hosts: readonly string[];
  hostSuffixes?: readonly string[];
  shortLinkHosts?: readonly string[];
}

/**
 * The hosts of every service musiccloud resolves links from, keyed by service.
 *
 * This table answers which service a link belongs to, and nothing else. The
 * web input submits a pasted link on it, artist bios pick the platform logo
 * with it, and the backend admits a link through it before any request leaves
 * the server. What a link to a track, an album or an artist looks like stays
 * with the backend adapters, because they are the code that reads the id out
 * of it, and a second set of patterns here would drift from theirs.
 *
 * `youtube` and `youtube-music` are separate entries, as in {@link Service}, so
 * a YouTube Music link gets its own logo. Jamendo has no entry, because its
 * links resolve through the Creative Commons endpoint and `parseJamendoLink`
 * in `jamendo-link.ts` recognizes them.
 */
export const MUSIC_LINK_SOURCES: Readonly<Record<Exclude<ServiceId, typeof Service.Jamendo>, MusicLinkSource>> = {
  [Service.Spotify]: { hosts: ["open.spotify.com", "play.spotify.com"] },
  [Service.AppleMusic]: { hosts: ["music.apple.com"] },
  [Service.YouTube]: { hosts: ["youtube.com", "www.youtube.com", "m.youtube.com", "youtu.be"] },
  [Service.YouTubeMusic]: { hosts: ["music.youtube.com"] },
  [Service.SoundCloud]: {
    hosts: ["soundcloud.com", "www.soundcloud.com", "m.soundcloud.com"],
    shortLinkHosts: ["on.soundcloud.com"],
  },
  [Service.Tidal]: { hosts: ["tidal.com", "listen.tidal.com"] },
  [Service.Deezer]: { hosts: ["deezer.com", "www.deezer.com"], shortLinkHosts: ["link.deezer.com"] },
  [Service.Audius]: { hosts: ["audius.co"] },
  [Service.Napster]: {
    hosts: ["napster.com", "www.napster.com", "play.napster.com", "web.napster.com", "app.napster.com"],
  },
  [Service.Pandora]: { hosts: ["pandora.com", "www.pandora.com"] },
  [Service.Qobuz]: { hosts: ["open.qobuz.com", "play.qobuz.com"] },
  [Service.Boomplay]: { hosts: ["boomplay.com", "www.boomplay.com"] },
  [Service.KKBox]: { hosts: ["kkbox.com", "www.kkbox.com"] },
  [Service.BandCamp]: { hosts: ["bandcamp.com"], hostSuffixes: [".bandcamp.com"] },
  [Service.AudioMack]: { hosts: ["audiomack.com", "www.audiomack.com"] },
  [Service.NetEase]: { hosts: ["music.163.com"] },
  [Service.QQMusic]: { hosts: ["y.qq.com"] },
  [Service.Melon]: { hosts: ["melon.com", "www.melon.com"] },
  [Service.Bugs]: { hosts: ["music.bugs.co.kr"] },
  [Service.JioSaavn]: { hosts: ["jiosaavn.com", "www.jiosaavn.com"] },
  [Service.Beatport]: { hosts: ["beatport.com", "www.beatport.com"] },
  // MusicBrainz holds metadata rather than audio, and its adapter resolves its
  // recording, release and artist pages.
  [Service.MusicBrainz]: { hosts: ["musicbrainz.org", "www.musicbrainz.org"] },
};

const SOURCES = Object.entries(MUSIC_LINK_SOURCES) as [ServiceId, MusicLinkSource][];

/**
 * The service a hostname belongs to.
 *
 * @param hostname - A hostname, in any case.
 * @returns The service, or `null` when no service serves links from it.
 */
function serviceOfHost(hostname: string): ServiceId | null {
  const host = hostname.toLowerCase();
  for (const [service, source] of SOURCES) {
    if (source.hosts.includes(host) || source.shortLinkHosts?.includes(host)) return service;
    if (source.hostSuffixes?.some((suffix) => host.endsWith(suffix))) return service;
  }
  return null;
}

/**
 * The service a link belongs to, read from its host.
 *
 * @param url - A link, with or without `http(s)://`.
 * @returns The service, or `null` when the link is not on a host in
 *   {@link MUSIC_LINK_SOURCES}.
 */
export function detectMusicLinkService(url: string): ServiceId | null {
  const parsed = parseLinkCandidate(url);
  return parsed ? serviceOfHost(parsed.hostname) : null;
}

/**
 * Whether a link belongs to a service musiccloud resolves links from.
 *
 * @param url - A link, with or without `http(s)://`.
 * @returns `true` when {@link detectMusicLinkService} names a service.
 */
export function isMusicLink(url: string): boolean {
  return detectMusicLinkService(url) !== null;
}

/**
 * Whether a hostname serves links of a service in {@link MUSIC_LINK_SOURCES},
 * short-link hosts included.
 *
 * @param hostname - A hostname, in any case.
 * @returns `true` for a host the backend may fetch a link from.
 */
export function isMusicLinkHost(hostname: string): boolean {
  return serviceOfHost(hostname) !== null;
}

/**
 * Whether a hostname serves a service's short links, which have to be followed
 * to the link they redirect to before any adapter can read them.
 *
 * @param hostname - A hostname, in any case.
 * @returns `true` for a host in one of the services' `shortLinkHosts`.
 */
export function isShortLinkHost(hostname: string): boolean {
  const host = hostname.toLowerCase();
  return SOURCES.some(([, source]) => source.shortLinkHosts?.includes(host) ?? false);
}
