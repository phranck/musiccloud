import { markdown } from "@codemirror/lang-markdown";
import { HighlightStyle, syntaxHighlighting } from "@codemirror/language";
import { EditorSelection, type Extension, Prec } from "@codemirror/state";
import { placeholder as cmPlaceholder, drawSelection, EditorView, keymap } from "@codemirror/view";
import { tags as t } from "@lezer/highlight";
import CodeMirror from "@uiw/react-codemirror";
import * as React from "react";

export interface MarkdownEditorProps {
  id?: string;
  value: string;
  onChange: (value: string) => void;
  onPaste?: (event: ClipboardEvent) => void;
  placeholder?: string;
  rows?: number;
  height?: string;
  resizable?: boolean;
  showHints?: boolean;
  extensions?: Extension[];
  className?: string;
}

const editorTheme = EditorView.theme({
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
});

const highlightStyle = HighlightStyle.define([
  {
    tag: [t.heading1, t.heading2, t.heading3, t.heading4, t.heading5, t.heading6],
    fontWeight: "600",
    color: "var(--md-heading)",
  },
  { tag: t.strong, fontWeight: "bold" },
  { tag: t.emphasis, fontStyle: "italic", color: "var(--md-emphasis)" },
  { tag: t.strikethrough, textDecoration: "line-through" },
  { tag: [t.link, t.url], color: "var(--color-primary)" },
  { tag: t.monospace, fontFamily: "inherit", color: "var(--md-code)" },
  { tag: t.quote, color: "var(--md-quote)", fontStyle: "italic" },
  { tag: t.processingInstruction, color: "var(--md-punctuation)" },
  { tag: t.punctuation, color: "var(--md-punctuation)" },
  { tag: t.atom, color: "var(--md-punctuation)" },
]);

const mcTheme = [editorTheme, syntaxHighlighting(highlightStyle)];

const EMPTY_EXTENSIONS: Extension[] = [];

function wrapSelection(view: EditorView, before: string, after: string): boolean {
  view.dispatch(
    view.state.changeByRange((range) => {
      const text = view.state.sliceDoc(range.from, range.to);
      const insert = `${before}${text}${after}`;
      return {
        changes: { from: range.from, to: range.to, insert },
        range: EditorSelection.range(range.from + before.length, range.from + before.length + text.length),
      };
    }),
  );
  return true;
}

const mdKeymap = Prec.highest(
  keymap.of([
    { key: "Mod-b", run: (view) => wrapSelection(view, "**", "**") },
    { key: "Mod-i", run: (view) => wrapSelection(view, "*", "*") },
    { key: "Mod-Shift-d", run: (view) => wrapSelection(view, "~~", "~~") },
    {
      key: "Mod-k",
      run(view) {
        const { state } = view;
        view.dispatch(
          state.changeByRange((range) => {
            const sel = state.sliceDoc(range.from, range.to);
            const insert = `[${sel}]()`;
            return {
              changes: { from: range.from, to: range.to, insert },
              range: EditorSelection.cursor(range.from + insert.length - 1),
            };
          }),
        );
        return true;
      },
    },
  ]),
);

function Key({ children }: { children: string }) {
  return (
    <kbd className="inline-flex items-center justify-center min-w-[1.25rem] h-[1.25rem] px-[0.25rem] rounded border border-[var(--ds-border-strong)] bg-[var(--ds-bg-elevated)] text-[var(--ds-text-muted)] text-[0.625rem] font-medium shadow-[0_1px_0_var(--ds-border)] leading-none select-none">
      {children}
    </kbd>
  );
}

function Hint({ keys, label }: { keys: string[]; label: string }) {
  return (
    <span className="flex items-center gap-0.5">
      {keys.map((k) => (
        <Key key={k}>{k}</Key>
      ))}
      <span className="ml-0.5 text-[var(--ds-text-muted)]">{label}</span>
    </span>
  );
}

const HINTS_BAR_MIN_WIDTH = 420;

function HintsBar() {
  const ref = React.useRef<HTMLDivElement>(null);
  const [visible, setVisible] = React.useState(true);

  React.useEffect(() => {
    const el = ref.current?.parentElement;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => {
      setVisible(entry.contentRect.width >= HINTS_BAR_MIN_WIDTH);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  if (!visible) return null;

  return (
    <div
      ref={ref}
      className="flex items-center justify-between gap-3 px-2.5 py-1.5 border-t border-[var(--ds-border)] bg-[var(--ds-section-header-bg,var(--ds-bg-elevated))] text-[0.625rem]"
    >
      <div className="flex items-center gap-2.5">
        <Hint keys={["⌘", "B"]} label="Bold" />
        <Hint keys={["⌘", "I"]} label="Italic" />
        <Hint keys={["⌘", "K"]} label="Link" />
        <Hint keys={["⌘", "⇧", "D"]} label="Strike" />
      </div>
    </div>
  );
}

export function MarkdownEditor({
  id,
  value,
  onChange,
  onPaste,
  placeholder,
  rows = 4,
  height,
  resizable = false,
  showHints = true,
  extensions: extraExtensions = EMPTY_EXTENSIONS,
  className = "",
}: MarkdownEditorProps) {
  const rowsHeight = `${rows * 1.5}rem`;
  const wrapperHeight = resizable && showHints ? `calc(${rowsHeight} + 2.25rem)` : rowsHeight;

  const extensions = React.useMemo(
    () => [
      markdown(),
      EditorView.lineWrapping,
      drawSelection(),
      mdKeymap,
      ...(onPaste
        ? [
            EditorView.domEventHandlers({
              paste(event) {
                onPaste(event);
                return event.defaultPrevented;
              },
            }),
          ]
        : []),
      ...(placeholder ? [cmPlaceholder(placeholder)] : []),
      ...extraExtensions,
    ],
    [onPaste, placeholder, extraExtensions],
  );

  const wrapperStyle: React.CSSProperties | undefined = resizable
    ? { height: wrapperHeight, resize: "vertical", overflow: "hidden" }
    : height
      ? { height }
      : undefined;

  const isFlexCol = resizable && showHints;
  const hasBoundedHeight = resizable || Boolean(height);
  const editorContainerClassName = hasBoundedHeight ? "h-full min-h-0" : undefined;

  return (
    <div
      id={id}
      className={`rounded-control border border-[var(--ds-border)] bg-[var(--ds-input-bg)] overflow-hidden focus-within:ring-2 focus-within:ring-[var(--color-primary)] focus-within:outline-none ${isFlexCol ? "flex flex-col" : ""} ${className}`}
      style={wrapperStyle}
    >
      <div className={isFlexCol ? "flex-1 min-h-0 overflow-hidden" : undefined}>
        <CodeMirror
          value={value}
          onChange={(val) => onChange(val)}
          extensions={extensions}
          theme={mcTheme}
          className={editorContainerClassName}
          height={resizable ? "100%" : height}
          minHeight={resizable ? undefined : height ? undefined : rowsHeight}
          basicSetup={{
            lineNumbers: false,
            foldGutter: false,
            highlightActiveLine: false,
            highlightSelectionMatches: false,
            tabSize: 2,
          }}
        />
      </div>
      {showHints && <HintsBar />}
    </div>
  );
}
