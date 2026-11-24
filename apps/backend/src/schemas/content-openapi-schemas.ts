/**
 * @file OpenAPI schemas for the site content that the internal SSR routes serve:
 * content pages, their segments and summaries, navigation items and the
 * active services. They describe the shapes in `@musiccloud/shared`'s
 * `content.ts` and `api.ts`, and `OPENAPI_SCHEMAS` registers them with the
 * rest.
 */

import {
  CONTENT_CARD_STYLES,
  CONTENT_STATUSES,
  OVERLAY_WIDTHS,
  PAGE_DISPLAY_MODES,
  PAGE_TITLE_ALIGNMENTS,
  PAGE_TYPES,
} from "@musiccloud/shared";

/** OpenAPI schema `PublicPageSegment`: one segment of a segmented public content page. */
export const PublicPageSegmentSchema = {
  $id: "PublicPageSegment",
  type: "object",
  description: "One segment of a segmented public content page — carries the target page's rendered body.",
  required: ["label", "targetSlug", "title", "showTitle", "content", "contentHtml"],
  additionalProperties: false,
  properties: {
    label: { type: "string", description: "Segmented-control label shown above the body." },
    targetSlug: { type: "string", description: "Slug of the default content page that supplies the body." },
    title: { type: "string" },
    showTitle: { type: "boolean" },
    content: { type: "string", description: "Original Markdown source of the target page." },
    contentHtml: { type: "string", description: "Server-rendered HTML of the target page." },
  },
  example: {
    label: "Overview",
    targetSlug: "about-overview",
    title: "Overview",
    showTitle: true,
    content: "…",
    contentHtml: "<p>…</p>",
  },
} as const;

/** OpenAPI schema `PublicContentPage`: a published content page in the form the frontend renders. */
export const PublicContentPageSchema = {
  $id: "PublicContentPage",
  type: "object",
  description: "A published content page in the form the frontend renders.",
  required: [
    "slug",
    "title",
    "showTitle",
    "titleAlignment",
    "pageType",
    "displayMode",
    "overlayWidth",
    "contentCardStyle",
    "content",
    "contentHtml",
    "segments",
  ],
  additionalProperties: false,
  properties: {
    slug: { type: "string", description: "URL-safe identifier; appears in the page URL." },
    title: { type: "string" },
    showTitle: { type: "boolean", description: "When false the frontend suppresses the <h1> header." },
    titleAlignment: { type: "string", enum: PAGE_TITLE_ALIGNMENTS },
    pageType: { type: "string", enum: PAGE_TYPES },
    displayMode: { type: "string", enum: PAGE_DISPLAY_MODES },
    overlayWidth: { type: "string", enum: OVERLAY_WIDTHS },
    contentCardStyle: {
      type: "string",
      enum: CONTENT_CARD_STYLES,
      description: "Whether the body sits on the default card or in a recessed well.",
    },
    content: { type: "string", description: "Original Markdown source." },
    contentHtml: { type: "string", description: "Server-rendered HTML (safe subset)." },
    segments: {
      type: "array",
      items: { $ref: "PublicPageSegment#" },
      description: "Empty for default pages; populated for segmented pages.",
    },
  },
  example: {
    slug: "about",
    title: "About musiccloud",
    showTitle: true,
    titleAlignment: "left",
    pageType: "default",
    displayMode: "fullscreen",
    overlayWidth: "regular",
    contentCardStyle: "default",
    content:
      "## Our mission\n\nOne URL, every streaming service. musiccloud.io is a free tool that helps you share music across platforms without friction.",
    contentHtml:
      "<h2>Our mission</h2>\n<p>One URL, every streaming service. musiccloud.io is a free tool that helps you share music across platforms without friction.</p>\n",
    segments: [],
  },
} as const;

/** OpenAPI schema `ContentPageSummary`: a content page entry without its body, for list views. */
export const ContentPageSummarySchema = {
  $id: "ContentPageSummary",
  type: "object",
  description: "Lightweight content-page entry (no body) for list views.",
  required: [
    "slug",
    "title",
    "status",
    "showTitle",
    "titleAlignment",
    "pageType",
    "displayMode",
    "overlayWidth",
    "createdAt",
  ],
  additionalProperties: false,
  properties: {
    slug: { type: "string" },
    title: { type: "string" },
    status: { type: "string", enum: CONTENT_STATUSES },
    showTitle: { type: "boolean" },
    titleAlignment: { type: "string", enum: PAGE_TITLE_ALIGNMENTS },
    pageType: { type: "string", enum: PAGE_TYPES },
    displayMode: { type: "string", enum: PAGE_DISPLAY_MODES },
    overlayWidth: { type: "string", enum: OVERLAY_WIDTHS },
    createdByUsername: { type: "string", nullable: true },
    updatedByUsername: { type: "string", nullable: true },
    createdAt: { type: "string", format: "date-time" },
    updatedAt: { type: "string", nullable: true, format: "date-time" },
  },
  example: {
    slug: "about",
    title: "About musiccloud",
    status: "published",
    showTitle: true,
    titleAlignment: "left",
    pageType: "default",
    displayMode: "fullscreen",
    overlayWidth: "regular",
    createdByUsername: "admin",
    updatedByUsername: "admin",
    createdAt: "2026-02-14T08:17:03.000Z",
    updatedAt: "2026-04-18T19:25:41.000Z",
  },
} as const;

/** OpenAPI schema `NavItem`: one entry of the managed header or footer navigation. */
export const NavItemSchema = {
  $id: "NavItem",
  type: "object",
  description: "One entry in a managed navigation (header or footer).",
  required: ["id", "navId", "target", "position"],
  additionalProperties: false,
  properties: {
    id: { type: "integer" },
    navId: { type: "string", enum: ["header", "footer"] },
    pageSlug: { type: "string", nullable: true, description: "Set when the item links to a managed content page." },
    pageTitle: { type: "string", nullable: true },
    url: { type: "string", nullable: true, format: "uri", description: "Set when the item is an external link." },
    target: { type: "string", enum: ["_self", "_blank"] },
    label: {
      type: "string",
      nullable: true,
      description:
        "Resolved display label: the custom label when present, otherwise the linked pageTitle; null only for an unlabeled non-page target.",
    },
    position: { type: "integer", minimum: 0, description: "Sort order (ascending)." },
    pageType: {
      type: "string",
      nullable: true,
      enum: [...PAGE_TYPES, null],
      description: "Display hint for nav-click interception; null for external-URL items.",
    },
    pageDisplayMode: {
      type: "string",
      nullable: true,
      enum: [...PAGE_DISPLAY_MODES, null],
    },
    pageOverlayWidth: {
      type: "string",
      nullable: true,
      enum: [...OVERLAY_WIDTHS, null],
    },
  },
  example: {
    id: 7,
    navId: "footer",
    pageSlug: "about",
    pageTitle: "About musiccloud",
    url: null,
    target: "_self",
    label: "About musiccloud",
    position: 0,
    pageType: "default",
    pageDisplayMode: "fullscreen",
    pageOverlayWidth: "regular",
  },
} as const;

/** OpenAPI schema `ActiveService`: one enabled streaming service as the landing page marquee shows it. */
export const ActiveServiceSchema = {
  $id: "ActiveService",
  type: "object",
  description: "Public-facing entry for an enabled streaming service (used by the landing-page marquee).",
  required: ["id", "displayName", "color"],
  additionalProperties: false,
  properties: {
    id: { type: "string", description: "Stable service id (e.g. 'spotify', 'tidal')." },
    displayName: { type: "string" },
    color: { type: "string", description: "Brand accent colour as a hex string." },
  },
  example: {
    id: "spotify",
    displayName: "Spotify",
    color: "#1db954",
  },
} as const;
