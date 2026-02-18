import type { Platform } from "@/lib/platform/config";

export type { Platform };

export interface PlatformLink {
  platform: Platform;
  url: string;
  displayName?: string;
  matchMethod?: "isrc" | "search" | "odesli" | "cache" | "upc" | "isrc-inference";
}
