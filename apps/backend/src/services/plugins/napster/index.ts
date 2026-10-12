import { getPlatformLabel, Service } from "@musiccloud/shared";
import type { ServicePlugin } from "../manifest.js";
import { napsterAdapter } from "./adapter.js";

export const napsterPlugin: ServicePlugin = {
  manifest: {
    id: Service.Napster,
    displayName: getPlatformLabel(Service.Napster),
    description: "Resolves Napster track and artist URLs via the Napster v2.2 API.",
    defaultEnabled: true,
    requiredEnv: ["NAPSTER_API_KEY"],
  },
  adapter: napsterAdapter,
};
