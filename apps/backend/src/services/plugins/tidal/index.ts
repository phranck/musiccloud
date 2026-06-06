import { Service } from "@musiccloud/shared";
import type { ServicePlugin } from "../manifest.js";
import { tidalAdapter } from "./adapter.js";

export const tidalPlugin: ServicePlugin = {
  manifest: {
    id: Service.Tidal,
    displayName: "Tidal",
    description: "Resolves Tidal track, album and artist URLs via the Tidal OpenAPI v2.",
    defaultEnabled: true,
    requiredEnv: ["TIDAL_CLIENT_ID", "TIDAL_CLIENT_SECRET"],
  },
  adapter: tidalAdapter,
};
