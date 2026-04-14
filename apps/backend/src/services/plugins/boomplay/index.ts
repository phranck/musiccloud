import { SERVICE } from "@musiccloud/shared";
import type { ServicePlugin } from "../manifest.js";
import { boomplayAdapter } from "./adapter.js";

export const boomplayPlugin: ServicePlugin = {
  manifest: {
    id: SERVICE.BOOMPLAY,
    displayName: "Boomplay",
    description: "Resolves Boomplay track and album URLs by scraping Open Graph metadata.",
    defaultEnabled: true,
  },
  adapter: boomplayAdapter,
};
