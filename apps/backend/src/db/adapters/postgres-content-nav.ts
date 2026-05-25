/**
 * Navigation domain: site navigation items (`nav_items`) plus their
 * per-locale translations (`nav_item_translations`).
 *
 * Scope:
 *   - List items for one navigation surface (`primary`, `footer`, ...).
 *   - Atomic replace of an entire nav list (delete-all + insert in tx).
 *   - List / replace per-item translations.
 *
 * Excludes:
 *   - Content page content / metadata (see `postgres-content-pages.ts`).
 *   - Page-segment translations (handled with segments in
 *     `postgres-content-pages.ts`).
 */

import type { OverlayWidth, PageDisplayMode, PageType } from "@musiccloud/shared";
import type { Pool } from "pg";
import type { NavId, NavItemReplaceInput, NavItemRow, NavItemTranslationRow, NavTarget } from "../admin-repository.js";

// ============================================================================
// ROW TYPES
// ============================================================================

interface NavItemSqlRow {
  id: number;
  nav_id: string;
  page_slug: string | null;
  url: string | null;
  target: string;
  position: number;
  label: string | null;
  label_updated_at: Date;
  page_title: string | null;
  page_type: string | null;
  display_mode: string | null;
  overlay_width: string | null;
}

// ============================================================================
// MAPPERS
// ============================================================================

/**
 * Maps a `nav_items + content_pages`-joined row to {@link NavItemRow}.
 * Joined-page columns are nullable when the item points to an external
 * URL instead of a content page.
 */
function rowToNavItem(row: NavItemSqlRow): NavItemRow {
  return {
    id: row.id,
    navId: row.nav_id as NavId,
    pageSlug: row.page_slug,
    pageTitle: row.page_title,
    url: row.url,
    target: row.target as NavTarget,
    label: row.label,
    position: row.position,
    labelUpdatedAt: row.label_updated_at,
    pageType: row.page_type === null ? null : (row.page_type as PageType),
    pageDisplayMode: row.display_mode === null ? null : (row.display_mode as PageDisplayMode),
    pageOverlayWidth: row.overlay_width === null ? null : (row.overlay_width as OverlayWidth),
  };
}

// ============================================================================
// NAV ITEMS
// ============================================================================

/**
 * Lists every nav item for one navigation surface, joined with its
 * referenced content page (when any) so the admin UI can show the
 * page's title / type / display mode inline.
 *
 * @param pool - Postgres connection pool.
 * @param navId - The navigation surface key (e.g. `"primary"`).
 * @returns Items ordered by `position` ascending, then `id`.
 */
export async function listAdminNavItems(pool: Pool, navId: NavId): Promise<NavItemRow[]> {
  const result = await pool.query(
    `SELECT n.id, n.nav_id, n.page_slug, n.url, n.target, n.position, n.label, n.label_updated_at,
            p.title AS page_title,
            p.page_type, p.display_mode, p.overlay_width
     FROM nav_items n
     LEFT JOIN content_pages p ON p.slug = n.page_slug
     WHERE n.nav_id = $1
     ORDER BY n.position ASC, n.id ASC`,
    [navId],
  );
  return result.rows.map(rowToNavItem);
}

/**
 * Replaces every nav item for one surface in a single transaction:
 * deletes existing rows, inserts the new ones with positions matching
 * their input order, then re-reads the surface via
 * {@link listAdminNavItems} so the response includes the joined page
 * columns.
 *
 * @remarks Defaults `target = "_self"`. `pageSlug`, `url`, and `label`
 *   may be `null` (e.g. external URL with separate label set via
 *   translations).
 *
 * @param pool - Postgres connection pool.
 * @param navId - The navigation surface to replace.
 * @param items - The new item list in the desired display order.
 * @returns The newly-persisted items, re-read for the admin UI.
 */
export async function replaceAdminNavItems(
  pool: Pool,
  navId: NavId,
  items: NavItemReplaceInput[],
): Promise<NavItemRow[]> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query(`DELETE FROM nav_items WHERE nav_id = $1`, [navId]);
    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      await client.query(
        `INSERT INTO nav_items (nav_id, page_slug, url, target, position, label)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [navId, item.pageSlug ?? null, item.url ?? null, item.target ?? "_self", i, item.label ?? null],
      );
    }
    await client.query("COMMIT");
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
  return listAdminNavItems(pool, navId);
}

// ============================================================================
// NAV ITEM TRANSLATIONS
// ============================================================================

/**
 * Lists every translation row for items belonging to one navigation
 * surface, ordered by `nav_item_id` then `locale`.
 *
 * @param pool - Postgres connection pool.
 * @param navId - The navigation surface key.
 * @returns Flat list of translations; the caller groups by
 *   `navItemId` if a nested structure is needed.
 */
export async function listNavTranslations(pool: Pool, navId: NavId): Promise<NavItemTranslationRow[]> {
  const result = await pool.query<{
    nav_item_id: number;
    locale: string;
    label: string;
    source_updated_at: Date | null;
    updated_at: Date;
  }>(
    `SELECT nit.nav_item_id, nit.locale, nit.label, nit.source_updated_at, nit.updated_at
     FROM nav_item_translations nit
     JOIN nav_items ni ON ni.id = nit.nav_item_id
     WHERE ni.nav_id = $1
     ORDER BY nit.nav_item_id, nit.locale`,
    [navId],
  );
  return result.rows.map((r) => ({
    navItemId: r.nav_item_id,
    locale: r.locale,
    label: r.label,
    sourceUpdatedAt: r.source_updated_at,
    updatedAt: r.updated_at,
  }));
}

/**
 * Replaces every translation row for one nav item: delete-all + insert
 * in a single transaction.
 *
 * @param pool - Postgres connection pool.
 * @param navItemId - The nav item's id.
 * @param translations - The new translation list. Each entry needs
 *   `locale`, `label` and an optional `sourceUpdatedAt` audit
 *   timestamp.
 */
export async function replaceNavItemTranslations(
  pool: Pool,
  navItemId: number,
  translations: { locale: string; label: string; sourceUpdatedAt: Date | null }[],
): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query(`DELETE FROM nav_item_translations WHERE nav_item_id = $1`, [navItemId]);
    for (const t of translations) {
      await client.query(
        `INSERT INTO nav_item_translations (nav_item_id, locale, label, source_updated_at)
         VALUES ($1, $2, $3, $4)`,
        [navItemId, t.locale, t.label, t.sourceUpdatedAt],
      );
    }
    await client.query("COMMIT");
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}
