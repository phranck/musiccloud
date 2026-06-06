import { Service } from "@musiccloud/shared";
import type { ServicePlugin } from "../manifest.js";
import { audiusAdapter } from "./adapter.js";

export const audiusPlugin: ServicePlugin = {
  manifest: {
    id: Service.Audius,
    displayName: "Audius",
    description: "Resolves Audius track URLs via the public Audius discovery API.",
    defaultEnabled: true,
  },
  adapter: audiusAdapter,
};
