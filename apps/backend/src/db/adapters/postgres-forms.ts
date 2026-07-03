/**
 * Form-builder domain (MC-082, ported from lmaa.space): CRUD for the
 * `form_configs` table (admin-built forms; the whole field grid + submission
 * chain lives in the `config` jsonb) and inserts into `form_submissions` (the
 * pipeline's `store` step, with nullable GDPR anchor columns).
 *
 * Scope:
 *   - List / get-by-name / active-get-by-slug / create / save-payload /
 *     toggle-active / delete form configs.
 *   - Insert submissions (reads/erase tooling follows in the GDPR phase).
 *
 * Excludes:
 *   - Field validation and the submission pipeline itself (see
 *     `services/form-validation.ts`, `services/form-submission.ts`).
 *
 * The `slug` COLUMN is the single source of truth for a form's public path;
 * the `config` jsonb holds only `rows` + `submissionConfig`. Unique-name/slug
 * violations surface as discriminated {@link FormConfigWriteResult}s (they are
 * expected admin input, not exceptions).
 */

import type { FormConfig, FormConfigPayload, SubmissionConfig } from "@musiccloud/shared";
import type { Pool } from "pg";
import type { FormConfigCreateData, FormConfigWriteResult, FormSubmissionInsertData } from "../admin-repository.js";

// ============================================================================
// ROW TYPES + MAPPERS
// ============================================================================

/** Column list shared by every SELECT and RETURNING so read paths never drift. */
const FORM_CONFIG_COLUMNS = "id, name, slug, config, is_active";

interface FormConfigSqlRow {
  id: number;
  name: string;
  slug: string | null;
  config: unknown;
  is_active: boolean;
}

/** The shape stored in the `config` jsonb column (slug lives in its own column). */
interface StoredFormConfig {
  rows?: FormConfig["rows"];
  submissionConfig?: SubmissionConfig;
}

/** Maps a raw `form_configs` row to the shared {@link FormConfig} DTO. */
function rowToFormConfig(row: FormConfigSqlRow): FormConfig {
  const config = (row.config ?? {}) as StoredFormConfig;
  return {
    id: row.id,
    name: row.name,
    slug: row.slug,
    rows: config.rows ?? [],
    isActive: row.is_active,
    submissionConfig: config.submissionConfig,
  };
}

/**
 * Extracts the violated unique constraint's name from a Postgres 23505 error,
 * or `null` for any other error.
 */
function uniqueViolationConstraint(error: unknown): string | null {
  if (error && typeof error === "object" && (error as { code?: string }).code === "23505") {
    return (error as { constraint?: string }).constraint ?? "";
  }
  return null;
}

/** Maps a unique-violation constraint name to the write-result reason, rethrowing anything else. */
function toWriteConflict(error: unknown): FormConfigWriteResult {
  const constraint = uniqueViolationConstraint(error);
  if (constraint === "form_configs_name_unique") return { ok: false, reason: "name_taken" };
  if (constraint === "form_configs_slug_unique") return { ok: false, reason: "slug_taken" };
  throw error;
}

// ============================================================================
// READ
// ============================================================================

/**
 * Lists every form config, newest first.
 *
 * @param pool - Postgres connection pool.
 */
export async function listFormConfigs(pool: Pool): Promise<FormConfig[]> {
  const r = await pool.query(`SELECT ${FORM_CONFIG_COLUMNS} FROM form_configs ORDER BY created_at DESC`);
  return r.rows.map(rowToFormConfig);
}

/**
 * Looks up a form config by its unique admin-facing name.
 *
 * @param pool - Postgres connection pool.
 * @param name - The form's name.
 * @returns The form, or `null` if no row matches.
 */
export async function getFormConfigByName(pool: Pool, name: string): Promise<FormConfig | null> {
  const r = await pool.query(`SELECT ${FORM_CONFIG_COLUMNS} FROM form_configs WHERE name = $1`, [name]);
  return r.rows.length > 0 ? rowToFormConfig(r.rows[0]) : null;
}

/**
 * Looks up an ACTIVE form config by its public slug — the public submit
 * route's lookup. Inactive forms are treated as nonexistent.
 *
 * @param pool - Postgres connection pool.
 * @param slug - The form's public slug.
 * @returns The active form, or `null`.
 */
export async function getActiveFormConfigBySlug(pool: Pool, slug: string): Promise<FormConfig | null> {
  const r = await pool.query(`SELECT ${FORM_CONFIG_COLUMNS} FROM form_configs WHERE slug = $1 AND is_active = true`, [
    slug,
  ]);
  return r.rows.length > 0 ? rowToFormConfig(r.rows[0]) : null;
}

// ============================================================================
// WRITE
// ============================================================================

/**
 * Creates a new, empty form (no rows, no submission chain), active by default.
 *
 * @param pool - Postgres connection pool.
 * @param data - Unique name + slug.
 * @returns `ok` with the created row, or `name_taken` / `slug_taken`.
 */
export async function createFormConfig(pool: Pool, data: FormConfigCreateData): Promise<FormConfigWriteResult> {
  try {
    const r = await pool.query(
      `INSERT INTO form_configs (name, slug, config)
       VALUES ($1, $2, $3)
       RETURNING ${FORM_CONFIG_COLUMNS}`,
      [data.name, data.slug, JSON.stringify({ rows: [] })],
    );
    return { ok: true, data: rowToFormConfig(r.rows[0]) };
  } catch (error) {
    return toWriteConflict(error);
  }
}

/**
 * Replaces an existing form's payload — the editor's save. `rows` and
 * `submissionConfig` land in the `config` jsonb; a present `slug` updates the
 * slug column (absent leaves it unchanged). `updated_at` is always bumped.
 *
 * @param pool - Postgres connection pool.
 * @param name - The form's unique name.
 * @param payload - The full new payload.
 * @returns `ok` with the updated row, `not_found`, or `slug_taken`.
 */
export async function saveFormConfigPayload(
  pool: Pool,
  name: string,
  payload: FormConfigPayload,
): Promise<FormConfigWriteResult> {
  const stored: StoredFormConfig = { rows: payload.rows, submissionConfig: payload.submissionConfig };
  try {
    const r =
      payload.slug === undefined
        ? await pool.query(
            `UPDATE form_configs SET config = $1, updated_at = NOW() WHERE name = $2 RETURNING ${FORM_CONFIG_COLUMNS}`,
            [JSON.stringify(stored), name],
          )
        : await pool.query(
            `UPDATE form_configs SET config = $1, slug = $2, updated_at = NOW() WHERE name = $3 RETURNING ${FORM_CONFIG_COLUMNS}`,
            [JSON.stringify(stored), payload.slug, name],
          );
    if (r.rows.length === 0) return { ok: false, reason: "not_found" };
    return { ok: true, data: rowToFormConfig(r.rows[0]) };
  } catch (error) {
    return toWriteConflict(error);
  }
}

/**
 * Enables or disables a form (inactive forms 404 on the public submit route).
 *
 * @param pool - Postgres connection pool.
 * @param name - The form's unique name.
 * @param isActive - The new active state.
 * @returns The updated row, or `null` when no row matches.
 */
export async function setFormConfigActive(pool: Pool, name: string, isActive: boolean): Promise<FormConfig | null> {
  const r = await pool.query(
    `UPDATE form_configs SET is_active = $1, updated_at = NOW() WHERE name = $2 RETURNING ${FORM_CONFIG_COLUMNS}`,
    [isActive, name],
  );
  return r.rows.length > 0 ? rowToFormConfig(r.rows[0]) : null;
}

/**
 * Hard-deletes a form config; its submissions cascade (FK `ON DELETE CASCADE`).
 *
 * @param pool - Postgres connection pool.
 * @param name - The form's unique name.
 * @returns `true` when a row was removed, `false` otherwise.
 */
export async function deleteFormConfig(pool: Pool, name: string): Promise<boolean> {
  const r = await pool.query(`DELETE FROM form_configs WHERE name = $1 RETURNING id`, [name]);
  return (r.rowCount ?? 0) > 0;
}

/**
 * Inserts one stored submission (the pipeline's `store` step). The nullable
 * GDPR anchors (`submitterEmail`, `developerAccountId`) let a future
 * export/erase service find every submission attributable to a person.
 *
 * @param pool - Postgres connection pool.
 * @param data - Form id, submitted values, and optional GDPR anchors.
 * @returns The new submission's id.
 */
export async function insertFormSubmission(pool: Pool, data: FormSubmissionInsertData): Promise<{ id: number }> {
  const r = await pool.query(
    `INSERT INTO form_submissions (form_config_id, data, submitter_email, developer_account_id)
     VALUES ($1, $2, $3, $4)
     RETURNING id`,
    [data.formConfigId, JSON.stringify(data.data), data.submitterEmail ?? null, data.developerAccountId ?? null],
  );
  return { id: r.rows[0].id };
}
