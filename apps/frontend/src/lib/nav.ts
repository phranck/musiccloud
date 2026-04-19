import type { NavItem } from "@musiccloud/shared";

/**
 * Returns a safe href for a nav item. Backend-controlled `item.url` is
 * whitelisted to `http://`, `https://`, `mailto:`, `tel:`, or a root-relative
 * `/` path; anything else (including `javascript:`, `data:`) collapses to `#`
 * so a compromised admin cannot inject a clickable script URL.
 */
export function navHref(item: NavItem): string {
  if (item.pageSlug) return `/${item.pageSlug}`;
  if (item.url && isSafeNavUrl(item.url)) return item.url;
  return "#";
}

export function navLabel(item: NavItem): string {
  return item.label || item.pageTitle || item.url || "—";
}

function isSafeNavUrl(url: string): boolean {
  const trimmed = url.trim();
  return (
    trimmed.startsWith("/") || /^https?:\/\//i.test(trimmed) || /^mailto:/i.test(trimmed) || /^tel:/i.test(trimmed)
  );
}
