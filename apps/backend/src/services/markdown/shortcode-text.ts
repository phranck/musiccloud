/**
 * @file Reads a shortcode's text parameter as the island shortcodes take it.
 *
 * The support ladder and the sponsor wall both hand their texts to the site as
 * rendered Markdown, and an author writes a line break into a quoted attribute
 * as `\n`. Both read a parameter the same way through this module.
 */

import type { ShortcodeParamValue } from "@musiccloud/shared";

/**
 * Turns the escape sequences an author types inside a quoted attribute into
 * the characters they stand for, so `\n` writes a line break into a text.
 *
 * @param value - The attribute as written.
 * @returns The text with `\n` and `\t` replaced.
 */
function unescapeText(value: string): string {
  return value.replace(/\\n/g, "\n").replace(/\\t/g, "\t");
}

/**
 * Reads a string parameter.
 *
 * @param value - The parameter as the parser resolved it.
 * @returns The trimmed text, unescaped, or empty when the parameter is absent
 *   or not a string.
 */
export function shortcodeText(value: ShortcodeParamValue | undefined): string {
  return typeof value === "string" ? unescapeText(value.trim()) : "";
}
