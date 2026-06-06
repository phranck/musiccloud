/**
 * Shared types for content-pages and navigation features. Consumed by
 * backend service layer, dashboard editor, and Astro frontend renderer.
 */

import type { Locale } from "./locales.js";

export type NavId = "header" | "footer";
export type NavTarget = "_self" | "_blank";

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

export type TranslationStatus = "missing" | "stale" | "ready";

export interface PageTranslation {
  locale: Locale;
  title: string;
  content: string;
  isStale: boolean;
  sourceUpdatedAt: string | null;
  updatedAt: string;
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
  translations?: Partial<Record<Locale, string>>;
}

export interface NavItemInput {
  pageSlug?: string | null;
  url?: string | null;
  label?: string | null;
  target?: NavTarget;
  translations?: Partial<Record<Locale, string>>;
}

export interface PageSegment {
  id: number;
  position: number;
  label: string;
  targetSlug: string;
  translations?: Partial<Record<Locale, string>>;
}

export interface PageSegmentInput {
  position: number;
  label: string;
  targetSlug: string;
  translations?: Partial<Record<Locale, string>>;
}

export interface PageSegmentSummary {
  position: number;
  label: string;
  targetSlug: string;
}

export interface ContentPageSummary {
  slug: string;
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
  translationStatus: Record<Locale, TranslationStatus>;
}

export interface ContentPage extends ContentPageSummary {
  content: string;
  segments: PageSegment[];
  translations: PageTranslation[];
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

export interface PagesBulkPagesEntry {
  slug: string;
  meta?: Partial<{
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

export interface PagesBulkPageTranslationEntry {
  slug: string;
  locale: Locale;
  title?: string;
  content?: string;
}

export interface PagesBulkRequest {
  pages?: PagesBulkPagesEntry[];
  segments?: PagesBulkSegmentsEntry[];
  pageTranslations?: PagesBulkPageTranslationEntry[];
  topLevelOrder?: string[];
}

export interface PagesBulkResponse {
  pages: ContentPageSummary[];
}

export type PagesBulkErrorDetail = {
  section: "pages" | "segments" | "pageTranslations" | "topLevelOrder";
  index: number;
  message: string;
};
