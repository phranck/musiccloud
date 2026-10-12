import { getPlatformLabel, Service } from "@musiccloud/shared";
import type { ServicePlugin } from "../manifest.js";
import { soundcloudAdapter } from "./adapter.js";

export const soundcloudPlugin: ServicePlugin = {
  manifest: {
    id: Service.SoundCloud,
    displayName: getPlatformLabel(Service.SoundCloud),
    description: "Resolves SoundCloud track and playlist URLs via scraping with auto-fetched client_id.",
    defaultEnabled: true,
  },
  adapter: soundcloudAdapter,
};
