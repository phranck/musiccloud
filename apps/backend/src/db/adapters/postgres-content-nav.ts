/**
 * Navigation domain: canonical site navigation items (`nav_items`).
 *
 * Scope:
 *   - Read and atomically replace the complete semantic configuration,
 *     concrete Context x Area placements.
 *   - Preserve legacy Frontend header/footer reads and writes during the
 *     additive migration period.
 *
 * Excludes:
 *   - Content page content / metadata (see `postgres-content-pages.ts`).
 */

import {
  ContentContext,
  NavigationArea,
  type NavigationAreaMask,
  type NavigationPlacement,
  type NavigationSystemKey,
  type NavigationTargetKind,
  type OverlayWidth,
  type PageDisplayMode,
  type PageType,
} from "@musiccloud/shared";
import type { Pool, PoolClient } from "pg";
import type {
  NavId,
  NavItemReplaceInput,
  NavItemRow,
  NavigationConfigurationEntryRow,
  NavigationConfigurationReplaceInput,
  NavTarget,
} from "../admin-repository.js";

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

interface NavigationConfigurationSqlRow {
  id: number;
  target_kind: string;
  page_id: string | null;
  page_slug: string | null;
  page_title: string | null;
  url: string | null;
  system_key: string | null;
  target: string;
  label: string | null;
  context_mask: number;
  area_mask: number;
  label_updated_at: Date;
}

interface NavigationPlacementSqlRow {
  nav_item_id: number;
  context: number;
  area: number;
  position: number;
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

function legacyPlacement(navId: NavId): {
  context: typeof ContentContext.Frontend;
  area: typeof NavigationArea.Main | typeof NavigationArea.Footer;
} {
  return {
    context: ContentContext.Frontend,
    area: navId === "header" ? NavigationArea.Main : NavigationArea.Footer,
  };
}

function legacyProjection(placements: NavigationPlacement[]): { navId: NavId; position: number } {
  const preferred =
    placements.find(
      (placement) => placement.context === ContentContext.Frontend && placement.area === NavigationArea.Main,
    ) ??
    placements.find(
      (placement) => placement.context === ContentContext.Frontend && placement.area === NavigationArea.Footer,
    ) ??
    placements.find((placement) => placement.area === NavigationArea.Main) ??
    placements[0];

  return {
    navId: preferred?.area === NavigationArea.Footer ? "footer" : "header",
    position: preferred?.position ?? 0,
  };
}

function rowToNavigationConfigurationEntry(
  row: NavigationConfigurationSqlRow,
  placements: NavigationPlacement[],
): NavigationConfigurationEntryRow {
  return {
    id: row.id,
    targetKind: row.target_kind as NavigationTargetKind,
    pageId: row.page_id,
    pageSlug: row.page_slug,
    pageTitle: row.page_title,
    url: row.url,
    systemKey: row.system_key as NavigationSystemKey | null,
    target: row.target as NavTarget,
    label: row.label,
    contextMask: row.context_mask as NavigationConfigurationEntryRow["contextMask"],
    areaMask: row.area_mask as NavigationAreaMask,
    labelUpdatedAt: row.label_updated_at,
    placements,
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
  const placement = legacyPlacement(navId);
  const result = await pool.query(
    `WITH placement_state AS (
       SELECT EXISTS (SELECT 1 FROM navigation_item_placements) AS configured
     )
     SELECT n.id, $3::text AS nav_id, COALESCE(p.slug, n.page_slug) AS page_slug,
            n.url, n.target, COALESCE(np.position, n.position) AS position, n.label, n.label_updated_at,
            p.title AS page_title,
            p.page_type, p.display_mode, p.overlay_width
     FROM nav_items n
     CROSS JOIN placement_state state
     LEFT JOIN navigation_item_placements np
       ON np.nav_item_id = n.id AND np.context = $1 AND np.area = $2
     LEFT JOIN content_pages p ON p.id = n.page_id OR (n.page_id IS NULL AND p.slug = n.page_slug)
     WHERE (state.configured AND np.nav_item_id IS NOT NULL)
        OR (NOT state.configured AND n.nav_id = $3)
     ORDER BY COALESCE(np.position, n.position) ASC, n.id ASC`,
    [placement.context, placement.area, navId],
  );
  return result.rows.map(rowToNavItem);
}

async function readNavigationConfiguration(
  client: Pick<PoolClient, "query">,
): Promise<NavigationConfigurationEntryRow[]> {
  const entryResult = await client.query<NavigationConfigurationSqlRow>(
    `SELECT n.id, n.target_kind, n.page_id, COALESCE(p.slug, n.page_slug) AS page_slug,
              p.title AS page_title, n.url, n.system_key, n.target, n.label,
              n.context_mask, n.area_mask, n.label_updated_at
       FROM nav_items n
       LEFT JOIN content_pages p ON p.id = n.page_id OR (n.page_id IS NULL AND p.slug = n.page_slug)
       ORDER BY n.id`,
  );
  const placementResult = await client.query<NavigationPlacementSqlRow>(
    `SELECT nav_item_id, context, area, position
       FROM navigation_item_placements
       ORDER BY nav_item_id, context, area`,
  );
  const placementsByItem = new Map<number, NavigationPlacement[]>();
  for (const row of placementResult.rows) {
    const placements = placementsByItem.get(row.nav_item_id) ?? [];
    placements.push({
      context: row.context as NavigationPlacement["context"],
      area: row.area as NavigationPlacement["area"],
      position: row.position,
    });
    placementsByItem.set(row.nav_item_id, placements);
  }

  return entryResult.rows.map((row) => rowToNavigationConfigurationEntry(row, placementsByItem.get(row.id) ?? []));
}

/** Lists the complete semantic navigation configuration. */
export async function listNavigationConfiguration(pool: Pool): Promise<NavigationConfigurationEntryRow[]> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY");
    const entries = await readNavigationConfiguration(client);
    await client.query("COMMIT");
    return entries;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

/** Atomically replaces semantic entries and concrete placements. */
export async function replaceNavigationConfiguration(
  pool: Pool,
  entries: NavigationConfigurationReplaceInput[],
): Promise<NavigationConfigurationEntryRow[]> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query(`DELETE FROM nav_items`);

    for (const entry of entries) {
      const projection = legacyProjection(entry.placements);
      const inserted = await client.query<{ id: number }>(
        `INSERT INTO nav_items (
           nav_id, target_kind, page_id, page_slug, url, system_key, target,
           position, label, context_mask, area_mask
         )
         VALUES (
           $1, $2, $3,
           CASE WHEN $2 = 'page' THEN (SELECT slug FROM content_pages WHERE id = $3) ELSE NULL END,
           $4, $5, $6, $7, $8, $9, $10
         )
         RETURNING id, label_updated_at`,
        [
          projection.navId,
          entry.targetKind,
          entry.pageId,
          entry.url,
          entry.systemKey,
          entry.target,
          projection.position,
          entry.label,
          entry.contextMask,
          entry.areaMask,
        ],
      );
      const insertedItem = inserted.rows[0];
      if (!insertedItem) throw new Error("Navigation item insert did not return a row");
      const navItemId = insertedItem.id;

      for (const placement of entry.placements) {
        await client.query(
          `INSERT INTO navigation_item_placements (nav_item_id, context, area, position)
           VALUES ($1, $2, $3, $4)`,
          [navItemId, placement.context, placement.area, placement.position],
        );
      }
    }

    const persisted = await readNavigationConfiguration(client);
    await client.query("COMMIT");
    return persisted;
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

/**
 * Replaces every nav item for one surface in a single transaction:
 * deletes existing rows, inserts the new ones with positions matching
 * their input order, then re-reads the surface via
 * {@link listAdminNavItems} so the response includes the joined page
 * columns.
 *
 * @remarks Defaults `target = "_self"`. `pageSlug`, `url`, and `label`
 *   may be `null`.
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
