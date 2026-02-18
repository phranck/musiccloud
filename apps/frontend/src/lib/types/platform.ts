import type { Platform } from "@musiccloud/shared";

export type { Platform };

export interface PlatformLink {
  platform: Platform;
  url: string;
  displayName?: string;
  matchMethod?: "isrc" | "search" | "odesli" | "cache" | "upc" | "isrc-inference";
}
