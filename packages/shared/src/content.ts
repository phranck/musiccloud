/**
 * Shared types for content-pages and navigation features. Consumed by
 * backend service layer, dashboard editor, and Astro frontend renderer.
 */

import type {
  ContentContextMask,
  NavigationAreaMask,
  SingleContentContext,
  SingleNavigationArea,
} from "./content-context.js";

export type NavId = "header" | "footer";
export const NavTarget = {
  Self: "_self",
  Blank: "_blank",
} as const;

export type NavTarget = (typeof NavTarget)[keyof typeof NavTarget];

export const NavigationTargetKind = {
  Page: "page",
  Url: "url",
  System: "system",
} as const;

export type NavigationTargetKind = (typeof NavigationTargetKind)[keyof typeof NavigationTargetKind];

export const NavigationSystemKey = {
  Docs: "docs",
  ApiReference: "api-reference",
  Search: "search",
} as const;

export type NavigationSystemKey = (typeof NavigationSystemKey)[keyof typeof NavigationSystemKey];
export type NavigationSystemBehavior = "navigate" | "open-api-search";

export interface NavigationSystemTargetDescriptor {
  readonly key: NavigationSystemKey;
  readonly canonicalRoute: string;
  readonly behavior: NavigationSystemBehavior;
  readonly target: typeof NavTarget.Self;
}

export const NAVIGATION_SYSTEM_TARGETS: Readonly<Record<NavigationSystemKey, NavigationSystemTargetDescriptor>> =
  Object.freeze({
    [NavigationSystemKey.Docs]: Object.freeze({
      key: NavigationSystemKey.Docs,
      canonicalRoute: "/docs",
      behavior: "navigate",
      target: NavTarget.Self,
    }),
    [NavigationSystemKey.ApiReference]: Object.freeze({
      key: NavigationSystemKey.ApiReference,
      canonicalRoute: "/docs/api",
      behavior: "navigate",
      target: NavTarget.Self,
    }),
    [NavigationSystemKey.Search]: Object.freeze({
      key: NavigationSystemKey.Search,
      canonicalRoute: "/docs/api?search=1",
      behavior: "open-api-search",
      target: NavTarget.Self,
    }),
  });

export function isNavigationSystemKey(value: unknown): value is NavigationSystemKey {
  return typeof value === "string" && Object.hasOwn(NAVIGATION_SYSTEM_TARGETS, value);
}

export interface NavigationPlacement {
  context: SingleContentContext;
  area: SingleNavigationArea;
  position: number;
}

export interface NavigationEntryInput {
  targetKind: NavigationTargetKind;
  pageId: string | null;
  url: string | null;
  systemKey: NavigationSystemKey | null;
  target: NavTarget;
  label: string | null;
  contextMask: ContentContextMask;
  areaMask: NavigationAreaMask;
  placements: NavigationPlacement[];
}

export interface NavigationConfigurationInput {
  entries: NavigationEntryInput[];
}

export interface NavigationEntry extends NavigationEntryInput {
  id: number;
  pageSlug: string | null;
  pageTitle: string | null;
  canonicalRoute: string | null;
  behavior: NavigationSystemBehavior | null;
}

export interface NavigationConfiguration {
  entries: NavigationEntry[];
}

export type ContentStatus = "draft" | "published" | "hidden";
export const PageType = {
  Default: "default",
  Segmented: "segmented",
} as const;

export type PageType = (typeof PageType)[keyof typeof PageType];
export const PageDisplayMode = {
  Fullscreen: "fullscreen",
  Embossed: "embossed",
  Translucent: "translucent",
} as const;

export type PageDisplayMode = (typeof PageDisplayMode)[keyof typeof PageDisplayMode];
export type OverlayWidth = "small" | "regular" | "big";
export type PageTitleAlignment = "left" | "center" | "right";

export interface ContentPublication {
  context: SingleContentContext;
  path: string;
  status: ContentStatus;
  templateKey: string;
}

export interface ContentMarkdownValidation {
  ok: boolean;
  errors: Array<{
    extension: string;
    allowedContextMask: ContentContextMask;
  }>;
}

export const PAGE_TITLE_ALIGNMENTS: readonly PageTitleAlignment[] = ["left", "center", "right"] as const;
export const PAGE_TYPES: readonly PageType[] = [PageType.Default, PageType.Segmented] as const;
export const PAGE_DISPLAY_MODES: readonly PageDisplayMode[] = [
  PageDisplayMode.Fullscreen,
  PageDisplayMode.Embossed,
  PageDisplayMode.Translucent,
] as const;
export const OVERLAY_WIDTHS: readonly OverlayWidth[] = ["small", "regular", "big"] as const;

export type ContentCardStyle = "default" | "recessed";
export const CONTENT_CARD_STYLES: readonly ContentCardStyle[] = ["default", "recessed"] as const;

/**
 * The form a page slug takes: lowercase letters, digits and inner hyphens,
 * never a hyphen at either end. The backend checks every create, edit and bulk
 * save against it, and the dashboard's slug inputs use its `source` as their
 * `pattern`. {@link contentSlugFromText} produces it.
 *
 * The hyphen inside the class is escaped because a browser compiles an input's
 * `pattern` with the `v` flag, which refuses an unescaped `-` at the end of a
 * class and then ignores the whole pattern.
 */
// biome-ignore lint/complexity/noUselessEscapeInRegex: a browser reads this as an input pattern with the v flag, which needs the escape.
export const CONTENT_SLUG_PATTERN = /^[a-z0-9](?:[a-z0-9\-]*[a-z0-9])?$/;

/** The longest slug a page may have. */
export const CONTENT_SLUG_MAX_LENGTH = 100;

/**
 * Turns a title, or whatever an editor typed into the slug field, into a slug
 * the backend accepts. The dashboard suggests it while a title is typed and
 * applies it when the slug field loses focus.
 *
 * German umlauts and `ß` are spelled out, every other run of characters
 * outside `a-z0-9` becomes one hyphen, and the result is cut to
 * {@link CONTENT_SLUG_MAX_LENGTH} before the hyphens at either end are removed,
 * so a cut never leaves one behind.
 *
 * @param text - The text to derive the slug from.
 * @returns A slug matching {@link CONTENT_SLUG_PATTERN}, or an empty string
 *   when the text holds no letter or digit.
 */
export function contentSlugFromText(text: string): string {
  return text
    .toLowerCase()
    .replace(/ä/g, "ae")
    .replace(/ö/g, "oe")
    .replace(/ü/g, "ue")
    .replace(/ß/g, "ss")
    .replace(/[^a-z0-9]+/g, "-")
    .slice(0, CONTENT_SLUG_MAX_LENGTH)
    .replace(/^-+|-+$/g, "");
}

/** The longest title a page may have. */
export const CONTENT_TITLE_MAX_LENGTH = 200;

/** The longest Markdown body a page may have. */
export const CONTENT_BODY_MAX_LENGTH = 100_000;

export interface NavItem {
  id: number;
  navId: NavId;
  pageSlug: string | null;
  pageTitle: string | null;
  url: string | null;
  target: NavTarget;
  label: string | null;
  position: number;
  /** Display hints for frontend nav-click interception; null when item points at an external URL. */
  pageType: PageType | null;
  pageDisplayMode: PageDisplayMode | null;
  pageOverlayWidth: OverlayWidth | null;
}

export interface NavItemInput {
  pageSlug?: string | null;
  url?: string | null;
  label?: string | null;
  target?: NavTarget;
}

export interface PageSegment {
  id: number;
  position: number;
  label: string;
  targetSlug: string;
}

export interface PageSegmentInput {
  position: number;
  label: string;
  targetSlug: string;
}

export interface PageSegmentSummary {
  position: number;
  label: string;
  targetSlug: string;
}

export interface ContentPageSummary {
  id: string;
  slug: string;
  contextMask: ContentContextMask;
  publications: ContentPublication[];
  title: string;
  status: ContentStatus;
  showTitle: boolean;
  titleAlignment: PageTitleAlignment;
  pageType: PageType;
  displayMode: PageDisplayMode;
  overlayWidth: OverlayWidth;
  contentCardStyle: ContentCardStyle;
  createdByUsername: string | null;
  updatedByUsername: string | null;
  createdAt: string;
  updatedAt: string | null;
  segments?: PageSegmentSummary[];
}

export interface ContentPage extends ContentPageSummary {
  content: string;
  segments: PageSegment[];
  /** Additive compatibility field; new admin responses always include it. */
  markdownValidation?: ContentMarkdownValidation;
}

export interface PublicPageSegment {
  label: string;
  targetSlug: string;
  title: string;
  showTitle: boolean;
  content: string;
  contentHtml: string;
}

export interface PublicContentPage {
  slug: string;
  title: string;
  showTitle: boolean;
  titleAlignment: PageTitleAlignment;
  pageType: PageType;
  displayMode: PageDisplayMode;
  overlayWidth: OverlayWidth;
  contentCardStyle: ContentCardStyle;
  content: string;
  contentHtml: string;
  segments: PublicPageSegment[];
}

/** Published editorial Page rendered by the public Developer Portal SSR shell. */
export interface DeveloperPortalEditorialPage {
  id: string;
  path: string;
  title: string;
  showTitle: boolean;
  titleAlignment: PageTitleAlignment;
  pageType: PageType;
  displayMode: PageDisplayMode;
  overlayWidth: OverlayWidth;
  contentCardStyle: ContentCardStyle;
  templateKey: string;
  /** Sanitized HTML produced by the context-aware Backend Markdown renderer. */
  contentHtml: string;
}

/** One public Developer Portal navigation destination resolved for SSR. */
export interface DeveloperPortalNavigationItem {
  id: string;
  label: string;
  href: string;
  target: NavTarget;
  targetKind: NavigationTargetKind;
  systemKey: NavigationSystemKey | null;
  behavior: NavigationSystemBehavior;
}

/** One independently ordered Developer Portal Main or Footer projection. */
export interface DeveloperPortalNavigation {
  area: SingleNavigationArea;
  items: DeveloperPortalNavigationItem[];
}

export interface PagesBulkPagesEntry {
  slug: string;
  meta?: Partial<{
    contextMask: ContentContextMask;
    publications: ContentPublication[];
    title: string;
    slug: string;
    status: ContentStatus;
    displayMode: PageDisplayMode;
    overlayWidth: OverlayWidth;
    titleAlignment: PageTitleAlignment;
    contentCardStyle: ContentCardStyle;
    showTitle: boolean;
    pageType: PageType;
  }>;
  content?: string;
}

export interface PagesBulkSegmentsEntry {
  ownerSlug: string;
  segments: PageSegmentInput[];
}

export interface PagesBulkRequest {
  pages?: PagesBulkPagesEntry[];
  segments?: PagesBulkSegmentsEntry[];
  topLevelOrder?: string[];
}

export interface PagesBulkResponse {
  pages: ContentPageSummary[];
}

export type PagesBulkErrorDetail = {
  section: "pages" | "segments" | "topLevelOrder";
  index: number;
  message: string;
};
