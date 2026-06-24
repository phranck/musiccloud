import type { ServiceId } from "@musiccloud/shared";
import { compareByDisplayOrder, PLATFORM_CONFIG } from "@musiccloud/shared";

export interface PlatformLink {
  platform: ServiceId;
  url: string;
  displayName?: string;
  matchMethod?: "isrc" | "search" | "cache" | "upc" | "isrc-inference";
}

/**
 * Selects the platform links that should be shown, ordered for display.
 *
 * Applies the two curated domain rules: drop services flagged
 * `hidden` in {@link PLATFORM_CONFIG}, then sort the remainder by
 * {@link compareByDisplayOrder} (major/popular services first) rather than
 * alphabetically. Pure and non-mutating — it copies the input before sorting.
 *
 * @param platforms - The resolved frontend platform links (keyed by
 *   `platform: ServiceId`).
 * @returns A new array of visible platform links in curated display order.
 */
export function visiblePlatformsInDisplayOrder(platforms: PlatformLink[]): PlatformLink[] {
  return [...platforms]
    .filter((platform) => !PLATFORM_CONFIG[platform.platform]?.hidden)
    .sort((a, b) => compareByDisplayOrder(a.platform, b.platform));
}
