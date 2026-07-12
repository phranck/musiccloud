/** A source file inspected by the Developer Portal design-system guard. */
export interface StyleSource {
  path: string;
  content: string;
}

/** Style drift categories enforced across authored CSS, Astro, and TSX files. */
export type StyleDiagnosticRule = "raw-color" | "structural-utility" | "raw-radius";

/** One actionable style violation with stable source location and value. */
export interface StyleDiagnostic {
  path: string;
  line: number;
  rule: StyleDiagnosticRule;
  value: string;
}

const RAW_COLOR_PATTERN = /#[0-9a-f]{3,8}\b|\brgba?\([^)]*\)/gi;
const STRUCTURAL_UTILITY_PATTERN =
  /(?:^|[\s"'`])((?:-?m[trblxy]?|-?p[trblxy]?|gap(?:-[xy])?|space-[xy]|w|h|min-w|max-w|min-h|max-h|size|rounded(?:-[trbl]{1,2})?|inset(?:-[xy])?|top|right|bottom|left|translate-[xy]|grid-cols|auto-cols|basis)-\[[^\]]+\])/g;
const RAW_RADIUS_PATTERN = /border-radius\s*:\s*([^;}\n]+)/gi;

/** Returns the one-based line containing a matched source offset. */
function lineAt(content: string, offset: number): number {
  return content.slice(0, offset).split("\n").length;
}

/**
 * Allows only the documented custom-property bridge for content-measured
 * animation heights. SVG numeric geometry is not a CSS structural utility and
 * therefore never enters this rule.
 */
function isAllowedStructuralUtility(value: string): boolean {
  return /^(?:h|min-h|max-h)-\[var\(--mc-[a-z0-9-]*animation-height\)\]$/.test(value);
}

/** Accepts radius values that resolve through the shared token cascade. */
function isTokenRadius(value: string): boolean {
  const normalized = value.trim();
  return normalized === "inherit" || normalized.includes("var(") || normalized.startsWith("calc(");
}

/**
 * Finds design-system drift in authored Developer Portal sources.
 *
 * Canonical runtime colors live outside `src` in `public/developer-theme.css`.
 * `tokens.css` is retained as an explicit mapping exception, while backend
 * tier values and Shiki colors remain dynamic data rather than source literals.
 */
export function scanDeveloperStyles(sources: readonly StyleSource[]): StyleDiagnostic[] {
  const diagnostics: StyleDiagnostic[] = [];

  for (const source of sources) {
    if (source.path !== "src/styles/tokens.css") {
      for (const match of source.content.matchAll(RAW_COLOR_PATTERN)) {
        diagnostics.push({
          path: source.path,
          line: lineAt(source.content, match.index),
          rule: "raw-color",
          value: match[0],
        });
      }
    }

    for (const match of source.content.matchAll(STRUCTURAL_UTILITY_PATTERN)) {
      const value = match[1];
      if (!value || isAllowedStructuralUtility(value)) continue;
      diagnostics.push({
        path: source.path,
        line: lineAt(source.content, match.index + match[0].indexOf(value)),
        rule: "structural-utility",
        value,
      });
    }

    if (!source.path.endsWith(".css")) continue;
    for (const match of source.content.matchAll(RAW_RADIUS_PATTERN)) {
      const value = match[1];
      if (!value || isTokenRadius(value)) continue;
      diagnostics.push({
        path: source.path,
        line: lineAt(source.content, match.index),
        rule: "raw-radius",
        value: value.trim(),
      });
    }
  }

  return diagnostics;
}
