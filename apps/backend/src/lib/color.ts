/**
 * @file Hex-colour validation for email branding gradient inputs (MC-079).
 *
 * Gradient colours are interpolated verbatim into an inline `style="..."`
 * attribute and into a `<style>` block on the email send path
 * (`services/email-renderer.ts`). An attacker-controlled value that merely
 * starts with a valid hex (`#fff;}</style>...`) would break out of the CSS
 * context, so the route layer rejects any value that is not a bare `#rgb` /
 * `#rrggbb` literal — sanitizing is not enough, the whole value must match.
 */

/** Matches exactly `#` + 3 or 6 hex digits, anchored, nothing else allowed. */
const HEX_COLOR_PATTERN = /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/;

/**
 * Type guard: is `value` a literal 3- or 6-digit hex colour (e.g. `#0076d5`,
 * `#fff`)? Rejects CSS keywords (`red`), functional colours (`rgb(...)`),
 * wrong lengths, non-hex characters, trailing content (whitespace, `;`,
 * `!important`, injected markup) and non-string inputs.
 *
 * @param value - any candidate value (typically an untyped JSON body field).
 * @returns `true` only when `value` is a well-formed literal hex colour string.
 */
export function isHexColor(value: unknown): value is string {
  return typeof value === "string" && HEX_COLOR_PATTERN.test(value);
}
