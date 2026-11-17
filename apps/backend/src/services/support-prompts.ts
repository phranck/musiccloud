/**
 * @file Reads and writes the support prompts.
 *
 * Ported from lmaa.space (`apps/backend/src/repositories/support-prompts.ts`).
 * The identifier is never part of an update: the counters in a reader's
 * browser are keyed by it, so changing it would reset everybody.
 */

import type { SupportPrompt, SupportPromptInput } from "@musiccloud/shared";
import { nanoid } from "nanoid";
import { getDatabasePool } from "../db/pool.js";

/** One `support_prompts` row as the reads below return it. */
interface SupportPromptQueryRow {
  id: string;
  name: string;
  slot: SupportPrompt["slot"];
  content: string;
  button_label: string;
  button_href: string;
  button_alignment: SupportPrompt["buttonAlignment"];
  threshold: number;
  threshold_basis: SupportPrompt["thresholdBasis"];
  starts_at: string | null;
  ends_at: string | null;
  priority: number;
  published: boolean;
  updated_at: Date;
}

/** The columns every read selects. */
const PROMPT_COLUMNS = `id, name, slot, content, button_label, button_href, button_alignment, threshold,
  threshold_basis, starts_at, ends_at, priority, published, updated_at`;

/**
 * The order every list is read in: by slot, then the higher priority first,
 * then the newest first, so the site can prefer the first of two equals.
 */
const PROMPT_ORDER = "ORDER BY slot ASC, priority DESC, created_at DESC";

/**
 * Turns a row into what the API returns.
 *
 * @param row - The row as read.
 * @returns The prompt.
 */
function toPrompt(row: SupportPromptQueryRow): SupportPrompt {
  return {
    id: row.id,
    name: row.name,
    slot: row.slot,
    content: row.content,
    buttonLabel: row.button_label,
    buttonHref: row.button_href,
    buttonAlignment: row.button_alignment,
    threshold: row.threshold,
    thresholdBasis: row.threshold_basis,
    startsAt: row.starts_at,
    endsAt: row.ends_at,
    priority: row.priority,
    published: row.published,
    updatedAt: new Date(row.updated_at).toISOString(),
  };
}

/**
 * The input's values in the order the writes below bind them, `$2` onwards.
 *
 * @param input - The validated prompt.
 * @returns The values.
 */
function inputValues(input: SupportPromptInput): unknown[] {
  return [
    input.name,
    input.slot,
    input.content,
    input.buttonLabel,
    input.buttonHref,
    input.buttonAlignment,
    input.threshold,
    input.thresholdBasis,
    input.startsAt,
    input.endsAt,
    input.priority,
    input.published,
  ];
}

/**
 * Returns every prompt, newest first within a slot, for the dashboard list.
 *
 * @returns Every prompt, published or not.
 */
export async function listSupportPrompts(): Promise<SupportPrompt[]> {
  const result = await getDatabasePool().query<SupportPromptQueryRow>(
    `SELECT ${PROMPT_COLUMNS} FROM support_prompts ${PROMPT_ORDER}`,
  );
  return result.rows.map(toPrompt);
}

/**
 * Returns one prompt.
 *
 * @param id - The prompt's identifier.
 * @returns The prompt, or `null` when no prompt carries that identifier.
 */
export async function getSupportPrompt(id: string): Promise<SupportPrompt | null> {
  const result = await getDatabasePool().query<SupportPromptQueryRow>(
    `SELECT ${PROMPT_COLUMNS} FROM support_prompts WHERE id = $1 LIMIT 1`,
    [id],
  );
  const row = result.rows[0];
  return row ? toPrompt(row) : null;
}

/**
 * Returns the prompts a visitor may be shown today.
 *
 * Unpublished prompts never leave the server, because a prompt is rendered in
 * the reader's browser and a draft would otherwise be readable in the network
 * traffic. A prompt without a window is always current; one with a window is
 * current whilst `day` lies inside it, its first and last day included.
 *
 * @param day - The day to test the windows against, as `YYYY-MM-DD`.
 * @returns The prompts in the order the site should prefer them.
 */
export async function listPublishedSupportPrompts(day: string): Promise<SupportPrompt[]> {
  const result = await getDatabasePool().query<SupportPromptQueryRow>(
    `SELECT ${PROMPT_COLUMNS} FROM support_prompts
      WHERE published
        AND (starts_at IS NULL OR starts_at <= $1)
        AND (ends_at IS NULL OR ends_at >= $1)
      ${PROMPT_ORDER}`,
    [day],
  );
  return result.rows.map(toPrompt);
}

/**
 * Stores a new prompt.
 *
 * @param input - The validated prompt.
 * @returns The stored prompt, including the identifier it was given.
 */
export async function insertSupportPrompt(input: SupportPromptInput): Promise<SupportPrompt> {
  const result = await getDatabasePool().query<SupportPromptQueryRow>(
    `INSERT INTO support_prompts (id, name, slot, content, button_label, button_href, button_alignment,
       threshold, threshold_basis, starts_at, ends_at, priority, published)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
     RETURNING ${PROMPT_COLUMNS}`,
    [nanoid(), ...inputValues(input)],
  );
  return toPrompt(result.rows[0] as SupportPromptQueryRow);
}

/**
 * Updates one prompt. The identifier is never part of an update.
 *
 * @param id - The prompt to change.
 * @param input - The validated new values.
 * @returns The stored prompt, or `null` when it no longer exists.
 */
export async function updateSupportPrompt(id: string, input: SupportPromptInput): Promise<SupportPrompt | null> {
  const result = await getDatabasePool().query<SupportPromptQueryRow>(
    `UPDATE support_prompts
        SET name = $2, slot = $3, content = $4, button_label = $5, button_href = $6, button_alignment = $7,
            threshold = $8, threshold_basis = $9, starts_at = $10, ends_at = $11, priority = $12,
            published = $13, updated_at = NOW()
      WHERE id = $1
      RETURNING ${PROMPT_COLUMNS}`,
    [id, ...inputValues(input)],
  );
  const row = result.rows[0];
  return row ? toPrompt(row) : null;
}

/**
 * Removes one prompt.
 *
 * @param id - The prompt to remove.
 * @returns `true` when a prompt was removed, `false` when none carried that identifier.
 */
export async function deleteSupportPrompt(id: string): Promise<boolean> {
  const result = await getDatabasePool().query("DELETE FROM support_prompts WHERE id = $1", [id]);
  return (result.rowCount ?? 0) > 0;
}
