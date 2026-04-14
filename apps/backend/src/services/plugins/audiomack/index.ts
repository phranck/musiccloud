import { SERVICE } from "@musiccloud/shared";
import type { ServicePlugin } from "../manifest.js";
import { audiomackAdapter } from "./adapter.js";

export const audiomackPlugin: ServicePlugin = {
  manifest: {
    id: SERVICE.AUDIOMACK,
    displayName: "Audiomack",
    description: "Resolves Audiomack song and album URLs via the public Audiomack API.",
    defaultEnabled: true,
  },
  adapter: audiomackAdapter,
};
