import type { ServiceAdapter } from "./types.js";
import { spotifyAdapter } from "./adapters/spotify.js";
import { appleMusicAdapter } from "./adapters/apple-music.js";
import { youtubeAdapter } from "./adapters/youtube.js";
import { deezerAdapter } from "./adapters/deezer.js";
import { tidalAdapter } from "./adapters/tidal.js";
import { audiusAdapter } from "./adapters/audius.js";
import { napsterAdapter } from "./adapters/napster.js";

// All registered adapters. Add new adapters here.
export const adapters: ServiceAdapter[] = [
  spotifyAdapter,
  appleMusicAdapter,
  youtubeAdapter,
  deezerAdapter,
  tidalAdapter,
  audiusAdapter,
  napsterAdapter,
];

export function getAdapters(): ServiceAdapter[] {
  return adapters;
}

export function registerAdapter(adapter: ServiceAdapter): void {
  adapters.push(adapter);
}

export function identifyService(url: string): ServiceAdapter | undefined {
  return adapters.find((a) => a.detectUrl(url) !== null);
}
