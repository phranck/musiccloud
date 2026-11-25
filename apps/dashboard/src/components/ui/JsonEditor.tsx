import * as React from "react";

import { CODE_EDITOR_BASIC_SETUP, CODE_EDITOR_THEME_SPEC } from "./codeEditorTheme";

/** Props of {@link JsonEditor}. */
export interface JsonEditorProps {
  /** The id of the frame around the editor. */
  id?: string;
  /** The id of the element that names the field, read out for the editing area. */
  labelledBy?: string;
  /** The JSON text shown. */
  value: string;
  /** Called with the whole text after every edit. */
  onChange: (value: string) => void;
  /** Whether the text can be read but not changed. Defaults to `false`. */
  readOnly?: boolean;
  /** The height the editor keeps however short the text is, as a CSS length. Defaults to {@link JSON_EDITOR_MIN_HEIGHT}. */
  minHeight?: string;
  /**
   * The height past which the editor scrolls inside itself rather than
   * growing, as a CSS length. Defaults to {@link JSON_EDITOR_MAX_HEIGHT}.
   */
  maxHeight?: string;
}

/** The default {@link JsonEditorProps.minHeight}: `280px`, the height the plain field it replaces had. */
const JSON_EDITOR_MIN_HEIGHT = "280px";

/**
 * The default {@link JsonEditorProps.maxHeight}: `70vh`, which leaves room for
 * the buttons under the editor on screen.
 */
const JSON_EDITOR_MAX_HEIGHT = "70vh";

/** Props the lazily loaded CodeMirror part of {@link JsonEditor} takes. */
type JsonCodeMirrorProps = Required<
  Pick<JsonEditorProps, "value" | "onChange" | "readOnly" | "minHeight" | "maxHeight">
> &
  Pick<JsonEditorProps, "labelledBy">;

/**
 * CodeMirror with the JSON language, loaded in its own chunk.
 *
 * The chunk is fetched the first time a JSON editor is shown, so pages without
 * one do not load it. The colors come from the `--json-*` tokens in
 * `tokens.css`, and the surface and gutter from {@link CODE_EDITOR_THEME_SPEC}.
 */
const JsonCodeMirror = React.lazy(async () => {
  const [
    { json },
    { HighlightStyle, syntaxHighlighting },
    { drawSelection, EditorView, lineNumbers },
    { tags: t },
    { default: CodeMirror },
  ] = await Promise.all([
    import("@codemirror/lang-json"),
    import("@codemirror/language"),
    import("@codemirror/view"),
    import("@lezer/highlight"),
    import("@uiw/react-codemirror"),
  ]);

  /** One color per role a piece of JSON plays. */
  const highlightStyle = HighlightStyle.define([
    { tag: t.propertyName, color: "var(--json-key)" },
    { tag: t.string, color: "var(--json-string)" },
    { tag: t.number, color: "var(--json-number)" },
    { tag: [t.bool, t.null], color: "var(--json-literal)" },
    { tag: [t.brace, t.squareBracket, t.separator, t.punctuation], color: "var(--json-punctuation)" },
  ]);

  const theme = [EditorView.theme(CODE_EDITOR_THEME_SPEC), syntaxHighlighting(highlightStyle)];

  return {
    default: function LoadedJsonCodeMirror({
      value,
      onChange,
      readOnly,
      minHeight,
      maxHeight,
      labelledBy,
    }: JsonCodeMirrorProps) {
      const extensions = React.useMemo(
        () => [
          lineNumbers(),
          json(),
          drawSelection(),
          ...(labelledBy ? [EditorView.contentAttributes.of({ "aria-labelledby": labelledBy })] : []),
        ],
        [labelledBy],
      );

      return (
        <CodeMirror
          value={value}
          onChange={(nextValue) => onChange(nextValue)}
          extensions={extensions}
          theme={theme}
          readOnly={readOnly}
          minHeight={minHeight}
          maxHeight={maxHeight}
          basicSetup={CODE_EDITOR_BASIC_SETUP}
        />
      );
    },
  };
});

/**
 * A code editor for JSON: colored by syntax, with a line-number gutter, in the
 * same frame and on the same surface as the Markdown editor.
 *
 * It grows with its text between `minHeight` and `maxHeight` and scrolls inside
 * itself beyond that. Formatting is the caller's, because what counts as the
 * saved text, and so whether formatting changes anything, is theirs to decide.
 *
 * @param props - See {@link JsonEditorProps}.
 * @returns The framed editor, with a placeholder of the same height while CodeMirror loads.
 */
export function JsonEditor({
  id,
  labelledBy,
  value,
  onChange,
  readOnly = false,
  minHeight = JSON_EDITOR_MIN_HEIGHT,
  maxHeight = JSON_EDITOR_MAX_HEIGHT,
}: JsonEditorProps) {
  return (
    <div
      id={id}
      className="overflow-hidden rounded-control border border-[var(--ds-border)] bg-[var(--ds-input-bg)] focus-within:outline-none focus-within:ring-2 focus-within:ring-inset focus-within:ring-[var(--color-primary)]"
    >
      <React.Suspense fallback={<div className="animate-pulse bg-[var(--ds-bg-elevated)]" style={{ minHeight }} />}>
        <JsonCodeMirror
          value={value}
          onChange={onChange}
          readOnly={readOnly}
          minHeight={minHeight}
          maxHeight={maxHeight}
          labelledBy={labelledBy}
        />
      </React.Suspense>
    </div>
  );
}
