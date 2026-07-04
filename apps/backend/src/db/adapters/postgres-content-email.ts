/**
 * Email template domain: CRUD for the `email_templates` table used by
 * outbound transactional mail (invite, password reset, etc.), plus the
 * supporting global branding singleton, binary image assets, and the
 * action-to-template binding table (MC-078).
 *
 * Scope:
 *   - List / get / insert / update / delete email templates (block-based body).
 *   - Read / update the single global branding row (header/footer asset + footer text).
 *   - Insert email image assets and stream their raw bytes back out.
 *   - List / create / enable-disable / delete action↔template bindings.
 *
 * Excludes:
 *   - Mail rendering and dispatch (see `services/email-renderer.ts`, `services/email-actions.ts`).
 *   - The `is_system_template` flag's enforcement (handled at the
 *     service layer; the DB does not block delete on its own).
 */

import { nanoid } from "nanoid";
import type { Pool } from "pg";
import type {
  EmailActionBindingDto,
  EmailAssetDto,
  EmailBrandingDto,
  EmailTemplateBrandingOverrides,
  EmailTemplateRow,
  EmailTemplateWriteData,
} from "../admin-repository.js";

// ============================================================================
// COLUMN LISTS
// ============================================================================

/**
 * The full `email_templates` column list, snake_case, shared by every
 * SELECT and by INSERT/UPDATE `RETURNING` so the six read/write paths never
 * drift on which columns they project (MC-079 added the nine trailing
 * branding-override columns).
 */
const EMAIL_TEMPLATE_COLUMNS = `id, name, subject, blocks, is_system_template, created_at, updated_at,
       header_asset_id, footer_text,
       light_background_asset_id, dark_background_asset_id,
       light_gradient_top, light_gradient_bottom, dark_gradient_top, dark_gradient_bottom`;

/**
 * Maps each {@link EmailTemplateBrandingOverrides} key to its snake_case
 * `email_templates` column. Drives both the branding half of the present-keys
 * INSERT/UPDATE and the row→DTO mapping, so the two can never disagree.
 */
const BRANDING_OVERRIDE_COLUMNS: Record<keyof EmailTemplateBrandingOverrides, string> = {
  headerAssetId: "header_asset_id",
  footerText: "footer_text",
  lightBackgroundAssetId: "light_background_asset_id",
  darkBackgroundAssetId: "dark_background_asset_id",
  lightGradientTop: "light_gradient_top",
  lightGradientBottom: "light_gradient_bottom",
  darkGradientTop: "dark_gradient_top",
  darkGradientBottom: "dark_gradient_bottom",
};

// ============================================================================
// ROW TYPES
// ============================================================================

interface EmailTemplateSqlRow {
  id: number;
  name: string;
  subject: string;
  blocks: unknown;
  is_system_template: boolean;
  created_at: Date;
  updated_at: Date;
  header_asset_id: string | null;
  footer_text: string | null;
  light_background_asset_id: string | null;
  dark_background_asset_id: string | null;
  light_gradient_top: string | null;
  light_gradient_bottom: string | null;
  dark_gradient_top: string | null;
  dark_gradient_bottom: string | null;
}

// ============================================================================
// MAPPERS
// ============================================================================

/**
 * Maps a raw `email_templates` row to the public {@link EmailTemplateRow}
 * DTO (snake_case → camelCase). `blocks` is a JSONB column; the raw `pg`
 * driver already parses it into a JS value on SELECT, so it only needs a type
 * cast here. The nine branding-override columns are collected into `branding`
 * (each `null` = inherit the global default at render time).
 */
function rowToEmailTemplate(row: EmailTemplateSqlRow): EmailTemplateRow {
  return {
    id: row.id,
    name: row.name,
    subject: row.subject,
    blocks: row.blocks as EmailTemplateRow["blocks"],
    isSystemTemplate: row.is_system_template,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    branding: {
      headerAssetId: row.header_asset_id,
      footerText: row.footer_text,
      lightBackgroundAssetId: row.light_background_asset_id,
      darkBackgroundAssetId: row.dark_background_asset_id,
      lightGradientTop: row.light_gradient_top,
      lightGradientBottom: row.light_gradient_bottom,
      darkGradientTop: row.dark_gradient_top,
      darkGradientBottom: row.dark_gradient_bottom,
    },
  };
}

// ============================================================================
// READ
// ============================================================================

/**
 * Lists every email template ordered by `name` ascending.
 *
 * @param pool - Postgres connection pool.
 */
export async function listEmailTemplates(pool: Pool): Promise<EmailTemplateRow[]> {
  const result = await pool.query(
    `SELECT ${EMAIL_TEMPLATE_COLUMNS}
     FROM email_templates
     ORDER BY name ASC`,
  );
  return result.rows.map(rowToEmailTemplate);
}

/**
 * Looks up an email template by primary key.
 *
 * @param pool - Postgres connection pool.
 * @param id - The template's numeric id.
 * @returns The template, or `null` if no row matches.
 */
export async function getEmailTemplateById(pool: Pool, id: number): Promise<EmailTemplateRow | null> {
  const result = await pool.query(
    `SELECT ${EMAIL_TEMPLATE_COLUMNS}
     FROM email_templates
     WHERE id = $1`,
    [id],
  );
  return result.rows.length > 0 ? rowToEmailTemplate(result.rows[0]) : null;
}

/**
 * Looks up an email template by its unique `name`. Used by the mail
 * dispatcher to resolve a template before rendering.
 *
 * @param pool - Postgres connection pool.
 * @param name - The template name (e.g. `"admin_invite"`).
 * @returns The template, or `null` if no row matches.
 */
export async function getEmailTemplateByName(pool: Pool, name: string): Promise<EmailTemplateRow | null> {
  const result = await pool.query(
    `SELECT ${EMAIL_TEMPLATE_COLUMNS}
     FROM email_templates
     WHERE name = $1`,
    [name],
  );
  return result.rows.length > 0 ? rowToEmailTemplate(result.rows[0]) : null;
}

// ============================================================================
// WRITE
// ============================================================================

/**
 * Inserts a new email template. `isSystemTemplate` defaults to `false`.
 *
 * @param pool - Postgres connection pool.
 * @param data - Template payload. `subject` and `blocks` are required.
 * @returns The persisted row, including DB-assigned id and timestamps.
 */
export async function insertEmailTemplate(pool: Pool, data: EmailTemplateWriteData): Promise<EmailTemplateRow> {
  // A new row has no "unchanged" concept, so an absent branding key simply
  // becomes NULL (= inherit the global default), same as an all-null default.
  const brandingKeys = Object.keys(BRANDING_OVERRIDE_COLUMNS) as (keyof EmailTemplateBrandingOverrides)[];
  const columns = [
    "name",
    "subject",
    "blocks",
    "is_system_template",
    ...brandingKeys.map((key) => BRANDING_OVERRIDE_COLUMNS[key]),
  ];
  const values: unknown[] = [
    data.name,
    data.subject,
    JSON.stringify(data.blocks),
    data.isSystemTemplate ?? false,
    ...brandingKeys.map((key) => data.branding?.[key] ?? null),
  ];
  const placeholders = columns.map((_, i) => `$${i + 1}`).join(", ");
  const result = await pool.query(
    `INSERT INTO email_templates (${columns.join(", ")})
     VALUES (${placeholders})
     RETURNING ${EMAIL_TEMPLATE_COLUMNS}`,
    values,
  );
  return rowToEmailTemplate(result.rows[0]);
}

/**
 * Partially updates an email template. Only keys present on `data` are
 * written. `updated_at` is always bumped to `NOW()` when at least one
 * column changed; an empty `data` short-circuits to a re-read. The `blocks`
 * column is JSONB and needs its bound value JSON-stringified before being
 * pushed as a parameter.
 *
 * @param pool - Postgres connection pool.
 * @param id - The template's id.
 * @param data - Subset of mutable columns.
 * @returns The updated row, the current row when `data` was empty, or
 *   `null` when the row no longer exists.
 */
export async function updateEmailTemplate(
  pool: Pool,
  id: number,
  data: Partial<EmailTemplateWriteData>,
): Promise<EmailTemplateRow | null> {
  const columnMap: Record<Exclude<keyof EmailTemplateWriteData, "branding">, string> = {
    name: "name",
    subject: "subject",
    blocks: "blocks",
    isSystemTemplate: "is_system_template",
  };
  const jsonbColumns = new Set<keyof EmailTemplateWriteData>(["blocks"]);

  const setClauses: string[] = [];
  const values: unknown[] = [];
  let paramIndex = 1;

  for (const [key, value] of Object.entries(data)) {
    // Treat an explicit `undefined` the same as an absent key (leave the
    // column unchanged) rather than binding it: JSON.stringify(undefined) is
    // the JS value `undefined`, not a string, which `pg` would otherwise send
    // as a NULL bind param and violate the NOT NULL constraint on the jsonb
    // columns.
    if (value === undefined) continue;
    // `branding` is a nested object, handled by its own present-keys loop below.
    if (key === "branding") continue;
    const column = columnMap[key as Exclude<keyof EmailTemplateWriteData, "branding">];
    if (column) {
      setClauses.push(`${column} = $${paramIndex}`);
      values.push(jsonbColumns.has(key as keyof EmailTemplateWriteData) ? JSON.stringify(value) : value);
      paramIndex++;
    }
  }

  // Branding overrides: same present-keys-only semantics as the top-level
  // fields — an ABSENT key leaves the column untouched, a key present as
  // `null` clears the override (template falls back to the global default),
  // a non-null value sets it.
  if (data.branding) {
    for (const [key, value] of Object.entries(data.branding)) {
      if (value === undefined) continue;
      const column = BRANDING_OVERRIDE_COLUMNS[key as keyof EmailTemplateBrandingOverrides];
      if (column) {
        setClauses.push(`${column} = $${paramIndex}`);
        values.push(value);
        paramIndex++;
      }
    }
  }

  if (setClauses.length === 0) {
    return getEmailTemplateById(pool, id);
  }

  setClauses.push(`updated_at = $${paramIndex}`);
  values.push(new Date());
  paramIndex++;

  values.push(id);
  const result = await pool.query(
    `UPDATE email_templates SET ${setClauses.join(", ")}
     WHERE id = $${paramIndex}
     RETURNING ${EMAIL_TEMPLATE_COLUMNS}`,
    values,
  );

  return result.rows.length > 0 ? rowToEmailTemplate(result.rows[0]) : null;
}

/**
 * Hard-deletes an email template. System templates are not protected at
 * the DB layer; callers must enforce the `isSystemTemplate` rule
 * themselves.
 *
 * @param pool - Postgres connection pool.
 * @param id - The template's id.
 * @returns `true` when a row was removed, `false` otherwise.
 */
export async function deleteEmailTemplate(pool: Pool, id: number): Promise<boolean> {
  const result = await pool.query(`DELETE FROM email_templates WHERE id = $1 RETURNING id`, [id]);
  return (result.rowCount ?? 0) > 0;
}

// ============================================================================
// EMAIL BRANDING (singleton)
// ============================================================================

/**
 * Reads the global email branding singleton. The app always reads/writes
 * the lowest-id row; the backfill migration seeds exactly one.
 *
 * @param pool - Postgres connection pool.
 * @returns The branding row, or an all-null default when the table is empty.
 */
export async function getEmailBranding(pool: Pool): Promise<EmailBrandingDto> {
  const r = await pool.query(
    `SELECT header_asset_id, footer_text,
            light_background_asset_id, dark_background_asset_id,
            light_gradient_top, light_gradient_bottom, dark_gradient_top, dark_gradient_bottom
     FROM email_branding ORDER BY id ASC LIMIT 1`,
  );
  const row = r.rows[0];
  if (!row) {
    // Defensive: the migration seeds exactly one row, so this only fires on a
    // freshly-created empty table. Mirror the schema's NOT NULL gradient
    // defaults (the website night-sky shader colours) so the non-null
    // gradient contract of EmailBrandingDto always holds.
    return {
      headerAssetId: null,
      footerText: null,
      lightBackgroundAssetId: null,
      darkBackgroundAssetId: null,
      lightGradientTop: "#0076d5",
      lightGradientBottom: "#69d1fd",
      darkGradientTop: "#0b1318",
      darkGradientBottom: "#10273b",
    };
  }
  return {
    headerAssetId: row.header_asset_id,
    footerText: row.footer_text,
    lightBackgroundAssetId: row.light_background_asset_id,
    darkBackgroundAssetId: row.dark_background_asset_id,
    lightGradientTop: row.light_gradient_top,
    lightGradientBottom: row.light_gradient_bottom,
    darkGradientTop: row.dark_gradient_top,
    darkGradientBottom: row.dark_gradient_bottom,
  };
}

/**
 * Partially updates the global email branding singleton. A key that is
 * ABSENT from `data` leaves its column untouched; a key that is PRESENT (even
 * with value `null`) sets the column to that value — so `{ headerAssetId:
 * null }` genuinely clears the header image, distinct from not mentioning
 * `headerAssetId` at all. (An earlier version used `COALESCE`, which could
 * not tell "omitted" apart from "explicitly null" and silently ignored any
 * attempt to clear a field — fixed before the Branding page's "remove image"
 * action needed it.)
 *
 * @param pool - Postgres connection pool.
 * @param data - Subset of mutable branding fields; only present keys are written.
 * @returns The branding row after the update.
 */
export async function updateEmailBranding(pool: Pool, data: Partial<EmailBrandingDto>): Promise<EmailBrandingDto> {
  const columnMap: Record<keyof EmailBrandingDto, string> = {
    headerAssetId: "header_asset_id",
    footerText: "footer_text",
    lightBackgroundAssetId: "light_background_asset_id",
    darkBackgroundAssetId: "dark_background_asset_id",
    lightGradientTop: "light_gradient_top",
    lightGradientBottom: "light_gradient_bottom",
    darkGradientTop: "dark_gradient_top",
    darkGradientBottom: "dark_gradient_bottom",
  };

  const setClauses: string[] = [];
  const values: unknown[] = [];
  let paramIndex = 1;

  for (const [key, value] of Object.entries(data)) {
    if (value === undefined) continue;
    const column = columnMap[key as keyof EmailBrandingDto];
    if (column) {
      setClauses.push(`${column} = $${paramIndex}`);
      values.push(value);
      paramIndex++;
    }
  }

  if (setClauses.length === 0) {
    return getEmailBranding(pool);
  }

  setClauses.push("updated_at = NOW()");
  await pool.query(
    `UPDATE email_branding SET ${setClauses.join(", ")}
     WHERE id = (SELECT id FROM email_branding ORDER BY id ASC LIMIT 1)`,
    values,
  );
  return getEmailBranding(pool);
}

// ============================================================================
// EMAIL ASSETS
// ============================================================================

/**
 * Lists every email image asset's metadata (id, MIME type, created-at),
 * newest first. Bytes are intentionally not selected — they are streamed
 * separately by id via {@link getEmailAssetBytes}. Backs the dashboard's
 * shared-asset picker.
 *
 * @param pool - Postgres connection pool.
 * @returns All email asset metadata rows, newest first.
 */
export async function listEmailAssets(pool: Pool): Promise<EmailAssetDto[]> {
  const r = await pool.query(`SELECT id, mime_type, created_at FROM email_assets ORDER BY created_at DESC`);
  return r.rows.map((x) => ({ id: x.id, mimeType: x.mime_type, createdAt: x.created_at }));
}

/**
 * Inserts a new binary email image asset, with a nanoid id.
 *
 * @param pool - Postgres connection pool.
 * @param data - The asset's MIME type and raw bytes.
 * @returns The persisted asset's metadata (bytes are not returned).
 */
export async function insertEmailAsset(pool: Pool, data: { mimeType: string; bytes: Buffer }): Promise<EmailAssetDto> {
  const id = nanoid();
  const r = await pool.query(
    `INSERT INTO email_assets (id, mime_type, bytes, created_at) VALUES ($1, $2, $3, NOW())
     RETURNING id, mime_type, created_at`,
    [id, data.mimeType, data.bytes],
  );
  return { id: r.rows[0].id, mimeType: r.rows[0].mime_type, createdAt: r.rows[0].created_at };
}

/**
 * Reads an email asset's raw bytes + MIME type, for the streaming route.
 *
 * @param pool - Postgres connection pool.
 * @param id - The asset's id.
 * @returns The MIME type and bytes, or `null` when no row matches.
 */
export async function getEmailAssetBytes(pool: Pool, id: string): Promise<{ mimeType: string; bytes: Buffer } | null> {
  const r = await pool.query(`SELECT mime_type, bytes FROM email_assets WHERE id = $1`, [id]);
  if (r.rows.length === 0) return null;
  return { mimeType: r.rows[0].mime_type, bytes: r.rows[0].bytes };
}

// ============================================================================
// EMAIL ACTION BINDINGS
// ============================================================================

/**
 * Lists action↔template bindings, optionally restricted to one action key.
 *
 * @param pool - Postgres connection pool.
 * @param actionKey - When given, restricts results to this action.
 * @returns The matching bindings, oldest first.
 */
export async function listEmailActionBindings(pool: Pool, actionKey?: string): Promise<EmailActionBindingDto[]> {
  const r = actionKey
    ? await pool.query(
        `SELECT id, action_key, template_id, enabled FROM email_action_bindings WHERE action_key = $1 ORDER BY created_at ASC`,
        [actionKey],
      )
    : await pool.query(
        `SELECT id, action_key, template_id, enabled FROM email_action_bindings ORDER BY created_at ASC`,
      );
  return r.rows.map((x) => ({ id: x.id, actionKey: x.action_key, templateId: x.template_id, enabled: x.enabled }));
}

/**
 * Creates a binding of an action key to a template, with a nanoid id. If
 * the pair already exists (unique `action_key, template_id`), re-enables
 * the existing binding instead of erroring.
 *
 * @param pool - Postgres connection pool.
 * @param data - The action key and template id to bind.
 * @returns The persisted (or re-enabled) binding.
 */
export async function createEmailActionBinding(
  pool: Pool,
  data: { actionKey: string; templateId: number },
): Promise<EmailActionBindingDto> {
  const id = nanoid();
  const r = await pool.query(
    `INSERT INTO email_action_bindings (id, action_key, template_id, enabled, created_at)
     VALUES ($1, $2, $3, true, NOW())
     ON CONFLICT (action_key, template_id) DO UPDATE SET enabled = true
     RETURNING id, action_key, template_id, enabled`,
    [id, data.actionKey, data.templateId],
  );
  return {
    id: r.rows[0].id,
    actionKey: r.rows[0].action_key,
    templateId: r.rows[0].template_id,
    enabled: r.rows[0].enabled,
  };
}

/**
 * Enables or disables an existing action binding.
 *
 * @param pool - Postgres connection pool.
 * @param id - The binding's id.
 * @param enabled - The new enabled state.
 * @returns The updated binding, or `null` when no row matches.
 */
export async function setEmailActionBindingEnabled(
  pool: Pool,
  id: string,
  enabled: boolean,
): Promise<EmailActionBindingDto | null> {
  const r = await pool.query(
    `UPDATE email_action_bindings SET enabled = $1 WHERE id = $2 RETURNING id, action_key, template_id, enabled`,
    [enabled, id],
  );
  if (r.rows.length === 0) return null;
  return {
    id: r.rows[0].id,
    actionKey: r.rows[0].action_key,
    templateId: r.rows[0].template_id,
    enabled: r.rows[0].enabled,
  };
}

/**
 * Hard-deletes an action binding.
 *
 * @param pool - Postgres connection pool.
 * @param id - The binding's id.
 * @returns `true` when a row was removed, `false` otherwise.
 */
export async function deleteEmailActionBinding(pool: Pool, id: string): Promise<boolean> {
  const r = await pool.query(`DELETE FROM email_action_bindings WHERE id = $1 RETURNING id`, [id]);
  return (r.rowCount ?? 0) > 0;
}
