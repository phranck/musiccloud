import { type ApiLink, getPlatformLabel, isValidServiceId } from "@musiccloud/shared";
import type { PlatformLink } from "@/lib/types/platform";

/**
 * Normalize public API links into UI platform links.
 *
 * API `displayName` is presentation metadata, but known services should still
 * render from shared platform config on the client. That protects cached share
 * pages from stale or malformed backend payloads such as `displayName:
 * "apple-music"` while keeping service validation at the API boundary.
 */
export function apiLinksToPlatformLinks(links: readonly ApiLink[]): PlatformLink[] {
  return links.reduce<PlatformLink[]>((platforms, link) => {
    if (!link.url || !isValidServiceId(link.service)) return platforms;

    platforms.push({
      platform: link.service,
      url: link.url,
      displayName: getPlatformLabel(link.service),
      matchMethod: link.matchMethod,
    });
    return platforms;
  }, []);
}
