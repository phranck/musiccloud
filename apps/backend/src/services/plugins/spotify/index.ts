import { Service } from "@musiccloud/shared";
import type { ServicePlugin } from "../manifest.js";
import { spotifyAdapter } from "./adapter.js";

export const spotifyPlugin: ServicePlugin = {
  manifest: {
    id: Service.Spotify,
    displayName: "Spotify",
    description: "Resolves Spotify track, album and artist URLs via the Spotify Web API.",
    defaultEnabled: true,
    requiredEnv: ["SPOTIFY_CLIENT_ID", "SPOTIFY_CLIENT_SECRET"],
  },
  adapter: spotifyAdapter,
};
