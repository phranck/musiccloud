import type { Icon } from "iconsax-react";
import { BookIcon, CodeIcon, CoinIcon, SearchNormal1Icon } from "@/lib/icons";

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
  { id: "api", href: "/docs/api", icon: CodeIcon, label: "API reference" },
  { id: "pricing", href: "/pricing", icon: CoinIcon, label: "Pricing" },
];

/** Canonical URL handoff lets Search work from every public portal page. */
export const PUBLIC_SEARCH_COMMAND: PublicNavigationCommand = {
  href: "/docs/api?search=1",
  icon: SearchNormal1Icon,
  label: "Search",
  shortcut: "⌘K",
};
