import { Service } from "@musiccloud/shared";
import type { ServicePlugin } from "../manifest.js";
import { melonAdapter } from "./adapter.js";

export const melonPlugin: ServicePlugin = {
  manifest: {
    id: Service.Melon,
    displayName: "Melon",
    description: "Resolves Melon track URLs by scraping the melon.com detail pages.",
    defaultEnabled: true,
  },
  adapter: melonAdapter,
};
