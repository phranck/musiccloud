import type { DeveloperPortalNavigationItem } from "@musiccloud/shared";
import { NavigationSystemKey } from "@musiccloud/shared";
import type { Icon } from "iconsax-react";
import { BookIcon, DataIcon, DollarSquareIcon, LinkIcon, SearchStatusIcon } from "@/lib/icons";

/** Stable identifier for a public Developer Portal navigation destination. */
export type PublicNavigationId = "docs" | "api" | "pricing";

/** One public navigation destination shared by desktop and mobile rendering. */
export interface PublicNavigationItem {
  id: PublicNavigationId;
  href: string;
  icon: Icon;
  label: string;
}

/** A global navigation command that opens the API-reference search dialog. */
export interface PublicNavigationCommand {
  href: string;
  icon: Icon;
  label: string;
  shortcut: string;
}

/** Canonical public navigation order. */
export const PUBLIC_NAV_ITEMS: readonly PublicNavigationItem[] = [
  { id: "docs", href: "/docs", icon: BookIcon, label: "Docs" },
  { id: "api", href: "/docs/api", icon: DataIcon, label: "API reference" },
  { id: "pricing", href: "/pricing", icon: DollarSquareIcon, label: "Pricing" },
];

/** Canonical URL handoff lets Search work from every public portal page. */
export const PUBLIC_SEARCH_COMMAND: PublicNavigationCommand = {
  href: "/docs/api?search=1",
  icon: SearchStatusIcon,
  label: "Search",
  shortcut: "⌘K",
};

/** Resolves the established Portal icon recipe for managed navigation data. */
export function publicNavigationIcon(item: DeveloperPortalNavigationItem): Icon {
  if (item.systemKey === NavigationSystemKey.Docs) return BookIcon;
  if (item.systemKey === NavigationSystemKey.ApiReference) return DataIcon;
  if (item.systemKey === NavigationSystemKey.Search) return SearchStatusIcon;
  if (item.href === "/pricing") return DollarSquareIcon;
  return LinkIcon;
}

/** Maps canonical managed destinations onto the legacy active-page prop. */
export function publicNavigationId(item: DeveloperPortalNavigationItem): PublicNavigationId | undefined {
  if (item.systemKey === NavigationSystemKey.Docs) return "docs";
  if (item.systemKey === NavigationSystemKey.ApiReference) return "api";
  if (item.href === "/pricing") return "pricing";
  return undefined;
}
