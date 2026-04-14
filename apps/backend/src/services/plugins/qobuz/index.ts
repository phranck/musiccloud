import { SERVICE } from "@musiccloud/shared";
import type { ServicePlugin } from "../manifest.js";
import { qobuzAdapter } from "./adapter.js";

export const qobuzPlugin: ServicePlugin = {
  manifest: {
    id: SERVICE.QOBUZ,
    displayName: "Qobuz",
    description: "Resolves Qobuz track and album URLs via the Qobuz API (user-auth required).",
    defaultEnabled: true,
    requiredEnv: ["QOBUZ_EMAIL", "QOBUZ_PASSWORD"],
    optionalEnv: ["QOBUZ_APP_ID"],
  },
  adapter: qobuzAdapter,
};
