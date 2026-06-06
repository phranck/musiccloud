import { Service } from "@musiccloud/shared";
import type { ServicePlugin } from "../manifest.js";
import { bugsAdapter } from "./adapter.js";

export const bugsPlugin: ServicePlugin = {
  manifest: {
    id: Service.Bugs,
    displayName: "Bugs!",
    description: "Resolves Bugs! track URLs by scraping the music.bugs.co.kr detail pages.",
    defaultEnabled: true,
  },
  adapter: bugsAdapter,
};
