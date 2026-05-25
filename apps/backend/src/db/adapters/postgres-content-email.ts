/**
 * Email template domain: CRUD for the `email_templates` table used by
 * outbound transactional mail (invite, password reset, etc.).
 *
 * Scope:
 *   - List / get / insert / update / delete email templates.
 *   - Lookup by primary key and by unique `name`.
 *
 * Excludes:
 *   - Mail rendering and dispatch (see `lib/mail/*`).
 *   - The `is_system_template` flag's enforcement (handled at the
 *     service layer; the DB does not block delete on its own).
 */

import type { Pool } from "pg";
import type { EmailTemplateRow, EmailTemplateWriteData } from "../admin-repository.js";

// ============================================================================
// ROW TYPES
// ============================================================================

interface EmailTemplateSqlRow {
  id: number;
  name: string;
  subject: string;
  header_banner_url: string | null;
  header_text: string | null;
  body_text: string;
  footer_banner_url: string | null;
  footer_text: string | null;
  is_system_template: boolean;
  created_at: Date;
  updated_at: Date;
}

// ============================================================================
// MAPPERS
// ============================================================================

/**
 * Maps a raw `email_templates` row to the public {@link EmailTemplateRow}
 * DTO (snake_case → camelCase).
 */
function rowToEmailTemplate(row: EmailTemplateSqlRow): EmailTemplateRow {
  return {
    id: row.id,
    name: row.name,
    subject: row.subject,
    headerBannerUrl: row.header_banner_url,
    headerText: row.header_text,
    bodyText: row.body_text,
    footerBannerUrl: row.footer_banner_url,
    footerText: row.footer_text,
    isSystemTemplate: row.is_system_template,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
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
    `SELECT id, name, subject, header_banner_url, header_text, body_text,
            footer_banner_url, footer_text, is_system_template, created_at, updated_at
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
    `SELECT id, name, subject, header_banner_url, header_text, body_text,
            footer_banner_url, footer_text, is_system_template, created_at, updated_at
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
    `SELECT id, name, subject, header_banner_url, header_text, body_text,
            footer_banner_url, footer_text, is_system_template, created_at, updated_at
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
 * Inserts a new email template. Optional banner / footer fields default
 * to `null`; `isSystemTemplate` defaults to `false`.
 *
 * @param pool - Postgres connection pool.
 * @param data - Template payload. `subject` and `bodyText` are required.
 * @returns The persisted row, including DB-assigned id and timestamps.
 */
export async function insertEmailTemplate(pool: Pool, data: EmailTemplateWriteData): Promise<EmailTemplateRow> {
  const result = await pool.query(
    `INSERT INTO email_templates
       (name, subject, header_banner_url, header_text, body_text,
        footer_banner_url, footer_text, is_system_template)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
     RETURNING id, name, subject, header_banner_url, header_text, body_text,
               footer_banner_url, footer_text, is_system_template, created_at, updated_at`,
    [
      data.name,
      data.subject,
      data.headerBannerUrl ?? null,
      data.headerText ?? null,
      data.bodyText,
      data.footerBannerUrl ?? null,
      data.footerText ?? null,
      data.isSystemTemplate ?? false,
    ],
  );
  return rowToEmailTemplate(result.rows[0]);
}

/**
 * Partially updates an email template. Only keys present on `data` are
 * written. `updated_at` is always bumped to `NOW()` when at least one
 * column changed; an empty `data` short-circuits to a re-read.
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
  const columnMap: Record<keyof EmailTemplateWriteData, string> = {
    name: "name",
    subject: "subject",
    headerBannerUrl: "header_banner_url",
    headerText: "header_text",
    bodyText: "body_text",
    footerBannerUrl: "footer_banner_url",
    footerText: "footer_text",
    isSystemTemplate: "is_system_template",
  };

  const setClauses: string[] = [];
  const values: unknown[] = [];
  let paramIndex = 1;

  for (const [key, value] of Object.entries(data)) {
    const column = columnMap[key as keyof EmailTemplateWriteData];
    if (column) {
      setClauses.push(`${column} = $${paramIndex}`);
      values.push(value ?? null);
      paramIndex++;
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
     RETURNING id, name, subject, header_banner_url, header_text, body_text,
               footer_banner_url, footer_text, is_system_template, created_at, updated_at`,
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
