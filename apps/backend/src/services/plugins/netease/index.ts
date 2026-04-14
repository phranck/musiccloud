import { SERVICE } from "@musiccloud/shared";
import type { ServicePlugin } from "../manifest.js";
import { neteaseAdapter } from "./adapter.js";

export const neteasePlugin: ServicePlugin = {
  manifest: {
    id: SERVICE.NETEASE,
    displayName: "NetEase Cloud Music",
    description: "Resolves NetEase Cloud Music track URLs via the internal weapi search endpoint.",
    defaultEnabled: true,
  },
  adapter: neteaseAdapter,
};
