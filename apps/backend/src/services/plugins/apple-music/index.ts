import { SERVICE } from "@musiccloud/shared";
import type { ServicePlugin } from "../manifest.js";
import { appleMusicAdapter } from "./adapter.js";

export const appleMusicPlugin: ServicePlugin = {
  manifest: {
    id: SERVICE.APPLE_MUSIC,
    displayName: "Apple Music",
    description: "Resolves Apple Music track, album and artist URLs via the Apple Music API (JWT signed).",
    defaultEnabled: true,
    requiredEnv: ["APPLE_MUSIC_KEY_ID", "APPLE_MUSIC_TEAM_ID", "APPLE_MUSIC_PRIVATE_KEY"],
  },
  adapter: appleMusicAdapter,
};
