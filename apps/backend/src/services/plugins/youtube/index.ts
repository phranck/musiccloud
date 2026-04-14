import { SERVICE } from "@musiccloud/shared";
import type { ServicePlugin } from "../manifest.js";
import { youtubeAdapter } from "./adapter.js";

export const youtubePlugin: ServicePlugin = {
  manifest: {
    id: SERVICE.YOUTUBE,
    displayName: "YouTube",
    description: "Resolves YouTube video URLs via the YouTube Data API v3.",
    defaultEnabled: true,
    requiredEnv: ["YOUTUBE_API_KEY"],
  },
  adapter: youtubeAdapter,
};
