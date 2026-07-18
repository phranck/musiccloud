/**
 * Content pages domain: editorial pages plus their per-locale
 * translations, layout segments and segment translations.
 *
 * Scope:
 *   - Page CRUD for the admin editor: summaries / lookup / create /
 *     update meta / update body / delete, plus published-only public
 *     reads.
 *   - Bulk update flow (`bulkUpdatePages`) used by the dashboard's
 *     drag-and-drop reorder / inline edit. Runs page metas, content,
 *     position, segments and translations in one transaction.
 *   - Per-page translation lifecycle: list / get / upsert / delete
 *     plus a content-update-at stamp helper.
 *   - Page segments (sub-page layout entries) and their translations.
 *   - Admin-username batch lookup used to project page audit columns.
 *
 * Excludes:
 *   - Navigation items + their translations (see
 *     `postgres-content-nav.ts`).
 *   - Email templates (see `postgres-content-email.ts`).
 *   - Admin user CRUD (see `postgres-admin-users.ts`).
 */

import type {
  ContentCardStyle,
  ContentContextMask,
  ContentPublication,
  OverlayWidth,
  PageDisplayMode,
  PageTitleAlignment,
  PageType,
  SingleContentContext,
} from "@musiccloud/shared";
import type { Pool, PoolClient } from "pg";
import type {
  BulkUpdatePagesPayload,
  ContentPageCreateData,
  ContentPageMetaUpdate,
  ContentPageRow,
  ContentPageSummaryRow,
  ContentPageTranslationRow,
  ContentPageTranslationUpsert,
  ContentPublicationRow,
  ContentStatus,
  PageSegmentInputRow,
  PageSegmentRow,
  PageSegmentTranslationRow,
} from "../admin-repository.js";

// ============================================================================
// SHARED COLUMN LISTS
// ============================================================================
// Kept in one place so every SELECT / RETURNING stays in lockstep with
// any new column added to `content_pages`.

const CONTENT_SUMMARY_COLUMNS =
  "content_pages.id AS id, content_pages.slug AS slug, content_pages.context_mask AS context_mask, content_pages.title AS title, content_pages.status AS status, content_pages.show_title AS show_title, content_pages.title_alignment AS title_alignment, content_pages.page_type AS page_type, content_pages.display_mode AS display_mode, content_pages.overlay_width AS overlay_width, content_pages.content_card_style AS content_card_style, content_pages.created_by AS created_by, content_pages.updated_by AS updated_by, content_pages.created_at AS created_at, content_pages.updated_at AS updated_at";
const CONTENT_COLUMNS = `${CONTENT_SUMMARY_COLUMNS}, content_pages.content AS content, content_pages.content_updated_at AS content_updated_at`;
const CONTENT_PUBLICATIONS_COLUMN = `COALESCE(
  (SELECT json_agg(
     json_build_object(
       'pageId', cpp.page_id,
       'context', cpp.context,
       'path', cpp.path,
       'status', cpp.status,
       'templateKey', cpp.template_key
     ) ORDER BY cpp.context
   )
   FROM content_page_publications cpp
   WHERE cpp.page_id = content_pages.id),
  '[]'::json
) AS publications`;

// ============================================================================
// ROW TYPES
// ============================================================================

interface ContentPageSummarySqlRow {
  id: string;
  slug: string;
  context_mask: number;
  publications?: ContentPublicationRow[];
  title: string;
  status: string;
  show_title: boolean;
  title_alignment: string;
  page_type: string;
  display_mode: string;
  overlay_width: string;
  content_card_style: string;
  created_by: string | null;
  updated_by: string | null;
  created_at: Date;
  updated_at: Date | null;
  segments?: { position: number; label: string; targetSlug: string }[];
}

interface ContentPageSqlRow extends ContentPageSummarySqlRow {
  content: string;
  content_updated_at: Date;
}

interface ContentPageTranslationSqlRow {
  slug: string;
  locale: string;
  title: string;
  content: string;
  source_updated_at: Date | null;
  updated_at: Date;
  updated_by: string | null;
}

// ============================================================================
// MAPPERS
// ============================================================================

function rowToContentPageSummary(row: ContentPageSummarySqlRow): ContentPageSummaryRow {
  return {
    id: row.id,
    slug: row.slug,
    contextMask: row.context_mask as ContentContextMask,
    publications: row.publications ?? [],
    title: row.title,
    status: row.status as ContentStatus,
    showTitle: row.show_title,
    titleAlignment: row.title_alignment as PageTitleAlignment,
    pageType: row.page_type as PageType,
    displayMode: row.display_mode as PageDisplayMode,
    overlayWidth: row.overlay_width as OverlayWidth,
    contentCardStyle: row.content_card_style as ContentCardStyle,
    createdBy: row.created_by,
    updatedBy: row.updated_by,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    ...(row.segments !== undefined && { segments: row.segments }),
  };
}

function rowToContentPage(row: ContentPageSqlRow): ContentPageRow {
  return { ...rowToContentPageSummary(row), content: row.content, contentUpdatedAt: row.content_updated_at };
}

function rowToContentPageTranslation(row: ContentPageTranslationSqlRow): ContentPageTranslationRow {
  return {
    slug: row.slug,
    locale: row.locale,
    title: row.title,
    content: row.content,
    sourceUpdatedAt: row.source_updated_at,
    updatedAt: row.updated_at,
    updatedBy: row.updated_by,
  };
}

/**
 * Resolves the slug that subsequent UPDATEs in the same transaction
 * should target after a slug rename: the meta UPDATE runs first, so
 * `meta.slug` (when present) is already the new key for the
 * content / translation / segment rows.
 */
function resolveSlugAfterRename(p: { slug: string; meta?: ContentPageMetaUpdate }): string {
  return p.meta?.slug ?? p.slug;
}

// ============================================================================
// CONTENT PAGES — read (admin)
// ============================================================================

/**
 * Lists every page with its inline segment list (one round-trip via
 * `json_agg + FILTER`) for the admin pages listing.
 *
 * @param pool - Postgres connection pool.
 */
export async function listContentPageSummaries(pool: Pool): Promise<ContentPageSummaryRow[]> {
  const result = await pool.query(
    `SELECT ${CONTENT_SUMMARY_COLUMNS},
            ${CONTENT_PUBLICATIONS_COLUMN},
            COALESCE(
              json_agg(
                json_build_object('position', ps.position, 'label', ps.label, 'targetSlug', ps.target_slug)
                ORDER BY ps.position
              ) FILTER (WHERE ps.id IS NOT NULL),
              '[]'::json
            ) AS segments
     FROM content_pages
     LEFT JOIN page_segments ps ON ps.owner_slug = content_pages.slug
     GROUP BY content_pages.slug
     ORDER BY content_pages.position ASC, content_pages.created_at DESC`,
  );
  return result.rows.map(rowToContentPageSummary);
}

/**
 * Loads the full page row for the admin editor (includes `content` and
 * `content_updated_at`).
 *
 * @param pool - Postgres connection pool.
 * @param slug - The page's slug.
 * @returns The page row, or `null` if no match.
 */
export async function getContentPageBySlug(pool: Pool, slug: string): Promise<ContentPageRow | null> {
  const result = await pool.query(
    `SELECT ${CONTENT_COLUMNS}, ${CONTENT_PUBLICATIONS_COLUMN}
     FROM content_pages
     WHERE slug = $1`,
    [slug],
  );
  return result.rows.length > 0 ? rowToContentPage(result.rows[0]) : null;
}

/** Loads a full admin page by its stable identity. */
export async function getContentPageById(pool: Pool, id: string): Promise<ContentPageRow | null> {
  const result = await pool.query(
    `SELECT ${CONTENT_COLUMNS}, ${CONTENT_PUBLICATIONS_COLUMN}
     FROM content_pages
     WHERE id = $1`,
    [id],
  );
  return result.rows.length > 0 ? rowToContentPage(result.rows[0]) : null;
}

/**
 * Cheap existence probe used by the admin create / rename UI to check
 * slug availability before the user commits.
 *
 * @param pool - Postgres connection pool.
 * @param slug - The slug to probe.
 * @returns `true` when a row with that slug exists.
 */
export async function contentPageSlugExists(pool: Pool, slug: string): Promise<boolean> {
  const result = await pool.query(`SELECT 1 FROM content_pages WHERE slug = $1 LIMIT 1`, [slug]);
  return result.rowCount !== null && result.rowCount > 0;
}

/**
 * Resolves admin usernames for a batch of admin ids. Used to project
 * `created_by` / `updated_by` audit columns into user-facing strings.
 *
 * @param pool - Postgres connection pool.
 * @param ids - Admin user ids. Duplicates are de-duplicated before the
 *   query.
 * @returns A map id → username. Missing ids are omitted.
 */
export async function getAdminUsernamesByIds(pool: Pool, ids: string[]): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  if (ids.length === 0) return map;
  const unique = Array.from(new Set(ids));
  const result = await pool.query<{ id: string; username: string }>(
    `SELECT id, username FROM admin_users WHERE id = ANY($1)`,
    [unique],
  );
  for (const row of result.rows) map.set(row.id, row.username);
  return map;
}

// ============================================================================
// CONTENT PAGES — read (public)
// ============================================================================

/**
 * Lists slug + title of every published page, ordered by title. Used by
 * the public site to render nav-independent page lists.
 *
 * @param pool - Postgres connection pool.
 */
export async function listPublishedContentPages(pool: Pool): Promise<Array<{ slug: string; title: string }>> {
  const result = await pool.query<{ slug: string; title: string }>(
    `SELECT content_pages.slug, content_pages.title
       FROM content_pages
      WHERE EXISTS (
              SELECT 1 FROM content_page_publications publication
               WHERE publication.page_id = content_pages.id
                 AND publication.context = 1
                 AND publication.status = 'published'
            )
         OR (
              content_pages.status = 'published'
              AND NOT EXISTS (
                SELECT 1 FROM content_page_publications publication
                 WHERE publication.page_id = content_pages.id
              )
            )
      ORDER BY content_pages.title ASC`,
  );
  return result.rows;
}

/**
 * Loads one published page for the public route. Returns `null` for
 * drafts so the public renderer sees the page as missing.
 *
 * @param pool - Postgres connection pool.
 * @param slug - The page's slug.
 */
export async function getPublishedContentPageBySlug(pool: Pool, slug: string): Promise<ContentPageRow | null> {
  const result = await pool.query(
    `SELECT ${CONTENT_COLUMNS}, ${CONTENT_PUBLICATIONS_COLUMN}
     FROM content_pages
     WHERE slug = $1
       AND status = 'published'
       AND NOT EXISTS (
         SELECT 1 FROM content_page_publications publication
          WHERE publication.page_id = content_pages.id
       )`,
    [slug],
  );
  return result.rows.length > 0 ? rowToContentPage(result.rows[0]) : null;
}

/**
 * Batch-loads pages by slug (admin scope: returns drafts and published
 * alike).
 *
 * @param pool - Postgres connection pool.
 * @param slugs - Slugs to load. Empty input short-circuits.
 */
export async function getContentPagesBySlugs(pool: Pool, slugs: string[]): Promise<ContentPageRow[]> {
  if (slugs.length === 0) return [];
  const result = await pool.query(
    `SELECT ${CONTENT_COLUMNS}, ${CONTENT_PUBLICATIONS_COLUMN}
     FROM content_pages
     WHERE slug = ANY($1)`,
    [slugs],
  );
  return result.rows.map(rowToContentPage);
}

/**
 * Batch-loads pages by slug, restricted to `status = 'published'`. Used
 * by SSR for segmented pages that fan out to multiple child pages.
 *
 * @param pool - Postgres connection pool.
 * @param slugs - Slugs to load. Empty input short-circuits.
 */
export async function getPublishedContentPagesBySlugs(pool: Pool, slugs: string[]): Promise<ContentPageRow[]> {
  if (slugs.length === 0) return [];
  const result = await pool.query(
    `SELECT ${CONTENT_COLUMNS}, ${CONTENT_PUBLICATIONS_COLUMN}
     FROM content_pages
     WHERE slug = ANY($1)
       AND (
         EXISTS (
           SELECT 1 FROM content_page_publications publication
            WHERE publication.page_id = content_pages.id
              AND publication.context = 1
              AND publication.status = 'published'
         )
         OR (
           status = 'published'
           AND NOT EXISTS (
             SELECT 1 FROM content_page_publications publication
              WHERE publication.page_id = content_pages.id
           )
         )
       )`,
    [slugs],
  );
  return result.rows.map(rowToContentPage);
}

// ============================================================================
// CONTENT PUBLICATIONS
// ============================================================================

interface ContentPublicationSqlRow {
  page_id: string;
  context: number;
  path: string;
  status: string;
  template_key: string;
}

function rowToContentPublication(row: ContentPublicationSqlRow): ContentPublicationRow {
  return {
    pageId: row.page_id,
    context: row.context as SingleContentContext,
    path: row.path,
    status: row.status as ContentStatus,
    templateKey: row.template_key,
  };
}

async function replaceContentPublicationsWithTarget(
  target: Pool | PoolClient,
  pageId: string,
  publications: ContentPublication[],
): Promise<ContentPublicationRow[]> {
  const contextMask = publications.reduce((mask, publication) => mask | publication.context, 0);
  await target.query(`UPDATE content_pages SET context_mask = $2 WHERE id = $1`, [pageId, contextMask]);
  await target.query(`DELETE FROM content_page_publications WHERE page_id = $1`, [pageId]);
  const rows: ContentPublicationRow[] = [];
  for (const publication of publications) {
    const result = await target.query<ContentPublicationSqlRow>(
      `INSERT INTO content_page_publications (page_id, context, path, status, template_key)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING page_id, context, path, status, template_key`,
      [pageId, publication.context, publication.path, publication.status, publication.templateKey],
    );
    rows.push(rowToContentPublication(result.rows[0]));
  }
  return rows.sort((a, b) => a.context - b.context);
}

/** Lists every context publication for a stable page identity. */
export async function listContentPublications(pool: Pool, pageId: string): Promise<ContentPublicationRow[]> {
  const result = await pool.query<ContentPublicationSqlRow>(
    `SELECT page_id, context, path, status, template_key
       FROM content_page_publications
      WHERE page_id = $1
      ORDER BY context ASC`,
    [pageId],
  );
  return result.rows.map(rowToContentPublication);
}

/** Resolves one published page by context and canonical path. */
export async function getPublishedContentPageByPath(
  pool: Pool,
  context: SingleContentContext,
  path: string,
): Promise<ContentPageRow | null> {
  const result = await pool.query(
    `SELECT ${CONTENT_COLUMNS}, ${CONTENT_PUBLICATIONS_COLUMN}
       FROM content_pages
       JOIN content_page_publications publication ON publication.page_id = content_pages.id
      WHERE publication.context = $1
        AND publication.path = $2
        AND publication.status = 'published'`,
    [context, path],
  );
  return result.rows.length > 0 ? rowToContentPage(result.rows[0]) : null;
}

/**
 * Replaces all publication rows and their owning page's context mask in one
 * transaction. Supplying a client composes the replacement into a caller's
 * existing transaction.
 */
export async function replaceContentPublications(
  pool: Pool,
  pageId: string,
  publications: ContentPublication[],
  client?: PoolClient,
): Promise<ContentPublicationRow[]> {
  if (publications.length === 0) {
    throw new Error("At least one content publication is required");
  }

  if (client) return replaceContentPublicationsWithTarget(client, pageId, publications);

  const transactionClient = await pool.connect();
  try {
    await transactionClient.query("BEGIN");
    const rows = await replaceContentPublicationsWithTarget(transactionClient, pageId, publications);
    await transactionClient.query("COMMIT");
    return rows;
  } catch (error) {
    await transactionClient.query("ROLLBACK");
    throw error;
  } finally {
    transactionClient.release();
  }
}

// ============================================================================
// CONTENT PAGES — write
// ============================================================================

/**
 * Creates a new page. `status` defaults to `"draft"`, `pageType` to
 * `"default"`.
 *
 * @param pool - Postgres connection pool.
 * @param data - Page payload.
 * @returns The persisted row.
 */
export async function createContentPage(pool: Pool, data: ContentPageCreateData): Promise<ContentPageRow> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const result = await client.query(
      `INSERT INTO content_pages (slug, title, context_mask, status, page_type, created_by)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING ${CONTENT_COLUMNS}`,
      [
        data.slug,
        data.title,
        data.contextMask ?? 1,
        data.status ?? "draft",
        data.pageType ?? "default",
        data.createdBy,
      ],
    );
    const row = rowToContentPage(result.rows[0]);
    if (data.publications) {
      row.publications = await replaceContentPublicationsWithTarget(client, row.id!, data.publications);
      row.contextMask = data.contextMask ?? 1;
    }
    await client.query("COMMIT");
    return row;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

/**
 * Partial meta update. Only keys present on `data` are written. When
 * nothing changed, falls back to a re-read so the caller always gets
 * the current row.
 *
 * @param pool - Postgres connection pool.
 * @param slug - The page's current slug.
 * @param data - Subset of mutable meta fields. May include a new
 *   `slug` to rename the row.
 * @returns The updated (or current) row, or `null` if the page was
 *   missing.
 */
export async function updateContentPageMeta(
  pool: Pool,
  slug: string,
  data: ContentPageMetaUpdate,
): Promise<ContentPageRow | null> {
  if (data.publications) {
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const row = await updateContentPageMeta(client as unknown as Pool, slug, {
        ...data,
        publications: undefined,
      });
      if (!row) {
        await client.query("ROLLBACK");
        return null;
      }
      row.publications = await replaceContentPublicationsWithTarget(client, row.id!, data.publications);
      row.contextMask = data.contextMask ?? row.contextMask;
      await client.query("COMMIT");
      return row;
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  const setClauses: string[] = [];
  const values: unknown[] = [];
  let paramIndex = 1;

  if (data.title !== undefined) {
    setClauses.push(`title = $${paramIndex++}`);
    values.push(data.title);
  }
  if (data.slug !== undefined) {
    setClauses.push(`slug = $${paramIndex++}`);
    values.push(data.slug);
  }
  if (data.status !== undefined) {
    setClauses.push(`status = $${paramIndex++}`);
    values.push(data.status);
  }
  if (data.contextMask !== undefined) {
    setClauses.push(`context_mask = $${paramIndex++}`);
    values.push(data.contextMask);
  }
  if (data.showTitle !== undefined) {
    setClauses.push(`show_title = $${paramIndex++}`);
    values.push(data.showTitle);
  }
  if (data.titleAlignment !== undefined) {
    setClauses.push(`title_alignment = $${paramIndex++}`);
    values.push(data.titleAlignment);
  }
  if (data.pageType !== undefined) {
    setClauses.push(`page_type = $${paramIndex++}`);
    values.push(data.pageType);
  }
  if (data.displayMode !== undefined) {
    setClauses.push(`display_mode = $${paramIndex++}`);
    values.push(data.displayMode);
  }
  if (data.overlayWidth !== undefined) {
    setClauses.push(`overlay_width = $${paramIndex++}`);
    values.push(data.overlayWidth);
  }
  if (data.contentCardStyle !== undefined) {
    setClauses.push(`content_card_style = $${paramIndex++}`);
    values.push(data.contentCardStyle);
  }

  if (setClauses.length === 0) {
    return getContentPageBySlug(pool, slug);
  }

  setClauses.push(`updated_at = $${paramIndex++}`);
  values.push(new Date());
  setClauses.push(`updated_by = $${paramIndex++}`);
  values.push(data.updatedBy);

  values.push(slug);
  const result = await pool.query(
    `UPDATE content_pages SET ${setClauses.join(", ")}
     WHERE slug = $${paramIndex}
     RETURNING ${CONTENT_COLUMNS}`,
    values,
  );
  return result.rows.length > 0 ? rowToContentPage(result.rows[0]) : null;
}

/**
 * Updates the page body content + bumps `updated_at` and `updated_by`.
 *
 * @param pool - Postgres connection pool.
 * @param slug - The page's slug.
 * @param content - The new content payload (raw editor JSON).
 * @param updatedBy - The acting admin id, or `null` for system writes.
 */
export async function updateContentPageBody(
  pool: Pool,
  slug: string,
  content: string,
  updatedBy: string | null,
): Promise<ContentPageRow | null> {
  const result = await pool.query(
    `UPDATE content_pages
     SET content = $1, updated_at = $2, updated_by = $3
     WHERE slug = $4
     RETURNING ${CONTENT_COLUMNS}`,
    [content, new Date(), updatedBy, slug],
  );
  return result.rows.length > 0 ? rowToContentPage(result.rows[0]) : null;
}

/**
 * Hard-deletes a page row. Cascades to dependents are handled at the
 * schema level.
 *
 * @param pool - Postgres connection pool.
 * @param slug - The page's slug.
 * @returns `true` when a row was removed.
 */
export async function deleteContentPage(pool: Pool, slug: string): Promise<boolean> {
  const result = await pool.query(`DELETE FROM content_pages WHERE slug = $1 RETURNING slug`, [slug]);
  return (result.rowCount ?? 0) > 0;
}

// ============================================================================
// BULK UPDATE
// ============================================================================

/**
 * Applies the dashboard's "save all changes" payload in one
 * transaction: page meta + body, top-level reorder, segment
 * replacement per owner (preserving translations for unchanged
 * targets), and page-translation upserts.
 *
 * @remarks Returns an empty array intentionally. The service layer
 *   re-fetches via {@link listContentPageSummaries} immediately after,
 *   so a second SELECT inside this function would be redundant. The
 *   `ContentPageSummaryRow[]` return type honours the interface
 *   signature only.
 *
 * @param pool - Postgres connection pool.
 * @param payload - The full save payload.
 */
export async function bulkUpdatePages(pool: Pool, payload: BulkUpdatePagesPayload): Promise<ContentPageSummaryRow[]> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    // 1) pages.meta + pages.content
    for (const p of payload.pages) {
      if (p.meta) {
        await applyMetaInTx(client, p.slug, p.meta);
      }
      if (p.content !== undefined) {
        await client.query(
          `UPDATE content_pages
              SET content = $2,
                  content_updated_at = NOW(),
                  updated_at = NOW()
            WHERE slug = $1`,
          [resolveSlugAfterRename(p), p.content],
        );
      }
    }

    // 2) topLevelOrder → position
    for (let i = 0; i < payload.topLevelOrder.length; i++) {
      await client.query(`UPDATE content_pages SET position = $2 WHERE slug = $1`, [payload.topLevelOrder[i], i]);
    }

    // 3) segments per owner — DELETE + INSERT (+ translations UPSERT)
    for (const entry of payload.segments) {
      const preservedTranslationRows = await client.query<{
        target_slug: string;
        locale: string;
        label: string;
        source_updated_at: Date | null;
      }>(
        `SELECT ps.target_slug, pst.locale, pst.label, pst.source_updated_at
           FROM page_segments ps
           JOIN page_segment_translations pst ON pst.segment_id = ps.id
          WHERE ps.owner_slug = $1`,
        [entry.ownerSlug],
      );
      const preservedTranslations = new Map<
        string,
        { locale: string; label: string; sourceUpdatedAt: Date | null }[]
      >();
      for (const row of preservedTranslationRows.rows) {
        const entries = preservedTranslations.get(row.target_slug) ?? [];
        entries.push({ locale: row.locale, label: row.label, sourceUpdatedAt: row.source_updated_at });
        preservedTranslations.set(row.target_slug, entries);
      }

      await client.query(`DELETE FROM page_segments WHERE owner_slug = $1`, [entry.ownerSlug]);
      const idRows: { rows: { id: number; label_updated_at: Date }[] } = { rows: [] };
      for (const s of entry.segments) {
        const inserted = await client.query<{ id: number; label_updated_at: Date }>(
          `INSERT INTO page_segments (owner_slug, target_slug, position, label, label_updated_at)
           VALUES ($1, $2, $3, $4, NOW())
           RETURNING id, label_updated_at`,
          [entry.ownerSlug, s.targetSlug, s.position, s.label],
        );
        idRows.rows.push(inserted.rows[0]);
      }
      for (let i = 0; i < entry.segments.length; i++) {
        const persisted = idRows.rows[i];
        const input = entry.segments[i];
        const translations =
          input.translations === undefined
            ? (preservedTranslations.get(input.targetSlug) ?? [])
            : Object.entries(input.translations)
                .filter(([, label]) => typeof label === "string" && label.length > 0)
                .map(([locale, label]) => ({
                  locale,
                  label,
                  sourceUpdatedAt: persisted.label_updated_at,
                }));
        for (const { locale, label, sourceUpdatedAt } of translations) {
          if (typeof label !== "string" || label.length === 0) continue;
          await client.query(
            `INSERT INTO page_segment_translations (segment_id, locale, label, source_updated_at)
             VALUES ($1, $2, $3, $4)
             ON CONFLICT (segment_id, locale)
             DO UPDATE SET label = EXCLUDED.label, source_updated_at = EXCLUDED.source_updated_at`,
            [persisted.id, locale, label, sourceUpdatedAt],
          );
        }
      }
    }

    // 4) page translations (UPSERT) — stamp updated_by + source_updated_at to
    // match the per-resource upsertPageTranslation audit semantics.
    for (const t of payload.pageTranslations) {
      await client.query(
        `INSERT INTO content_page_translations
           (slug, locale, title, content, updated_at, updated_by, source_updated_at)
         VALUES ($1, $2, $3, $4, NOW(), $5, NOW())
         ON CONFLICT (slug, locale)
         DO UPDATE SET title = EXCLUDED.title,
                       content = EXCLUDED.content,
                       updated_at = EXCLUDED.updated_at,
                       updated_by = EXCLUDED.updated_by,
                       source_updated_at = EXCLUDED.source_updated_at`,
        [t.slug, t.locale, t.title ?? null, t.content ?? null, t.updatedBy ?? null],
      );
    }

    await client.query("COMMIT");
  } catch (e) {
    await client.query("ROLLBACK");
    throw e;
  } finally {
    client.release();
  }

  return [];
}

/**
 * Applies the meta-only subset of a bulk page update inside an already
 * open transaction. Mirrors {@link updateContentPageMeta} for use from
 * {@link bulkUpdatePages}; also clears orphan segments when the page
 * type transitions to `"default"`.
 */
async function applyMetaInTx(client: PoolClient, slug: string, meta: ContentPageMetaUpdate): Promise<void> {
  const setClauses: string[] = [];
  const values: unknown[] = [];
  let p = 1;
  if (meta.title !== undefined) {
    setClauses.push(`title = $${p++}`);
    values.push(meta.title);
  }
  if (meta.slug !== undefined && meta.slug !== slug) {
    setClauses.push(`slug = $${p++}`);
    values.push(meta.slug);
  }
  if (meta.status !== undefined) {
    setClauses.push(`status = $${p++}`);
    values.push(meta.status);
  }
  if (meta.contextMask !== undefined) {
    setClauses.push(`context_mask = $${p++}`);
    values.push(meta.contextMask);
  }
  if (meta.showTitle !== undefined) {
    setClauses.push(`show_title = $${p++}`);
    values.push(meta.showTitle);
  }
  if (meta.titleAlignment !== undefined) {
    setClauses.push(`title_alignment = $${p++}`);
    values.push(meta.titleAlignment);
  }
  if (meta.pageType !== undefined) {
    setClauses.push(`page_type = $${p++}`);
    values.push(meta.pageType);
  }
  if (meta.displayMode !== undefined) {
    setClauses.push(`display_mode = $${p++}`);
    values.push(meta.displayMode);
  }
  if (meta.overlayWidth !== undefined) {
    setClauses.push(`overlay_width = $${p++}`);
    values.push(meta.overlayWidth);
  }
  if (meta.contentCardStyle !== undefined) {
    setClauses.push(`content_card_style = $${p++}`);
    values.push(meta.contentCardStyle);
  }
  if (meta.updatedBy !== undefined) {
    setClauses.push(`updated_by = $${p++}`);
    values.push(meta.updatedBy);
  }
  if (setClauses.length === 0 && !meta.publications) return;
  if (setClauses.length > 0) {
    setClauses.push(`updated_at = NOW()`);
    values.push(slug);
    await client.query(`UPDATE content_pages SET ${setClauses.join(", ")} WHERE slug = $${p}`, values);
  }
  if (meta.publications) {
    const page = await client.query<{ id: string }>(`SELECT id FROM content_pages WHERE slug = $1`, [
      meta.slug ?? slug,
    ]);
    if (page.rows[0]) {
      await replaceContentPublicationsWithTarget(client, page.rows[0].id, meta.publications);
    }
  }
  if (meta.pageType === "default") {
    await client.query(`DELETE FROM page_segments WHERE owner_slug = $1`, [meta.slug ?? slug]);
  }
}

// ============================================================================
// PAGE TRANSLATIONS
// ============================================================================

/**
 * Lists every translation row for one page, ordered by locale.
 */
export async function listPageTranslations(pool: Pool, slug: string): Promise<ContentPageTranslationRow[]> {
  const result = await pool.query<ContentPageTranslationSqlRow>(
    `SELECT slug, locale, title, content, source_updated_at, updated_at, updated_by
     FROM content_page_translations
     WHERE slug = $1
     ORDER BY locale ASC`,
    [slug],
  );
  return result.rows.map(rowToContentPageTranslation);
}

/**
 * Loads one translation row by (slug, locale).
 *
 * @returns The translation, or `null` if no row matches.
 */
export async function getPageTranslation(
  pool: Pool,
  slug: string,
  locale: string,
): Promise<ContentPageTranslationRow | null> {
  const result = await pool.query<ContentPageTranslationSqlRow>(
    `SELECT slug, locale, title, content, source_updated_at, updated_at, updated_by
     FROM content_page_translations
     WHERE slug = $1 AND locale = $2
     LIMIT 1`,
    [slug, locale],
  );
  return result.rows.length > 0 ? rowToContentPageTranslation(result.rows[0]) : null;
}

/**
 * Inserts or updates a translation row (ON CONFLICT on the (slug,
 * locale) primary key). Stamps `updated_at = NOW()` server-side via
 * the JS `Date`.
 *
 * @param pool - Postgres connection pool.
 * @param input - The translation payload including audit fields.
 * @returns The persisted row.
 */
export async function upsertPageTranslation(
  pool: Pool,
  input: ContentPageTranslationUpsert,
): Promise<ContentPageTranslationRow> {
  const now = new Date();
  const result = await pool.query<ContentPageTranslationSqlRow>(
    `INSERT INTO content_page_translations
       (slug, locale, title, content, source_updated_at, updated_at, updated_by)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     ON CONFLICT ON CONSTRAINT pk_content_page_translations
     DO UPDATE SET
       title = EXCLUDED.title,
       content = EXCLUDED.content,
       source_updated_at = EXCLUDED.source_updated_at,
       updated_at = EXCLUDED.updated_at,
       updated_by = EXCLUDED.updated_by
     RETURNING slug, locale, title, content, source_updated_at, updated_at, updated_by`,
    [input.slug, input.locale, input.title, input.content, input.sourceUpdatedAt, now, input.updatedBy],
  );
  return rowToContentPageTranslation(result.rows[0]);
}

/**
 * Deletes one translation row.
 *
 * @returns `true` when a row was removed.
 */
export async function deletePageTranslation(pool: Pool, slug: string, locale: string): Promise<boolean> {
  const result = await pool.query(
    `DELETE FROM content_page_translations WHERE slug = $1 AND locale = $2 RETURNING slug`,
    [slug, locale],
  );
  return (result.rowCount ?? 0) > 0;
}

/**
 * Bumps `content_updated_at` (and `updated_at`) on a page to mark the
 * source content as having changed. Used after segment / translation
 * mutations that don't otherwise touch the page row.
 */
export async function setContentPageContentUpdatedAt(pool: Pool, slug: string, when: Date): Promise<void> {
  await pool.query(`UPDATE content_pages SET content_updated_at = $1, updated_at = $1 WHERE slug = $2`, [when, slug]);
}

// ============================================================================
// PAGE SEGMENTS
// ============================================================================

/**
 * Lists every segment row for one owner page, ordered by `position`.
 */
export async function listSegmentsForOwner(pool: Pool, ownerSlug: string): Promise<PageSegmentRow[]> {
  const result = await pool.query<{
    id: number;
    owner_slug: string;
    target_slug: string;
    position: number;
    label: string;
    label_updated_at: Date;
  }>(
    `SELECT id, owner_slug, target_slug, position, label, label_updated_at
     FROM page_segments
     WHERE owner_slug = $1
     ORDER BY position ASC`,
    [ownerSlug],
  );
  return result.rows.map((r) => ({
    id: r.id,
    ownerSlug: r.owner_slug,
    targetSlug: r.target_slug,
    position: r.position,
    label: r.label,
    labelUpdatedAt: r.label_updated_at,
  }));
}

/**
 * Deletes every segment row for one owner page.
 */
export async function deleteSegmentsForOwner(pool: Pool, ownerSlug: string): Promise<void> {
  await pool.query(`DELETE FROM page_segments WHERE owner_slug = $1`, [ownerSlug]);
}

/**
 * Atomically replaces every segment row for one owner page (delete-all
 * + insert in tx). Returns the freshly persisted rows sorted by
 * `position`.
 */
export async function replaceSegmentsForOwner(
  pool: Pool,
  ownerSlug: string,
  segments: PageSegmentInputRow[],
): Promise<PageSegmentRow[]> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query(`DELETE FROM page_segments WHERE owner_slug = $1`, [ownerSlug]);
    const rows: PageSegmentRow[] = [];
    for (const s of segments) {
      const r = await client.query<{ id: number; label_updated_at: Date }>(
        `INSERT INTO page_segments (owner_slug, target_slug, position, label)
         VALUES ($1, $2, $3, $4)
         RETURNING id, label_updated_at`,
        [ownerSlug, s.targetSlug, s.position, s.label],
      );
      rows.push({
        id: r.rows[0].id,
        ownerSlug,
        targetSlug: s.targetSlug,
        position: s.position,
        label: s.label,
        labelUpdatedAt: r.rows[0].label_updated_at,
      });
    }
    await client.query("COMMIT");
    return rows.sort((a, b) => a.position - b.position);
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

// ============================================================================
// SEGMENT TRANSLATIONS
// ============================================================================

/**
 * Lists every segment translation for one owner page (joined via
 * `page_segments.owner_slug`).
 */
export async function listSegmentTranslationsForOwner(
  pool: Pool,
  ownerSlug: string,
): Promise<PageSegmentTranslationRow[]> {
  const result = await pool.query<{
    segment_id: number;
    locale: string;
    label: string;
    source_updated_at: Date | null;
    updated_at: Date;
  }>(
    `SELECT pst.segment_id, pst.locale, pst.label, pst.source_updated_at, pst.updated_at
     FROM page_segment_translations pst
     JOIN page_segments ps ON ps.id = pst.segment_id
     WHERE ps.owner_slug = $1
     ORDER BY pst.segment_id, pst.locale`,
    [ownerSlug],
  );
  return result.rows.map((r) => ({
    segmentId: r.segment_id,
    locale: r.locale,
    label: r.label,
    sourceUpdatedAt: r.source_updated_at,
    updatedAt: r.updated_at,
  }));
}

/**
 * Atomically replaces every translation row for one segment
 * (delete-all + insert in tx).
 */
export async function replaceSegmentTranslations(
  pool: Pool,
  segmentId: number,
  translations: { locale: string; label: string; sourceUpdatedAt: Date | null }[],
): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query(`DELETE FROM page_segment_translations WHERE segment_id = $1`, [segmentId]);
    for (const t of translations) {
      await client.query(
        `INSERT INTO page_segment_translations (segment_id, locale, label, source_updated_at)
         VALUES ($1, $2, $3, $4)`,
        [segmentId, t.locale, t.label, t.sourceUpdatedAt],
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
