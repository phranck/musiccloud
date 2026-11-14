import { getPlatformLabel, Service } from "@musiccloud/shared";
import type { ServicePlugin } from "../manifest.js";
import { youtubeAdapter } from "./adapter.js";

export const youtubePlugin: ServicePlugin = {
  manifest: {
    id: Service.YouTube,
    displayName: getPlatformLabel(Service.YouTube),
    description:
      "Resolves YouTube videos, channels, and album playlists through first-party metadata and the Data API v3.",
    defaultEnabled: true,
    requiredEnv: ["YOUTUBE_API_KEY"],
  },
  adapter: youtubeAdapter,
};
