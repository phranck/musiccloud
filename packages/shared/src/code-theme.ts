/**
 * @file The colours a code block is highlighted in.
 *
 * A highlighter ships with themes built for editors, and every one of them
 * carries its own palette. Dropped onto a musiccloud surface, that palette is
 * simply a different product's: the one this replaces set a shell command in
 * olive and its strings in terracotta, which against this background read as
 * barely coloured at all.
 *
 * So the colours are the product's own, named here once and read by the
 * renderer. The figures match the design tokens they are taken from, which is
 * stated per entry, because a highlighter needs concrete colours: it writes
 * them into the markup rather than reading them from the page.
 *
 * Only the scopes that carry meaning are named. Everything else takes the
 * block's own foreground, which is what an unhighlighted run should look like.
 */

/**
 * One rule of the theme: which scopes it covers and what they are drawn in.
 *
 * @property scope - The TextMate scopes this applies to.
 * @property settings - What to draw them in.
 */
interface CodeThemeRule {
  scope: readonly string[];
  settings: { foreground?: string; fontStyle?: string };
}

/** The theme's name, which is how the renderer asks for it. */
export const CODE_THEME_NAME = "musiccloud";

/** `--mc-color-code-fg`: what a run with no meaning of its own is drawn in. */
const FOREGROUND = "#c2d2dc";

/** `--mc-color-fg-subtle`: a comment, which is read last or not at all. */
const COMMENT = "#67676f";

/** `--mc-color-gold`: a literal, which is the value a reader came for. */
const LITERAL = "#d4a843";

/** `--mc-color-accent-hover`: what the line does, so the eye lands on it first. */
const ACTION = "#45bfe8";

/** `--mc-color-fg-muted`: a name the code gives something. */
const NAME = "#9fb0bc";

/** `--mc-color-success`: a type or a constant the language itself defines. */
const LANGUAGE = "#4ade80";

/**
 * The theme, in the shape a highlighter takes it.
 *
 * `type: "dark"` because every musiccloud surface is, and a highlighter uses it
 * to decide what to do with a scope this theme does not name.
 */
export const CODE_THEME = {
  name: CODE_THEME_NAME,
  type: "dark",
  colors: {
    "editor.foreground": FOREGROUND,
    "editor.background": "#00000000",
  },
  settings: [
    { scope: ["comment", "punctuation.definition.comment"], settings: { foreground: COMMENT, fontStyle: "italic" } },
    // Quoted only. A shell reads a bare word as a string too, so `string` on its
    // own would paint an address and every flag in the colour kept for a value
    // somebody typed in quotes.
    {
      scope: ["string.quoted", "string.template", "punctuation.definition.string"],
      settings: { foreground: LITERAL },
    },
    { scope: ["constant.numeric", "constant.language.boolean"], settings: { foreground: LITERAL } },
    {
      scope: ["keyword", "storage", "storage.type", "keyword.control", "keyword.operator.new"],
      settings: { foreground: ACTION },
    },
    {
      scope: ["entity.name.function", "support.function", "meta.function-call", "entity.name.tag"],
      settings: { foreground: ACTION },
    },
    {
      scope: ["constant.language", "support.type", "entity.name.type", "support.class"],
      settings: { foreground: LANGUAGE },
    },
    {
      scope: ["variable", "variable.parameter", "meta.object-literal.key", "support.type.property-name"],
      settings: { foreground: NAME },
    },
    {
      scope: ["punctuation", "meta.brace", "keyword.operator"],
      settings: { foreground: FOREGROUND },
    },
  ] satisfies readonly CodeThemeRule[],
} as const;
