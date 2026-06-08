import type { NavItem } from "@musiccloud/shared";
import { infoPageSignal, NavSignal, sendMusicSignal } from "@/lib/analytics/umami";

/**
 * Sends the appropriate Umami event for a navigation click.
 *
 * A `pageSlug` indicates an internal info/content page — the event is
 * `Info: {Slug humanized}` (e.g. `Info: Imprint`, `Info: Help`,
 * `Info: About Site`). A link without `pageSlug` but with `url` is an
 * external nav item — collapsed to the generic `Nav: External` event so
 * the Umami events list stays bounded when admins add new external links.
 * Placeholder items (no slug, no url) are not tracked.
 */
export function sendNavInteractionSignal(item: NavItem): void {
  const slug = item.pageSlug ?? undefined;
  if (slug) {
    sendMusicSignal(infoPageSignal(slug));
    return;
  }
  if (item.url) {
    sendMusicSignal(NavSignal.External);
  }
}
