/**
 * Shared types for content-pages and navigation features. Consumed by
 * backend service layer, dashboard editor, and Astro frontend renderer.
 */

export type NavId = "header" | "footer";
export type NavTarget = "_self" | "_blank";

export interface NavItem {
  id: number;
  navId: NavId;
  pageSlug: string | null;
  pageTitle: string | null;
  url: string | null;
  target: NavTarget;
  label: string | null;
  position: number;
}

export interface NavItemInput {
  pageSlug?: string | null;
  url?: string | null;
  label?: string | null;
  target?: NavTarget;
}

export type ContentStatus = "draft" | "published" | "hidden";

export interface ContentPageSummary {
  slug: string;
  title: string;
  status: ContentStatus;
  showTitle: boolean;
  createdByUsername: string | null;
  updatedByUsername: string | null;
  createdAt: string;
  updatedAt: string | null;
}

export interface ContentPage extends ContentPageSummary {
  content: string;
}

export interface PublicContentPage {
  slug: string;
  title: string;
  showTitle: boolean;
  content: string;
  contentHtml: string;
}
