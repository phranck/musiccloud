import { log } from "../lib/infra/logger.js";
import { appleMusicAdapter } from "./adapters/apple-music.js";
import { audiomackAdapter } from "./adapters/audiomack.js";
import { audiusAdapter } from "./adapters/audius.js";
import { bandcampAdapter } from "./adapters/bandcamp.js";
import { beatportAdapter } from "./adapters/beatport.js";
import { boomplayAdapter } from "./adapters/boomplay.js";
import { bugsAdapter } from "./adapters/bugs.js";
import { deezerAdapter } from "./adapters/deezer.js";
import { jiosaavnAdapter } from "./adapters/jiosaavn.js";
import { kkboxAdapter } from "./adapters/kkbox.js";
import { melonAdapter } from "./adapters/melon.js";
import { napsterAdapter } from "./adapters/napster.js";
import { neteaseAdapter } from "./adapters/netease.js";
import { pandoraAdapter } from "./adapters/pandora.js";
import { qobuzAdapter } from "./adapters/qobuz.js";
import { qqmusicAdapter } from "./adapters/qqmusic.js";
import { soundcloudAdapter } from "./adapters/soundcloud.js";
import { spotifyAdapter } from "./adapters/spotify.js";
import { tidalAdapter } from "./adapters/tidal.js";
import { youtubeAdapter } from "./adapters/youtube.js";
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
