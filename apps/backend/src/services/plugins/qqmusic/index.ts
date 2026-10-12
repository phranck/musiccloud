import { getPlatformLabel, Service } from "@musiccloud/shared";
import type { ServicePlugin } from "../manifest.js";
import { qqmusicAdapter } from "./adapter.js";

export const qqmusicPlugin: ServicePlugin = {
  manifest: {
    id: Service.QQMusic,
    displayName: getPlatformLabel(Service.QQMusic),
    description: "Resolves QQ Music track URLs via the public Tencent y.qq.com search API.",
    defaultEnabled: true,
  },
  adapter: qqmusicAdapter,
};
