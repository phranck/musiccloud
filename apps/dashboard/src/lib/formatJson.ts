/**
 * @file Pretty-printing JSON text for the dashboard's JSON editor.
 */

import { CODE_EDITOR_BASIC_SETUP } from "@/components/ui/codeEditorTheme";

/**
 * The spaces each nesting level of formatted JSON is indented by: the
 * dashboard editors' tab size, so Tab in the editor and Format agree.
 */
const JSON_INDENT_SPACES = CODE_EDITOR_BASIC_SETUP.tabSize;

/**
 * Lays JSON text out one value per line, indented by {@link JSON_INDENT_SPACES}.
 *
 * The values themselves are left as `JSON.parse` reads them, so the result
 * means the same as the input. Empty text stays empty, because an empty field
 * is not a JSON error and there is nothing to lay out.
 *
 * @param text - The JSON as typed, pasted or stored.
 * @returns The formatted text, `""` for empty or whitespace-only input, or
 *   `null` when the text does not parse as JSON.
 */
export function formatJson(text: string): string | null {
  if (text.trim() === "") return "";
  try {
    return JSON.stringify(JSON.parse(text), null, JSON_INDENT_SPACES);
  } catch {
    return null;
  }
}
