import { Service } from "@musiccloud/shared";
import type { ServicePlugin } from "../manifest.js";
import { deezerAdapter } from "./adapter.js";

export const deezerPlugin: ServicePlugin = {
  manifest: {
    id: Service.Deezer,
    displayName: "Deezer",
    description: "Resolves Deezer track, album and artist URLs via the public Deezer API (no credentials required).",
    defaultEnabled: true,
  },
  adapter: deezerAdapter,
};
