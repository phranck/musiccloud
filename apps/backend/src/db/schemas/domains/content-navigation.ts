import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  index,
  integer,
  pgTable,
  primaryKey,
  serial,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { adminUsers } from "./admin-users.js";

// Managed content pages. Created and edited via the dashboard pages
// editor; rendered server-side by the Astro frontend at `/:slug`.
// `slug` remains the legacy primary key during the additive identity transition.
/**
 * Managed content pages rendered by public surfaces.
 * Adds a stable identity and context mask while retaining the slug primary key
 * for existing translation, navigation and segment foreign keys.
 */
export const contentPages = pgTable(
  "content_pages",
  {
    slug: text("slug").primaryKey(),
    id: text("id").notNull().default(sql`gen_random_uuid()::text`).unique(),
    contextMask: integer("context_mask").notNull().default(1),
    title: text("title").notNull(),
    content: text("content").notNull().default(""),
    status: text("status").notNull().default("draft"),
    showTitle: boolean("show_title").notNull().default(true),
    titleAlignment: text("title_alignment").notNull().default("left"),
    pageType: text("page_type").notNull().default("default"),
    displayMode: text("display_mode").notNull().default("fullscreen"),
    overlayWidth: text("overlay_width").notNull().default("regular"),
    contentCardStyle: text("content_card_style").notNull().default("recessed"),
    position: integer("position").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    createdBy: text("created_by").references(() => adminUsers.id, { onDelete: "set null" }),
    updatedAt: timestamp("updated_at", { withTimezone: true }),
    updatedBy: text("updated_by").references(() => adminUsers.id, { onDelete: "set null" }),
    contentUpdatedAt: timestamp("content_updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("idx_content_pages_status_title").on(table.status, table.title),
    index("idx_content_pages_position_created").on(table.position, table.createdAt.desc()),
    check("chk_content_pages_context_mask", sql`${table.contextMask} IN (1, 2, 3)`),
  ],
);

export type ContentPageRow = typeof contentPages.$inferSelect;
export type ContentPageInsert = typeof contentPages.$inferInsert;

/**
 * Context-specific publication metadata for managed content pages.
 * Paths are unique inside a context, while the same canonical path may be
 * claimed once in each public surface.
 */
export const contentPagePublications = pgTable(
  "content_page_publications",
  {
    pageId: text("page_id")
      .notNull()
      .references(() => contentPages.id, { onDelete: "cascade" }),
    context: integer("context").notNull(),
    path: text("path").notNull(),
    status: text("status").notNull().default("draft"),
    templateKey: text("template_key").notNull(),
  },
  (table) => [
    primaryKey({ name: "pk_content_page_publications", columns: [table.pageId, table.context] }),
    uniqueIndex("uq_content_page_publications_context_path").on(table.context, table.path),
    index("idx_content_page_publications_page").on(table.pageId),
    check("chk_content_page_publications_context", sql`${table.context} IN (1, 2)`),
    check("chk_content_page_publications_status", sql`${table.status} IN ('draft', 'published', 'hidden')`),
  ],
);

export type ContentPagePublicationRow = typeof contentPagePublications.$inferSelect;
export type ContentPagePublicationInsert = typeof contentPagePublications.$inferInsert;

// Ordered segment list for pages with `page_type = 'segmented'`.
// Each segment references another content page (must be `page_type = 'default'`).
// Validation of that invariant lives in the service layer.
/**
 * Ordered child-page references for segmented content pages.
 * Each row connects an owner page to a target page with a tab label and
 * position managed by the dashboard.
 */
export const pageSegments = pgTable(
  "page_segments",
  {
    id: serial("id").primaryKey(),
    ownerSlug: text("owner_slug")
      .notNull()
      .references(() => contentPages.slug, { onDelete: "cascade", onUpdate: "cascade" }),
    targetSlug: text("target_slug")
      .notNull()
      .references(() => contentPages.slug, { onDelete: "cascade", onUpdate: "cascade" }),
    position: integer("position").notNull().default(0),
    label: text("label").notNull(),
    labelUpdatedAt: timestamp("label_updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("idx_page_segments_owner").on(table.ownerSlug),
    index("idx_page_segments_owner_position").on(table.ownerSlug, table.position),
  ],
);

export type PageSegmentRow = typeof pageSegments.$inferSelect;
export type PageSegmentInsert = typeof pageSegments.$inferInsert;

/**
 * Semantic navigation entries shared across product contexts and areas.
 * Entries target a stable content-page identity, a configured URL, or a
 * protected system key. Legacy nav id, page slug, and position columns remain
 * populated until all older Frontend consumers have moved to placements.
 */
export const navItems = pgTable(
  "nav_items",
  {
    id: serial("id").primaryKey(),
    navId: text("nav_id").notNull(),
    targetKind: text("target_kind").notNull().default("url"),
    pageId: text("page_id").references(() => contentPages.id, { onDelete: "restrict" }),
    pageSlug: text("page_slug").references(() => contentPages.slug, {
      onDelete: "cascade",
      onUpdate: "cascade",
    }),
    url: text("url"),
    systemKey: text("system_key"),
    target: text("target").notNull().default("_self"),
    contextMask: integer("context_mask").notNull().default(1),
    areaMask: integer("area_mask").notNull().default(1),
    position: integer("position").notNull().default(0),
    label: text("label"),
    labelUpdatedAt: timestamp("label_updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("idx_nav_items_nav").on(table.navId),
    index("idx_nav_items_nav_position").on(table.navId, table.position),
    index("idx_nav_items_page_id").on(table.pageId),
    uniqueIndex("uq_nav_items_system_key").on(table.systemKey).where(sql`${table.systemKey} IS NOT NULL`),
    check("chk_nav_items_target_kind", sql`${table.targetKind} IN ('page', 'url', 'system')`),
    check(
      "chk_nav_items_system_key",
      sql`${table.systemKey} IS NULL OR ${table.systemKey} IN ('docs', 'api-reference', 'search')`,
    ),
    check("chk_nav_items_context_mask", sql`${table.contextMask} IN (1, 2, 3)`),
    check("chk_nav_items_area_mask", sql`${table.areaMask} IN (1, 2, 3)`),
    check("chk_nav_items_system_context", sql`${table.targetKind} <> 'system' OR ${table.contextMask} = 2`),
    check(
      "chk_nav_items_system_target_shape",
      sql`(${table.targetKind} = 'system' AND ${table.systemKey} IS NOT NULL AND ${table.pageId} IS NULL AND ${table.url} IS NULL AND ${table.target} = '_self') OR (${table.targetKind} <> 'system' AND ${table.systemKey} IS NULL)`,
    ),
  ],
);

export type NavItemRow = typeof navItems.$inferSelect;
export type NavItemInsert = typeof navItems.$inferInsert;

/** Independent ordering for every active navigation Context x Area pair. */
export const navigationItemPlacements = pgTable(
  "navigation_item_placements",
  {
    navItemId: integer("nav_item_id")
      .notNull()
      .references(() => navItems.id, { onDelete: "cascade" }),
    context: integer("context").notNull(),
    area: integer("area").notNull(),
    position: integer("position").notNull(),
  },
  (table) => [
    primaryKey({
      name: "pk_navigation_item_placements",
      columns: [table.navItemId, table.context, table.area],
    }),
    uniqueIndex("uq_navigation_item_placements_list_position").on(table.context, table.area, table.position),
    index("idx_navigation_item_placements_item").on(table.navItemId),
    check("chk_navigation_item_placements_context", sql`${table.context} IN (1, 2)`),
    check("chk_navigation_item_placements_area", sql`${table.area} IN (1, 2)`),
    check("chk_navigation_item_placements_position", sql`${table.position} >= 0`),
  ],
);

export type NavigationItemPlacementRow = typeof navigationItemPlacements.$inferSelect;
export type NavigationItemPlacementInsert = typeof navigationItemPlacements.$inferInsert;
