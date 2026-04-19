/**
 * Shared types for content-pages and navigation features. Consumed by
 * backend service layer, dashboard editor, and Astro frontend renderer.
 */

export type NavId = "header" | "footer";
export type NavTarget = "_self" | "_blank";

export type ContentStatus = "draft" | "published" | "hidden";
export type PageType = "default" | "segmented";
export type PageDisplayMode = "fullscreen" | "embossed" | "translucent";
export type OverlayWidth = "small" | "regular" | "big";
export type OverlayHeight = "small" | "regular" | "dynamic" | "expanded";
export type PageTitleAlignment = "left" | "center" | "right";

export const PAGE_TITLE_ALIGNMENTS: readonly PageTitleAlignment[] = ["left", "center", "right"] as const;
export const PAGE_TYPES: readonly PageType[] = ["default", "segmented"] as const;
export const PAGE_DISPLAY_MODES: readonly PageDisplayMode[] = ["fullscreen", "embossed", "translucent"] as const;
export const OVERLAY_WIDTHS: readonly OverlayWidth[] = ["small", "regular", "big"] as const;
export const OVERLAY_HEIGHTS: readonly OverlayHeight[] = ["small", "regular", "dynamic", "expanded"] as const;

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
  pageOverlayHeight: OverlayHeight | null;
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

export interface ContentPageSummary {
  slug: string;
  title: string;
  status: ContentStatus;
  showTitle: boolean;
  titleAlignment: PageTitleAlignment;
  pageType: PageType;
  displayMode: PageDisplayMode;
  overlayWidth: OverlayWidth;
  overlayHeight: OverlayHeight;
  createdByUsername: string | null;
  updatedByUsername: string | null;
  createdAt: string;
  updatedAt: string | null;
}

export interface ContentPage extends ContentPageSummary {
  content: string;
  segments: PageSegment[];
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
  overlayHeight: OverlayHeight;
  content: string;
  contentHtml: string;
  segments: PublicPageSegment[];
}
