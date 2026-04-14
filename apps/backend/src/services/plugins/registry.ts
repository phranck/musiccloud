import type { ServiceId } from "@musiccloud/shared";
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
import type { ServicePlugin } from "./manifest.js";
import { melonPlugin } from "./melon/index.js";
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
 */
const PLUGINS: readonly ServicePlugin[] = [
  spotifyPlugin,
  appleMusicPlugin,
  youtubePlugin,
  deezerPlugin,
  tidalPlugin,
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
 * endpoint to render the Dashboard — manifest data is static.
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
  return PLUGINS.filter((p) => enabled.get(p.manifest.id) === true && p.adapter.isAvailable()).map((p) => p.adapter);
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
 * Like {@link identifyService} but scans ALL plugins regardless of the
 * enabled/available state. Used solely to produce the `SERVICE_DISABLED`
 * error when a user pastes a URL whose source service has been disabled.
 */
export async function identifyServiceIncludingDisabled(url: string): Promise<ServiceAdapter | undefined> {
  return PLUGINS.map((p) => p.adapter).find((a) => a.detectUrl(url) !== null);
}

/**
 * Boolean lookup against the enabled-map. `true` ⇔ the plugin is toggled
 * on (either via DB override or manifest default).
 */
export async function isPluginEnabled(id: ServiceId): Promise<boolean> {
  const enabled = await getEnabledMap();
  return enabled.get(id) === true;
}
