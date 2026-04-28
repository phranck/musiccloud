import { SERVICE } from "@musiccloud/shared";
import type { ServicePlugin } from "../manifest.js";
import { musicbrainzAdapter } from "./adapter.js";

export const musicbrainzPlugin: ServicePlugin = {
  manifest: {
    id: SERVICE.MUSICBRAINZ,
    displayName: "MusicBrainz",
    description:
      "Metadata-only source. Harvests MBID, ISWC, and ISNI identifiers into *_external_ids aggregation. Not a streaming target — its cross-service link points at musicbrainz.org and is hidden from the share UI.",
    defaultEnabled: false,
  },
  adapter: musicbrainzAdapter,
};
