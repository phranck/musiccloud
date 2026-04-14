import { SERVICE } from "@musiccloud/shared";
import type { ServicePlugin } from "../manifest.js";
import { kkboxAdapter } from "./adapter.js";

export const kkboxPlugin: ServicePlugin = {
  manifest: {
    id: SERVICE.KKBOX,
    displayName: "KKBOX",
    description: "Resolves KKBOX track, album and artist URLs via the KKBOX Open API.",
    defaultEnabled: true,
    requiredEnv: ["KKBOX_CLIENT_ID", "KKBOX_CLIENT_SECRET"],
    optionalEnv: ["KKBOX_TERRITORY"],
  },
  adapter: kkboxAdapter,
};
