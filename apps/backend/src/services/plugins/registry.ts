/**
 * @file Central registry for all resolve plugins.
 *
 * Single source of truth for "which plugins exist", "which of them
 * are enabled right now", and "which adapters can serve traffic".
 * The resolvers in `services/resolver.ts`, `album-resolver.ts`, and
 * `artist-resolver.ts` reach for adapters through this module rather
 * than importing them directly, so the enabled/available gate is
 * uniformly enforced.
 *
 * ## Plugin list is build-time
 *
 * `PLUGINS` is a plain array literal. New plugins are added by
 * appending the imported plugin object; nothing scans the filesystem.
 * That means removing a plugin requires deleting the import line, and
 * the compiler will flag any code that still referenced the adapter.
 *
 * ## Enabled map: 30s cache + promise coalescing
 *
 * `getEnabledMap` is on the resolve hot path, so its result is
 * memoized for 30 seconds. A burst of concurrent cache misses is
 * coalesced onto a single in-flight DB read via `pendingRead`,
 * matching the project rule against parallel DB roundtrips for the
 * same lookup. The 30s TTL means toggling a plugin off in the admin
 * UI takes up to 30 seconds to propagate to other processes; the
 * process that wrote the toggle busts its own cache via
 * `invalidateEnabledCache` for same-second visibility.
 *
 * ## "Enabled" vs "available"
 *
 * `enabled` is an admin toggle stored in `service_plugins`, falling
 * back to `manifest.defaultEnabled` for rows that have never been
 * touched. `available` comes from the manifest through
 * `evaluatePluginEnv`: a keyless plugin is always available, and a
 * credentialed one when its `requiredEnv` or its `alternativeEnv` is set.
 * A plugin has to be BOTH for `getActiveAdapters` to include it.
 *
 * ## `findInactiveServiceFor`
 *
 * Deliberately separate from `identifyService`: every resolver calls it
 * first to tell the difference between "URL from an unknown service"
 * (`NOT_MUSIC_LINK`) and "URL from a service that cannot serve it"
 * (`SERVICE_DISABLED`), whether the admin turned the service off or its
 * credentials are missing. Only the former is a user error; the latter is
 * actionable feedback ("Apple Music is off").
 *
 * ## `filterDisabledLinks`
 *
 * Runs over cached resolve results. A link whose service is currently
 * disabled must not reappear on a share page just because it was
 * persisted while the service was on. Links for services that have no
 * plugin at all normally pass through. The derived `youtube-music`
 * destination explicitly inherits YouTube's toggle because it has no separate
 * plugin or administrative control.
 */
import { isValidServiceId, type ServiceId } from "@musiccloud/shared";
import { readPluginStatesFromDb } from "../../db/plugin-repository.js";
import type { ServiceAdapter } from "../types.js";
import { appleMusicPlugin } from "./apple-music/index.js";
import { audiomackPlugin } from "./audiomack/index.js";
import { audiusPlugin } from "./audius/index.js";
import { bandcampPlugin } from "./bandcamp/index.js";
import { beatportPlugin } from "./beatport/index.js";
import { boomplayPlugin } from "./boomplay/index.js";
import { bugsPlugin } from "./bugs/index.js";
import { deezerPlugin } from "./deezer/index.js";
import { jiosaavnPlugin } from "./jiosaavn/index.js";
import { kkboxPlugin } from "./kkbox/index.js";
import { evaluatePluginEnv, type ServicePlugin } from "./manifest.js";
import { melonPlugin } from "./melon/index.js";
import { musicbrainzPlugin } from "./musicbrainz/index.js";
import { napsterPlugin } from "./napster/index.js";
import { neteasePlugin } from "./netease/index.js";
import { pandoraPlugin } from "./pandora/index.js";
import { qobuzPlugin } from "./qobuz/index.js";
import { qqmusicPlugin } from "./qqmusic/index.js";
import { soundcloudPlugin } from "./soundcloud/index.js";
import { spotifyPlugin } from "./spotify/index.js";
import { tidalPlugin } from "./tidal/index.js";
import { youtubePlugin } from "./youtube/index.js";

/**
 * The static, build-time list of all resolve plugins. New adapters are
 * added by appending to this array (after creating the plugin directory
 * and its `<svc>Plugin` barrel).
 *
 * `getActiveAdapters` preserves this order for sequential text discovery.
 * Deezer leads because its keyless metadata supplies identifiers and previews
 * that the subsequent cross-service resolve can reuse.
 *
 * Once a source recording is known, track matching fans out to all active
 * targets in parallel. Spotify participates alongside the other targets; its
 * position here does not make it a deferred ISRC retry. URL detection instead
 * follows each adapter's detector, with non-overlap checked by classification
 * tests. Keep ordering here rather than copying it into callers or docs.
 */
const PLUGINS: readonly ServicePlugin[] = [
  deezerPlugin,
  appleMusicPlugin,
  tidalPlugin,
  youtubePlugin,
  spotifyPlugin,
  musicbrainzPlugin,
  audiusPlugin,
  napsterPlugin,
  soundcloudPlugin,
  pandoraPlugin,
  qobuzPlugin,
  boomplayPlugin,
  kkboxPlugin,
  bandcampPlugin,
  audiomackPlugin,
  neteasePlugin,
  qqmusicPlugin,
  melonPlugin,
  bugsPlugin,
  jiosaavnPlugin,
  beatportPlugin,
];

const ENABLED_TTL_MS = 30_000;

let enabledCache: { map: ReadonlyMap<ServiceId, boolean>; expiresAt: number } | null = null;
let pendingRead: Promise<ReadonlyMap<ServiceId, boolean>> | null = null;

/**
 * Sync, cheap access to the plugin manifest list. Used by the admin
 * endpoint to render the Dashboard. Manifest data is static.
 */
export function listPlugins(): readonly ServicePlugin[] {
  return PLUGINS;
}

/**
 * Returns a `ServiceId → enabled` map merging `manifest.defaultEnabled`
 * with any overrides in the `service_plugins` table. Cached for 30s.
 *
 * Concurrent callers share one in-flight DB read (promise coalescing)
 * so a burst of resolves doesn't hit the DB N times on cache miss.
 */
export async function getEnabledMap(): Promise<ReadonlyMap<ServiceId, boolean>> {
  if (enabledCache && Date.now() < enabledCache.expiresAt) {
    return enabledCache.map;
  }
  if (pendingRead) return pendingRead;

  pendingRead = (async () => {
    try {
      const rows = await readPluginStatesFromDb();
      const overrides = new Map<ServiceId, boolean>(rows.map((r) => [r.id, r.enabled]));
      const map = new Map<ServiceId, boolean>();
      for (const p of PLUGINS) {
        const override = overrides.get(p.manifest.id);
        map.set(p.manifest.id, override ?? p.manifest.defaultEnabled);
      }
      enabledCache = { map, expiresAt: Date.now() + ENABLED_TTL_MS };
      return map;
    } finally {
      pendingRead = null;
    }
  })();
  return pendingRead;
}

/**
 * Drops the cached enabled-map. Call this right after any write to
 * `service_plugins` so the change is visible immediately in the process
 * that made the change. Other processes still pay up to one TTL of lag.
 */
export function invalidateEnabledCache(): void {
  enabledCache = null;
}

/**
 * Returns adapters that are both enabled (admin toggle) AND available
 * (credentials present). Both filters must be true for the adapter to
 * participate in any resolve flow.
 */
export async function getActiveAdapters(): Promise<readonly ServiceAdapter[]> {
  const enabled = await getEnabledMap();
  return PLUGINS.filter((p) => enabled.get(p.manifest.id) === true && evaluatePluginEnv(p.manifest).available).map(
    (p) => p.adapter,
  );
}

/**
 * Whether a plugin's credentials are present, whatever its admin toggle says.
 *
 * @param id - The plugin's service id.
 * @returns `true` when the plugin exists and its manifest's environment is
 *   satisfied, `false` for an unknown id.
 */
export function isPluginAvailable(id: ServiceId): boolean {
  const plugin = PLUGINS.find((candidate) => candidate.manifest.id === id);
  return plugin !== undefined && evaluatePluginEnv(plugin.manifest).available;
}

/**
 * Find the adapter whose `detectUrl()` claims the given URL, restricted
 * to active (enabled + available) adapters. Returns `undefined` if no
 * active adapter recognises the URL.
 */
export async function identifyService(url: string): Promise<ServiceAdapter | undefined> {
  const adapters = await getActiveAdapters();
  return adapters.find((a) => a.detectUrl(url) !== null);
}

/**
 * Names the plugin a link belongs to when that plugin cannot serve it.
 *
 * Every detector of every plugin is asked, the album and artist ones as well
 * as the track one, so the answer is the same whichever pipeline asks. A
 * plugin counts as inactive when the admin has switched it off or when it
 * lacks the credentials it needs, because either way the link cannot be
 * resolved and the user should read that the service is unavailable rather
 * than that the link is not a music link.
 *
 * @param url - The cleaned and expanded link.
 * @returns The inactive plugin's id, or `null` when the link belongs to an
 *   active plugin or to none.
 */
export async function findInactiveServiceFor(url: string): Promise<ServiceId | null> {
  const plugin = PLUGINS.find(
    ({ adapter }) =>
      adapter.detectUrl(url) !== null ||
      Boolean(adapter.detectAlbumUrl?.(url)) ||
      Boolean(adapter.detectArtistUrl?.(url)),
  );
  if (!plugin) return null;
  const active = (await isPluginEnabled(plugin.manifest.id)) && evaluatePluginEnv(plugin.manifest).available;
  return active ? null : plugin.manifest.id;
}

/** What a music link points at, as the plugins' own detectors tell it. */
export type MusicUrlKind = "album" | "artist" | "track";

/**
 * Says whether a link points at an album, an artist or a track.
 *
 * The plugins' own detectors are the only answer, because each plugin is the
 * code that extracts the id afterwards. A separate table of patterns would be
 * a second answer that drifts from them, and a link it misroutes ends in the
 * wrong pipeline and in "not a music link". Every plugin is asked, enabled or
 * not, like {@link findInactiveServiceFor}, so a link's kind does not change
 * with the admin toggles. The album detectors are asked first,
 * then the artist ones, then the track ones. That order decides nothing as
 * long as no two detectors claim the same link, across all plugins, which
 * `music-url-classification.test.ts` holds.
 *
 * @param url - The cleaned and expanded link.
 * @returns The kind of the first detector that claims the link, or `null`
 *   when no plugin claims it.
 */
export function classifyMusicUrl(url: string): MusicUrlKind | null {
  const adapters = PLUGINS.map((plugin) => plugin.adapter);
  if (adapters.some((adapter) => adapter.detectAlbumUrl?.(url))) return "album";
  if (adapters.some((adapter) => adapter.detectArtistUrl?.(url))) return "artist";
  if (adapters.some((adapter) => adapter.detectUrl(url))) return "track";
  return null;
}

/**
 * Boolean lookup against the enabled-map. `true` ⇔ the plugin is toggled
 * on (either via DB override or manifest default).
 */
export async function isPluginEnabled(id: ServiceId): Promise<boolean> {
  const enabled = await getEnabledMap();
  return enabled.get(id) === true;
}

/**
 * Drop entries whose `service` corresponds to a plugin that is currently
 * toggled off. YouTube Music inherits YouTube's toggle; other services with no
 * plugin pass through. This also filters persisted derived destinations, so a
 * disabled parent cannot reappear through its alias on a cached result.
 *
 * @param links - Stored or freshly derived destinations.
 * @returns The visible links without changing their order or metadata.
 */
export async function filterDisabledLinks<T extends { service: string }>(links: T[]): Promise<T[]> {
  const enabled = await getEnabledMap();
  return links.filter((link) => {
    const service = link.service === "youtube-music" ? "youtube" : link.service;
    return !isValidServiceId(service) || enabled.get(service) !== false;
  });
}
