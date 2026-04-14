import type { ServiceId } from "@musiccloud/shared";

export interface PlatformLink {
  platform: ServiceId;
  url: string;
  displayName?: string;
  matchMethod?: "isrc" | "search" | "odesli" | "cache" | "upc" | "isrc-inference";
}
