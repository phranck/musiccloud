import { SERVICE } from "@musiccloud/shared";
import type { ServicePlugin } from "../manifest.js";
import { qqmusicAdapter } from "./adapter.js";

export const qqmusicPlugin: ServicePlugin = {
  manifest: {
    id: SERVICE.QQMUSIC,
    displayName: "QQ Music",
    description: "Resolves QQ Music track URLs via the public Tencent y.qq.com search API.",
    defaultEnabled: true,
  },
  adapter: qqmusicAdapter,
};
