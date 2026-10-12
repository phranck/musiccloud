import { isTierColor } from "@musiccloud/shared";

/** Canonical fallback used when backend tier material input is malformed. */
const TIER_COLOR_FALLBACK = "var(--mc-color-accent)";

/**
 * Restricts backend-provided tier colors to the six hex digits the backend
 * stores before they reach an inline CSS custom property or React style.
 */
export function normalizeTierColor(value: string): string {
  return isTierColor(value) ? value : TIER_COLOR_FALLBACK;
}
