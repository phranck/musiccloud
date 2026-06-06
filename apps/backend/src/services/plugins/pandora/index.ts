import { Service } from "@musiccloud/shared";
import type { ServicePlugin } from "../manifest.js";
import { pandoraAdapter } from "./adapter.js";

export const pandoraPlugin: ServicePlugin = {
  manifest: {
    id: Service.Pandora,
    displayName: "Pandora",
    description: "Resolves Pandora track URLs via the internal search API with a CSRF token.",
    defaultEnabled: true,
  },
  adapter: pandoraAdapter,
};
