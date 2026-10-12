import type { MatchMethod, ServiceId } from "@musiccloud/shared";
import { compareByDisplayOrder, isPlatformVisible } from "@musiccloud/shared";

export interface PlatformLink {
  platform: ServiceId;
  url: string;
  displayName?: string;
  matchMethod?: MatchMethod;
}

/**
 * Keeps the platform links a visitor is shown, in their original order.
 *
 * The grid, the availability note under it and the choice between the two all
 * read this, so a hidden service such as MusicBrainz is neither drawn nor
 * counted. See {@link isPlatformVisible}.
 *
 * @param platforms - The resolved frontend platform links.
 * @returns A new array without the links of hidden services.
 */
export function visiblePlatforms(platforms: readonly PlatformLink[]): PlatformLink[] {
  return platforms.filter((platform) => isPlatformVisible(platform.platform));
}

/**
 * Selects the platform links that should be shown, ordered for display.
 *
 * Applies the two curated domain rules: keep the {@link visiblePlatforms}, then
 * sort them by {@link compareByDisplayOrder} (major/popular services first)
 * rather than alphabetically. Pure and non-mutating.
 *
 * @param platforms - The resolved frontend platform links (keyed by
 *   `platform: ServiceId`).
 * @returns A new array of visible platform links in curated display order.
 */
export function visiblePlatformsInDisplayOrder(platforms: PlatformLink[]): PlatformLink[] {
  return visiblePlatforms(platforms).sort((a, b) => compareByDisplayOrder(a.platform, b.platform));
}
