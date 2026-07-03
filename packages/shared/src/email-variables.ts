/**
 * @file Auto-extraction of an email template's `{{var}}` placeholders (MC-080).
 *
 * A template's expected variables are DERIVED from its content, never declared
 * by hand: this scans the subject and the body blocks that the renderer
 * actually interpolates and returns the distinct placeholder names. Backend
 * gates (bind-time compatibility + send-time validation in
 * `services/email-actions.ts` / `routes/admin-email-actions.ts`) and the
 * dashboard editor (read-only "detected variables" display) share this one
 * function, so what a template "requires" can never drift from what it uses.
 */

import { type EmailBlock, EmailBlockType } from "./email-blocks.js";

/** Matches a `{{name}}` placeholder; the capture group is the bare variable name. */
const VARIABLE_PATTERN = /\{\{(\w+)\}\}/g;

/**
 * Appends every `{{var}}` name found in `text` to `names` (deduplicated),
 * preserving first-seen order.
 *
 * @param text - the string to scan.
 * @param names - the accumulator array, mutated in place.
 * @param seen - the set of already-collected names, mutated in place.
 */
function collectFrom(text: string, names: string[], seen: Set<string>): void {
  for (const match of text.matchAll(VARIABLE_PATTERN)) {
    const name = match[1];
    if (!seen.has(name)) {
      seen.add(name);
      names.push(name);
    }
  }
}

/**
 * Extracts the distinct `{{var}}` placeholder names a template uses, in
 * first-seen order. Scans exactly the fields the renderer interpolates: the
 * subject, each text block's `markdown`, and each button block's `url`. Button
 * labels, image alt text, and non-textual blocks are intentionally NOT scanned
 * because the renderer never interpolates them.
 *
 * @param subject - the template's subject line.
 * @param blocks - the template's ordered body blocks.
 * @returns the distinct variable names, in first-seen order (empty when none).
 */
export function extractEmailTemplateVariables(subject: string, blocks: EmailBlock[]): string[] {
  const names: string[] = [];
  const seen = new Set<string>();

  collectFrom(subject, names, seen);
  for (const block of blocks) {
    if (block.type === EmailBlockType.Text) {
      collectFrom(block.markdown, names, seen);
    } else if (block.type === EmailBlockType.Button) {
      collectFrom(block.url, names, seen);
    }
  }

  return names;
}
