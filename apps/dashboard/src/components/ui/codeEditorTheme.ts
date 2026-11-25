/**
 * @file The look every CodeMirror editor in the dashboard shares.
 *
 * `MarkdownEditor` and `JsonEditor` both load CodeMirror lazily, so this module
 * holds plain data rather than CodeMirror objects. Each editor passes the spec
 * to `EditorView.theme` once its chunk has arrived, and a change here reaches
 * both.
 */

import type { EditorView } from "@codemirror/view";

/** What `EditorView.theme` takes: selectors mapped to their style rules. */
type ThemeSpec = Parameters<typeof EditorView.theme>[0];

/**
 * The surface, the type, the caret, the selection and the line-number gutter.
 *
 * Every color is a dashboard token, so the editor follows the design rather
 * than carrying a palette of its own. The syntax colors are not part of it,
 * because each language colors different things.
 */
export const CODE_EDITOR_THEME_SPEC: ThemeSpec = {
  "&": {
    backgroundColor: "var(--ds-md-editor-bg, var(--ds-input-bg))",
    color: "var(--ds-text)",
    fontSize: "var(--source-font-size, 0.875rem)",
  },
  ".cm-editor": {
    height: "100%",
    minHeight: 0,
  },
  ".cm-scroller": {
    overflowY: "auto",
    overflowX: "auto",
    overscrollBehavior: "contain",
  },
  ".cm-content": {
    padding: "0.375rem 0.75rem",
    fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
    caretColor: "var(--color-primary)",
  },
  "&.cm-focused": {
    outline: "none",
  },
  ".cm-activeLine": {
    backgroundColor: "transparent",
  },
  "&.cm-focused .cm-cursor": {
    borderLeftColor: "var(--color-primary)",
  },
  "&.cm-focused .cm-selectionBackground, .cm-selectionBackground": {
    backgroundColor: "color-mix(in srgb, var(--color-primary) 18%, transparent) !important",
  },
  "& ::selection": {
    backgroundColor: "color-mix(in srgb, var(--color-primary) 18%, transparent)",
    color: "inherit",
  },
  "& ::-moz-selection": {
    backgroundColor: "color-mix(in srgb, var(--color-primary) 18%, transparent)",
    color: "inherit",
  },
  ".cm-placeholder": {
    color: "var(--ds-text-subtle)",
    fontStyle: "normal",
  },
  // A column beside the text rather than a mark in front of each line, so it
  // runs the full height and stays put whilst a long line scrolls past it.
  ".cm-gutters": {
    backgroundColor: "var(--ds-bg-elevated)",
    color: "var(--ds-text-subtle)",
    border: "none",
    borderRight: "1px solid var(--ds-border)",
  },
  ".cm-lineNumbers .cm-gutterElement": {
    padding: "0 0.5rem 0 0.75rem",
    minWidth: "2.5rem",
  },
  // The numbers sit on the same rhythm as the lines they count. Left to
  // inherit, the two drift apart by a whole line over enough of them.
  ".cm-gutters, .cm-content": {
    lineHeight: "1.5",
  },
  ".cm-activeLineGutter": {
    backgroundColor: "transparent",
  },
};

/**
 * The parts of `@uiw/react-codemirror`'s basic setup the dashboard editors
 * switch off or set.
 *
 * Each editor adds the line-number gutter itself, so it can be switched; the
 * fold gutter, the active-line band and the highlighting of matching words are
 * off because they compete with the syntax colors; a tab is two spaces.
 */
export const CODE_EDITOR_BASIC_SETUP = {
  lineNumbers: false,
  foldGutter: false,
  highlightActiveLine: false,
  highlightSelectionMatches: false,
  tabSize: 2,
} as const;
