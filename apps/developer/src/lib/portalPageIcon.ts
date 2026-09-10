/**
 * @file The icon a portal page carries beside its title.
 *
 * An editorial page has no field for this, and it should not: an icon is part
 * of how the portal presents a page rather than part of what the page says. The
 * two pages that used to be markup each had one, and losing them whilst moving
 * their copy into the dashboard would be a visible regression for no reason.
 *
 * Anything not named here gets the general one, which is what every editorial
 * page had before this existed.
 */

import { BookIcon, Like1Icon, ScrollIcon } from "@/lib/icons";

/** The icon an editorial page carries when nothing more specific applies. */
const DEFAULT_PAGE_ICON = ScrollIcon;

/** The pages whose icon is part of how the portal is read. */
const ICONS_BY_PATH = {
  "/docs": BookIcon,
  "/pricing": Like1Icon,
} as const;

/**
 * The icon for one page.
 *
 * @param path - Where the page is published.
 * @returns The icon component to render beside its title.
 */
export function portalPageIcon(path: string): typeof DEFAULT_PAGE_ICON {
  return ICONS_BY_PATH[path as keyof typeof ICONS_BY_PATH] ?? DEFAULT_PAGE_ICON;
}
