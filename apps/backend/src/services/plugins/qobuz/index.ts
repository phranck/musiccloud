import { Service } from "@musiccloud/shared";
import type { ServicePlugin } from "../manifest.js";
import { qobuzAdapter } from "./adapter.js";

export const qobuzPlugin: ServicePlugin = {
  manifest: {
    id: Service.Qobuz,
    displayName: "Qobuz",
    description: "Resolves Qobuz track and album URLs via the Qobuz API.",
    defaultEnabled: true,
    // The adapter works without an account from unrestricted addresses, and a
    // pasted Qobuz link has to reach it rather than read as an unknown service,
    // so the account improves it without being required.
    optionalEnv: ["QOBUZ_EMAIL", "QOBUZ_PASSWORD", "QOBUZ_APP_ID"],
  },
  adapter: qobuzAdapter,
};
