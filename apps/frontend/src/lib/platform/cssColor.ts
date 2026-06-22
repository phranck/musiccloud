/**
 * Security whitelist for untrusted backend-provided CSS colors.
 *
 * Genre tiles receive an accent color over the wire and apply it as a scoped
 * `--color-accent` CSS custom property. Custom properties are late-resolved, so
 * an arbitrary backend string could smuggle a payload (`url(...)`,
 * `expression(...)`, injected declarations) into any downstream `var()`
 * consumer. These helpers FAIL CLOSED: only values matching a strict allowlist
 * of color syntaxes pass; anything else is dropped (returns `undefined`), so a
 * compromised or malformed accent simply has no effect rather than leaking.
 *
 * Accepted syntaxes: `#rgb` / `#rrggbb` / `#rrggbbaa`, `rgb()` / `rgba()`,
 * `hsl()` / `hsla()`, `oklch()`, `oklab()`. The function-form patterns reject
 * any value containing a closing paren mid-argument, which blocks nested
 * `url()` / `expression()` injection.
 */
const SAFE_COLOR_RE = /^(#[0-9a-f]{3,8}|rgba?\([^)]*\)|hsla?\([^)]*\)|oklch\([^)]*\)|oklab\([^)]*\))$/i;

/**
 * Whether `color` is a syntactically safe CSS color from the allowlist.
 *
 * @param color - The candidate color string (already trimmed by the caller is
 *   not required; this trims internally).
 * @returns `true` when the trimmed value matches the allowlist, else `false`.
 */
export function isSafeCssColor(color: string): boolean {
  return SAFE_COLOR_RE.test(color.trim());
}

/**
 * Returns the trimmed `color` when it is a safe CSS color, otherwise
 * `undefined`. Fail-closed: missing, empty or non-matching input yields
 * `undefined` so the caller can omit the style entirely.
 *
 * @param color - The untrusted color string (or `undefined`).
 * @returns The trimmed safe color, or `undefined`.
 */
export function safeCssColor(color?: string): string | undefined {
  if (!color) return undefined;
  const trimmed = color.trim();
  return isSafeCssColor(trimmed) ? trimmed : undefined;
}
