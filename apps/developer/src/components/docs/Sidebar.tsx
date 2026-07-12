/**
 * Semantic compound sidebar used by dense Developer Portal navigation rails.
 *
 * Structure and styling remain independent from API-reference data so future
 * documentation chapters can reuse the same normalized header/body/section
 * hierarchy without rebuilding navigation markup.
 */

import type { AnchorHTMLAttributes, ComponentPropsWithoutRef, JSX } from "react";
import { createElement } from "react";
import { joinClassNames } from "@/components/docs/classNames";

type SidebarProps = ComponentPropsWithoutRef<"nav">;
type SidebarHeaderProps = ComponentPropsWithoutRef<"header">;
type SidebarHeaderAddonProps = ComponentPropsWithoutRef<"div">;
type SidebarBodyProps = ComponentPropsWithoutRef<"div">;
type SidebarSectionProps = ComponentPropsWithoutRef<"details">;
type SidebarSectionHeaderProps = ComponentPropsWithoutRef<"summary">;
type SidebarSectionHeaderTitleProps = ComponentPropsWithoutRef<"h3">;
type SidebarSectionHeaderAddonsProps = ComponentPropsWithoutRef<"div">;
type SidebarSectionItemsProps = ComponentPropsWithoutRef<"ul">;
type SidebarChapterProps = AnchorHTMLAttributes<HTMLAnchorElement>;

interface SidebarSectionItemProps extends AnchorHTMLAttributes<HTMLAnchorElement> {
  itemClassName?: string;
}

/** Creates a class-bound semantic slot while retaining native element props. */
function slot<Tag extends keyof JSX.IntrinsicElements>(tag: Tag, baseClassName: string) {
  type Props = ComponentPropsWithoutRef<Tag> & { className?: string };
  const Slot = ({ className, ...props }: Props) =>
    createElement(tag, { ...props, className: joinClassNames(baseClassName, className) });
  Slot.displayName = `SidebarSlot(${tag}.${baseClassName})`;
  return Slot;
}

const SidebarRoot = slot("nav", "sidebar");
const SidebarHeader = slot("header", "sidebar__header");
const SidebarHeaderAddon = slot("div", "sidebar__header-addon");
const SidebarBody = slot("div", "sidebar__body");
const SidebarSection = slot("details", "sidebar__section");
const SidebarSectionHeader = slot("summary", "sidebar__section-header");
const SidebarSectionHeaderTitle = slot("h3", "sidebar__section-header-title");
const SidebarSectionHeaderAddons = slot("div", "sidebar__section-header-addons");
const SidebarSectionItems = slot("ul", "sidebar__section-items");

/** Renders a non-collapsible, repeatable destination such as an API chapter. */
function SidebarChapter({ children, className, ...props }: SidebarChapterProps) {
  return (
    <a {...props} className={joinClassNames("sidebar__chapter", className)}>
      {children}
    </a>
  );
}

/** Normalizes the list-item wrapper while leaving link metadata extensible. */
export function SidebarSectionItem({ children, itemClassName, className, ...props }: SidebarSectionItemProps) {
  return (
    <li className={joinClassNames("sidebar__section-item", itemClassName)}>
      <a {...props} className={className}>
        {children}
      </a>
    </li>
  );
}

/** Complete sidebar compound API shared by API reference navigation. */
export const Sidebar = Object.assign(SidebarRoot, {
  Header: Object.assign(SidebarHeader, {
    Addon: SidebarHeaderAddon,
  }),
  Body: SidebarBody,
  Chapter: SidebarChapter,
  Section: Object.assign(SidebarSection, {
    Header: Object.assign(SidebarSectionHeader, {
      Addons: SidebarSectionHeaderAddons,
      Title: SidebarSectionHeaderTitle,
    }),
    Items: SidebarSectionItems,
  }),
});

export type {
  SidebarBodyProps,
  SidebarChapterProps,
  SidebarHeaderAddonProps,
  SidebarHeaderProps,
  SidebarProps,
  SidebarSectionHeaderAddonsProps,
  SidebarSectionHeaderProps,
  SidebarSectionHeaderTitleProps,
  SidebarSectionItemProps,
  SidebarSectionItemsProps,
  SidebarSectionProps,
};
