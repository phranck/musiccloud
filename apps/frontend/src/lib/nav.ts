import { isSafeNavigationUrl, type NavItem } from "@musiccloud/shared";

/**
 * Returns a safe href for a nav item. A page link becomes its path; a stored
 * URL is kept only where {@link isSafeNavigationUrl} accepts it, which is the
 * rule the API applied when the link was saved: a path on this site, an
 * `https` address, `http` on a loopback host, or `mailto:`. Anything else,
 * including `javascript:`, `//host` and `/\host`, collapses to `#`, so a link
 * stored before that rule cannot leave the site or run script.
 */
export function navHref(item: NavItem): string {
  if (item.pageSlug) return `/${item.pageSlug}`;
  if (item.url && isSafeNavigationUrl(item.url)) return item.url;
  return "#";
}

export function navLabel(item: NavItem): string {
  return item.label || item.pageTitle || item.url || "—";
}
