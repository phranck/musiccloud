import { log } from "../lib/infra/logger.js";
import { appleMusicAdapter } from "./plugins/apple-music/adapter.js";
import { audiomackAdapter } from "./plugins/audiomack/adapter.js";
import { audiusAdapter } from "./plugins/audius/adapter.js";
import { bandcampAdapter } from "./plugins/bandcamp/adapter.js";
import { beatportAdapter } from "./plugins/beatport/adapter.js";
import { boomplayAdapter } from "./plugins/boomplay/adapter.js";
import { bugsAdapter } from "./plugins/bugs/adapter.js";
import { deezerAdapter } from "./plugins/deezer/adapter.js";
import { jiosaavnAdapter } from "./plugins/jiosaavn/adapter.js";
import { kkboxAdapter } from "./plugins/kkbox/adapter.js";
import { melonAdapter } from "./plugins/melon/adapter.js";
import { napsterAdapter } from "./plugins/napster/adapter.js";
import { neteaseAdapter } from "./plugins/netease/adapter.js";
import { pandoraAdapter } from "./plugins/pandora/adapter.js";
import { qobuzAdapter } from "./plugins/qobuz/adapter.js";
import { qqmusicAdapter } from "./plugins/qqmusic/adapter.js";
import { soundcloudAdapter } from "./plugins/soundcloud/adapter.js";
import { spotifyAdapter } from "./plugins/spotify/adapter.js";
import { tidalAdapter } from "./plugins/tidal/adapter.js";
import { youtubeAdapter } from "./plugins/youtube/adapter.js";
import type { ServiceAdapter } from "./types.js";

// All registered adapters. Add new adapters here.
export const adapters: ServiceAdapter[] = [
  spotifyAdapter,
  appleMusicAdapter,
  youtubeAdapter,
  deezerAdapter,
  tidalAdapter,
  audiusAdapter,
  napsterAdapter,
  soundcloudAdapter,
  pandoraAdapter,
  qobuzAdapter,
  boomplayAdapter,
  kkboxAdapter,
  bandcampAdapter,
  audiomackAdapter,
  neteaseAdapter,
  qqmusicAdapter,
  melonAdapter,
  bugsAdapter,
  jiosaavnAdapter,
  beatportAdapter,
];

export function getAdapters(): ServiceAdapter[] {
  return adapters;
}

export function validateAdapters(): void {
  for (let i = 0; i < adapters.length; i++) {
    if (!adapters[i]) {
      log.error("Services", `Adapter at index ${i} is undefined — check imports in services/index.ts`);
    }
  }
}

export function registerAdapter(adapter: ServiceAdapter): void {
  const safeAdapter = adapter as ServiceAdapter | null | undefined;
  if (!safeAdapter) {
    log.error("Services", "registerAdapter called with undefined/null — adapter not registered");
    return;
  }
  adapters.push(adapter);
}

export function identifyService(url: string): ServiceAdapter | undefined {
  return adapters.find((a) => a && a.detectUrl(url) !== null);
}
