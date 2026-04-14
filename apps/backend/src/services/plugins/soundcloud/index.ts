import { SERVICE } from "@musiccloud/shared";
import type { ServicePlugin } from "../manifest.js";
import { soundcloudAdapter } from "./adapter.js";

export const soundcloudPlugin: ServicePlugin = {
  manifest: {
    id: SERVICE.SOUNDCLOUD,
    displayName: "SoundCloud",
    description: "Resolves SoundCloud track and playlist URLs via scraping with auto-fetched client_id.",
    defaultEnabled: true,
  },
  adapter: soundcloudAdapter,
};
