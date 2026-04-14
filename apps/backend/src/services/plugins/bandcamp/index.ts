import { SERVICE } from "@musiccloud/shared";
import type { ServicePlugin } from "../manifest.js";
import { bandcampAdapter } from "./adapter.js";

export const bandcampPlugin: ServicePlugin = {
  manifest: {
    id: SERVICE.BANDCAMP,
    displayName: "Bandcamp",
    description: "Resolves Bandcamp track and album URLs by scraping the page HTML/JSON.",
    defaultEnabled: true,
  },
  adapter: bandcampAdapter,
};
