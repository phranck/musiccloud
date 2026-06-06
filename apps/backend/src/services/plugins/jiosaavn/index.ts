import { Service } from "@musiccloud/shared";
import type { ServicePlugin } from "../manifest.js";
import { jiosaavnAdapter } from "./adapter.js";

export const jiosaavnPlugin: ServicePlugin = {
  manifest: {
    id: Service.JioSaavn,
    displayName: "JioSaavn",
    description: "Resolves JioSaavn song URLs via the public jiosaavn.com autocomplete API.",
    defaultEnabled: true,
  },
  adapter: jiosaavnAdapter,
};
