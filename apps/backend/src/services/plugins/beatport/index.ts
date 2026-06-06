import { Service } from "@musiccloud/shared";
import type { ServicePlugin } from "../manifest.js";
import { beatportAdapter } from "./adapter.js";

export const beatportPlugin: ServicePlugin = {
  manifest: {
    id: Service.Beatport,
    displayName: "Beatport",
    description: "Resolves Beatport track and release URLs by scraping the Next.js __NEXT_DATA__ payload.",
    defaultEnabled: true,
  },
  adapter: beatportAdapter,
};
