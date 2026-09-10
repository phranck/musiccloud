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
 * The pages whose title stands on its own.
 *
 * The home page opens the portal, and its title is the first thing read on it.
 * A symbol beside that reads as a label on a section rather than as a greeting,
 * which is why the page never had one.
 */
const PATHS_WITHOUT_ICON = new Set(["/"]);

/**
 * The icon for one page.
 *
 * @param path - Where the page is published.
 * @returns The icon component to render beside its title, or `null` where the
 *   title stands on its own.
 */
export function portalPageIcon(path: string): typeof DEFAULT_PAGE_ICON | null {
  if (PATHS_WITHOUT_ICON.has(path)) return null;
  return ICONS_BY_PATH[path as keyof typeof ICONS_BY_PATH] ?? DEFAULT_PAGE_ICON;
}
