/** Canonical fallback used when backend tier material input is malformed. */
const TIER_COLOR_FALLBACK = "var(--mc-color-accent)";

/**
 * Restricts backend-provided tier colors to six- or eight-digit hexadecimal
 * values before they reach an inline CSS custom property or React style.
 */
export function normalizeTierColor(value: string): string {
  return /^#[0-9a-f]{6}(?:[0-9a-f]{2})?$/i.test(value) ? value : TIER_COLOR_FALLBACK;
}
