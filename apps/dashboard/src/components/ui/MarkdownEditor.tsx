import type { DecorationSet, ViewUpdate } from "@codemirror/view";
import {
  highlightShortcodes,
  SHORTCODE_HIGHLIGHT_BOLD_KIND,
  SHORTCODE_HIGHLIGHT_VARIABLES,
  type ShortcodeHighlightKind,
  type ShortcodePasteRewrite,
  shortcodeIndentFor,
  shortcodePasteRewrite,
} from "@musiccloud/shared";
import { BracketsSquareIcon, DotOutlineIcon, ListNumbersIcon, TextAlignJustifyIcon } from "@phosphor-icons/react";
import * as React from "react";

import { ShortcodeReferencePanel } from "./ShortcodeReferencePanel";

export interface MarkdownEditorProps {
  id?: string;
  value: string;
  onChange: (value: string) => void;
  onPaste?: (event: ClipboardEvent) => void;
  placeholder?: string;
  rows?: number;
  height?: string;
  resizable?: boolean;
  /**
   * Renders the editor "flush": drops the outer rounded border so it can be
   * embedded gaplessly inside a host container (for example a card body that
   * already supplies the border and rounding). The input background, overflow
   * clipping and focus-within ring are kept. Defaults to `false`.
   */
  bare?: boolean;
  /**
   * When set together with {@link MarkdownEditorProps.resizable}, the height the
   * user drags to is persisted to `localStorage` under this key and restored on
   * the next mount. All editors sharing a key share one remembered height.
   * Without a key the resize is session-only (reset on reload).
   */
  storageKey?: string;
  /**
   * Called with an insert-at-cursor function every time this editor gains
   * focus, registering it as the caller's "active insert target" (e.g. for a
   * click-to-insert variables panel). The passed function replaces the current
   * selection with the given text and refocuses the editor; it stays valid
   * while the editor is mounted, even after focus moves elsewhere.
   */
  registerInsert?: (insert: (text: string) => void) => void;
  showHints?: boolean;
  extensions?: unknown[];
  className?: string;
}

const EMPTY_EXTENSIONS: unknown[] = [];
const SHORTCUT_HINTS = [
  { keys: ["⌘", "B"], label: "Bold" },
  { keys: ["⌘", "I"], label: "Italic" },
  { keys: ["⌘", "K"], label: "Link" },
  { keys: ["⌘", "⇧", "D"], label: "Strike" },
] satisfies { keys: string[]; label: string }[];

interface MarkdownCodeMirrorProps {
  value: string;
  onChange: (value: string) => void;
  onPaste?: (event: ClipboardEvent) => void;
  placeholder?: string;
  extensions: unknown[];
  className?: string;
  height?: string;
  minHeight?: string;
  registerInsert?: (insert: (text: string) => void) => void;
  /** Whether the line-number column is shown. */
  lineNumbers?: boolean;
  /** Whether long lines wrap instead of scrolling sideways. */
  lineWrap?: boolean;
  /** Whether spaces and line ends are drawn. */
  whitespace?: boolean;
}

const MarkdownCodeMirror = React.lazy(async () => {
  const [
    { markdown, markdownKeymap },
    { getIndentUnit, HighlightStyle, indentService, syntaxHighlighting },
    { EditorSelection, EditorState, Prec },
    {
      placeholder: cmPlaceholder,
      Decoration,
      drawSelection,
      EditorView,
      highlightWhitespace,
      keymap,
      lineNumbers,
      ViewPlugin,
      WidgetType,
    },
    { tags: t },
    { default: CodeMirror },
  ] = await Promise.all([
    import("@codemirror/lang-markdown"),
    import("@codemirror/language"),
    import("@codemirror/state"),
    import("@codemirror/view"),
    import("@lezer/highlight"),
    import("@uiw/react-codemirror"),
  ]);

  type LoadedEditorView = InstanceType<typeof EditorView>;

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
    // A visible space is drawn as a dot in a background image rather than as
    // text, so the colour is set there. CodeMirror's own is a fixed grey, which
    // reads as a smudge on this surface.
    ".cm-highlightSpace": {
      backgroundImage: "radial-gradient(circle at 50% 55%, var(--ds-text-subtle) 20%, transparent 5%)",
    },
    // The end-of-line mark is quieter still than a space, because there is one
    // on every line and they would otherwise read as a column of their own.
    ".cm-lineEndMark": {
      color: "var(--ds-text-subtle)",
      opacity: "0.5",
      userSelect: "none",
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

  /**
   * What each part of a shortcode looks like.
   *
   * Built from the shared map, because the reference panel beside this editor
   * colours its examples from the same one and an example that read differently
   * from what an author types would teach the wrong thing. Every colour is a
   * token, so the palette itself is decided in the stylesheet where the
   * reasoning behind each role also lives.
   *
   * The class names follow the span kinds, which is what lets the decorations
   * below be derived from a kind rather than listed a second time here.
   */
  const shortcodeTheme = EditorView.theme(
    Object.fromEntries(
      Object.entries(SHORTCODE_HIGHLIGHT_VARIABLES).map(([kind, variable]) => [
        `.cm-shortcode-${kind}`,
        {
          color: `var(${variable})`,
          fontWeight: kind === SHORTCODE_HIGHLIGHT_BOLD_KIND ? "600" : "inherit",
        },
      ]),
    ),
  );

  const shortcodeMarks = new Map<ShortcodeHighlightKind, ReturnType<typeof Decoration.mark>>();

  /**
   * The decoration for one kind of span, built once and reused.
   *
   * Derived from the kind rather than listed, so a new kind needs a rule in the
   * theme above and nothing here. Cached because this runs once per span on
   * every keystroke, and a decoration built fresh each time would also defeat
   * CodeMirror's own comparison of one set against the next.
   *
   * @param kind - What the span is.
   * @returns A mark carrying the class the theme styles.
   */
  function shortcodeMark(kind: ShortcodeHighlightKind) {
    const existing = shortcodeMarks.get(kind);
    if (existing) return existing;

    const mark = Decoration.mark({ class: `cm-shortcode-${kind}` });
    shortcodeMarks.set(kind, mark);
    return mark;
  }

  /**
   * Marks every part of every shortcode in the document.
   *
   * The whole document is scanned rather than the visible lines alone. A
   * shortcode may open on one screen and close three screens later, and a scan
   * that began at the top of the viewport would read the middle of one as if it
   * were the start of a document.
   *
   * @param view - The editor whose document is read.
   * @returns One decoration per span, in the order a decoration set needs.
   */
  function buildShortcodeMarks(view: LoadedEditorView): DecorationSet {
    const content = view.state.doc.toString();
    return Decoration.set(
      highlightShortcodes(content).map((span) => shortcodeMark(span.kind).range(span.from, span.to)),
    );
  }

  /**
   * Colours the shortcodes, rebuilt whenever the document changes.
   *
   * The spans come from the same scanner the page renders with, so the editor
   * cannot colour something the page does not read as a shortcode.
   *
   * At `Prec.highest`, which is what puts these marks inside the Markdown ones
   * rather than around them. Text takes the colour of the innermost span that
   * states one, so the outer set loses. Without it a shortcode indented by four
   * spaces is a Markdown code block and comes out in the code colour, whilst
   * the same shortcode at the margin does not, and the nesting depth would be
   * deciding the colours.
   */
  const highlightShortcodeSyntax = Prec.highest(
    ViewPlugin.fromClass(
      class {
        decorations: DecorationSet;

        constructor(view: LoadedEditorView) {
          this.decorations = buildShortcodeMarks(view);
        }

        update(update: ViewUpdate) {
          if (update.docChanged) this.decorations = buildShortcodeMarks(update.view);
        }
      },
      { decorations: (plugin) => plugin.decorations },
    ),
  );

  /**
   * The mark drawn where a line ends.
   *
   * CodeMirror shows spaces and tabs but not the newline itself, and the
   * newline is what a Markdown author most needs to see: two spaces before one
   * are a hard break, and without an end-of-line mark there is no way to tell a
   * line that carries them from one that does not.
   *
   * The character is the one editors have long used for this, and it is hidden
   * from screen readers, which read the line structure from the document.
   */
  class LineEndWidget extends WidgetType {
    toDOM(): HTMLElement {
      const mark = document.createElement("span");
      mark.className = "cm-lineEndMark";
      mark.textContent = "¬";
      mark.setAttribute("aria-hidden", "true");
      return mark;
    }

    /** Two of these are interchangeable, so the editor may reuse one for another. */
    eq(): boolean {
      return true;
    }
  }

  const lineEndWidget = Decoration.widget({ widget: new LineEndWidget(), side: 1 });

  /**
   * Places an end-of-line mark after every line but the last.
   *
   * @param view - The editor being marked.
   * @returns One widget per visible line.
   */
  function buildLineEndMarks(view: LoadedEditorView): DecorationSet {
    const marks = [];
    for (const { from, to } of view.visibleRanges) {
      let line = view.state.doc.lineAt(from);
      while (line.from <= to) {
        if (line.number < view.state.doc.lines) marks.push(lineEndWidget.range(line.to));
        if (line.to + 1 > view.state.doc.length) break;
        line = view.state.doc.lineAt(line.to + 1);
      }
    }
    return Decoration.set(marks);
  }

  /**
   * Shows where each line ends.
   *
   * Only the visible lines carry a mark, rebuilt as the document or the
   * viewport changes, so a long document costs no more than a short one.
   */
  const highlightLineEnds = ViewPlugin.fromClass(
    class {
      decorations: DecorationSet;

      constructor(view: LoadedEditorView) {
        this.decorations = buildLineEndMarks(view);
      }

      update(update: ViewUpdate) {
        if (update.docChanged || update.viewportChanged) {
          this.decorations = buildLineEndMarks(update.view);
        }
      }
    },
    { decorations: (plugin) => plugin.decorations },
  );

  /**
   * Offers the indentation a line sits at inside the containers above it.
   *
   * Both Return and typing consult this, so a container opens a level, a
   * closing line pulls itself back out, and neither has to be counted by hand.
   *
   * Outside a container it answers `null`, which hands the question back to
   * Markdown's own rules. That is what keeps lists and quotes indenting the way
   * they always have.
   */
  const shortcodeIndent = indentService.of((context, position) => {
    const indent = shortcodeIndentFor(context.state.doc.toString(), position, " ".repeat(getIndentUnit(context.state)));
    return indent === null ? null : indent.length;
  });

  /**
   * Re-indents the line as the closing sequence of a container is typed.
   *
   * Without this the line would keep the indentation of the content above it,
   * and the author would have to remove it themselves the moment they finish
   * writing `}]]`.
   */
  const shortcodeIndentOnInput = markdown().language.data.of({ indentOnInput: /^\s*\}\]\]$/ });

  /**
   * Empties a line the caret has just left behind with nothing but indentation.
   *
   * Automatic indentation puts spaces on a line before anything is written on
   * it. Pressing Return again leaves them there, so a document collects lines
   * that look empty and are not. They travel into the content, they show up in
   * a diff, and Markdown counts four of them as the start of a code block.
   *
   * Only the line the caret left is touched, and only whilst it holds nothing
   * but whitespace, so this never reaches a line somebody is still writing on.
   */
  const clearIndentOnlyLines = EditorState.transactionFilter.of((transaction) => {
    if (!transaction.docChanged) return transaction;

    const wasAt = transaction.startState.selection.main.head;
    const previous = transaction.startState.doc.lineAt(wasAt);
    if (previous.text === "" || previous.text.trim() !== "") return transaction;

    const now = transaction.state.selection.main.head;
    const line = transaction.state.doc.lineAt(now);
    // Still on the same line means the caret has not left it yet.
    if (line.from === previous.from) return transaction;

    // The line may have moved, so it is found again in the new document rather
    // than trusted to still start where it did.
    const moved = transaction.changes.mapPos(previous.from, -1);
    const after = transaction.state.doc.lineAt(moved);
    if (after.text === "" || after.text.trim() !== "") return transaction;

    return [transaction, { changes: { from: after.from, to: after.to, insert: "" } }];
  });

  /**
   * Re-indents a pasted block for the level it lands on.
   *
   * `indentOnInput` covers typing and completion and deliberately not pasting,
   * so a block pasted into a container would otherwise arrive with its first
   * line indented and every following line flat against the margin.
   *
   * The block is rewritten before it is inserted rather than corrected
   * afterwards, so the document never holds the flat version and one undo takes
   * the whole paste back.
   */
  const shortcodeIndentOnPaste = EditorState.transactionFilter.of((transaction) => {
    if (!transaction.docChanged || !transaction.isUserEvent("input.paste")) return transaction;

    const unit = " ".repeat(getIndentUnit(transaction.startState));
    const before = transaction.startState.doc.toString();
    const rewrites: ShortcodePasteRewrite[] = [];

    transaction.changes.iterChanges((fromA, toA, _fromB, _toB, inserted) => {
      // One paste at a time. Pasting into a multiple selection is rare and
      // would need a base level per range, which is more machinery than it
      // earns.
      if (rewrites.length > 0) return;

      const rewrite = shortcodePasteRewrite(before, fromA, toA, inserted.toString(), unit);
      if (rewrite) rewrites.push(rewrite);
    });

    const rewrite = rewrites[0];
    if (!rewrite) return transaction;

    return {
      changes: { from: rewrite.from, to: rewrite.to, insert: rewrite.insert },
      selection: { anchor: rewrite.from + rewrite.insert.length },
      userEvent: "input.paste",
    };
  });

  const mcTheme = [editorTheme, syntaxHighlighting(highlightStyle), shortcodeTheme];

  function wrapSelection(view: LoadedEditorView, before: string, after: string): boolean {
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

  /**
   * Return continues a list, and Backspace steps back out of one.
   *
   * Both come from the Markdown package rather than being written here, so a
   * bullet, a number, a task box and a quote all behave the way they do in
   * every other Markdown editor. Return on an item holding nothing but its
   * marker removes the marker and leaves the list, which is what stops the
   * feature from becoming a trap.
   */
  const markdownStructureKeymap = Prec.high(keymap.of(markdownKeymap));

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

  return {
    default: function LoadedMarkdownCodeMirror({
      value,
      onChange,
      onPaste,
      placeholder,
      extensions: extraExtensions,
      className,
      height,
      minHeight,
      registerInsert,
      lineNumbers: showLineNumbers = true,
      lineWrap = true,
      whitespace = false,
    }: MarkdownCodeMirrorProps) {
      const viewRef = React.useRef<LoadedEditorView | null>(null);
      // Ref indirection keeps the focus-handler extension stable across
      // renders even when the caller passes a fresh `registerInsert` closure.
      const registerInsertRef = React.useRef(registerInsert);
      registerInsertRef.current = registerInsert;

      const insertAtSelection = React.useCallback((text: string) => {
        const view = viewRef.current;
        if (!view) return;
        view.dispatch(view.state.replaceSelection(text));
        view.focus();
      }, []);

      const extensions = React.useMemo(
        () => [
          ...(showLineNumbers ? [lineNumbers()] : []),
          ...(whitespace ? [highlightWhitespace(), highlightLineEnds] : []),
          markdown(),
          highlightShortcodeSyntax,
          shortcodeIndent,
          shortcodeIndentOnInput,
          shortcodeIndentOnPaste,
          clearIndentOnlyLines,
          ...(lineWrap ? [EditorView.lineWrapping] : []),
          drawSelection(),
          mdKeymap,
          // Beneath the four shortcuts above and above the default keymap, so
          // Return continues a list and Backspace steps out of one. Each of
          // these answers `false` outside a Markdown list, and the default
          // binding then runs, which keeps a shortcode body indenting as it did.
          markdownStructureKeymap,
          EditorView.domEventHandlers({
            focus() {
              registerInsertRef.current?.(insertAtSelection);
              return false;
            },
          }),
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
        [onPaste, placeholder, extraExtensions, insertAtSelection, showLineNumbers, lineWrap, whitespace],
      );

      return (
        <CodeMirror
          value={value}
          onChange={(nextValue) => onChange(nextValue)}
          onCreateEditor={(view) => {
            viewRef.current = view;
          }}
          extensions={extensions as React.ComponentProps<typeof CodeMirror>["extensions"]}
          theme={mcTheme}
          className={className}
          height={height}
          minHeight={minHeight}
          basicSetup={{
            lineNumbers: false,
            foldGutter: false,
            highlightActiveLine: false,
            highlightSelectionMatches: false,
            tabSize: 2,
          }}
        />
      );
    },
  };
});

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

/**
 * Remembers a footer switch across pages and reloads.
 *
 * Each switch names the state it starts in, because they do not agree: wrapping
 * and line numbers are how the editor is normally read, whilst showing every
 * space is something to turn on whilst hunting for one.
 */
const WRAP_STORAGE_KEY = "musiccloud.markdown-editor.line-wrap";
const LINE_NUMBERS_STORAGE_KEY = "musiccloud.markdown-editor.line-numbers";
const WHITESPACE_STORAGE_KEY = "musiccloud.markdown-editor.whitespace";

/**
 * Reads a switch back.
 *
 * @param key - Where it is stored.
 * @param whenUnset - What holds before anybody has touched it.
 * @returns Whether the switch is on.
 */
function readStoredSwitch(key: string, whenUnset: boolean): boolean {
  if (typeof window === "undefined") return whenUnset;
  try {
    const stored = window.localStorage.getItem(key);
    if (stored === null) return whenUnset;
    return stored !== "off";
  } catch {
    // Storage is an enhancement; the editor works without it.
    return whenUnset;
  }
}

/**
 * Stores a switch.
 *
 * @param key - Where it goes.
 * @param on - Whether it is on.
 */
function storeSwitch(key: string, on: boolean): void {
  try {
    window.localStorage.setItem(key, on ? "on" : "off");
  } catch {
    // Same as above: worth doing, not worth failing over.
  }
}

function FooterButton({
  onClick,
  pressed,
  title,
  children,
}: {
  onClick: () => void;
  pressed?: boolean;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      aria-label={title}
      aria-pressed={pressed}
      className={`inline-flex items-center gap-1 h-[1.375rem] px-1.5 rounded border text-[0.625rem] leading-none transition-colors ${
        pressed
          ? "border-[var(--ds-border-strong)] bg-[var(--ds-control-active-bg,var(--ds-surface-hover))] text-[var(--ds-text)] font-medium"
          : "border-[var(--ds-border)] bg-[var(--ds-bg-elevated)] text-[var(--ds-text-muted)]"
      }`}
    >
      {children}
    </button>
  );
}

function HintsBar({
  lineWrap,
  onToggleLineWrap,
  lineNumbers: showLineNumbers,
  onToggleLineNumbers,
  whitespace,
  onToggleWhitespace,
}: {
  lineWrap: boolean;
  onToggleLineWrap: () => void;
  lineNumbers: boolean;
  onToggleLineNumbers: () => void;
  whitespace: boolean;
  onToggleWhitespace: () => void;
}) {
  const [helpOpen, setHelpOpen] = React.useState(false);

  return (
    <div className="shrink-0 flex items-center justify-between gap-3 w-full px-2.5 py-1.5 border-t border-[var(--ds-border)] bg-[var(--ds-section-header-bg,var(--ds-bg-elevated))] text-[0.625rem]">
      <div className="hidden min-[420px]:flex items-center gap-2.5">
        {SHORTCUT_HINTS.map((hint) => (
          <Hint key={hint.label} keys={hint.keys} label={hint.label} />
        ))}
      </div>
      <div className="ml-auto flex items-center gap-1.5">
        {/* The state is carried by the surface, the border and the weight of
            the label, not by colour alone. */}
        <FooterButton
          onClick={onToggleLineNumbers}
          pressed={showLineNumbers}
          title={showLineNumbers ? "Hide line numbers" : "Show line numbers"}
        >
          <ListNumbersIcon weight="duotone" aria-hidden className="size-3" />
          Numbers {showLineNumbers ? "on" : "off"}
        </FooterButton>
        <FooterButton
          onClick={onToggleLineWrap}
          pressed={lineWrap}
          title={lineWrap ? "Stop wrapping long lines" : "Wrap long lines"}
        >
          <TextAlignJustifyIcon weight="duotone" aria-hidden className="size-3" />
          Wrap {lineWrap ? "on" : "off"}
        </FooterButton>
        <FooterButton
          onClick={onToggleWhitespace}
          pressed={whitespace}
          title={whitespace ? "Hide spaces and line ends" : "Show spaces and line ends"}
        >
          <DotOutlineIcon weight="duotone" aria-hidden className="size-3" />
          Spaces {whitespace ? "on" : "off"}
        </FooterButton>
        <FooterButton onClick={() => setHelpOpen(true)} title="Look up the shortcodes">
          <BracketsSquareIcon weight="duotone" aria-hidden className="size-3" />
          Shortcodes
        </FooterButton>
      </div>
      <ShortcodeReferencePanel open={helpOpen} onClose={() => setHelpOpen(false)} />
    </div>
  );
}

const EDITOR_HEIGHT_PERSIST_DEBOUNCE_MS = 300;

/**
 * Reads a previously persisted editor height (in pixels) for the given
 * `localStorage` key. Returns `null` when nothing is stored, the value is
 * unusable, or storage is unavailable (for example private mode) — callers then
 * fall back to the `rows`-derived default height.
 */
function readStoredEditorHeight(key: string): number | null {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    const parsed = Number.parseInt(raw, 10);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
  } catch {
    return null;
  }
}

/**
 * Persists the editor's current pixel height under the given `localStorage` key
 * so it can be restored on the next mount. Swallows storage errors: remembering
 * the height is an enhancement, never a requirement for editing.
 */
function persistEditorHeight(key: string, height: number) {
  try {
    localStorage.setItem(key, String(Math.round(height)));
  } catch {
    // Persistence is an enhancement; editor usage must not depend on storage.
  }
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
  bare = false,
  storageKey,
  registerInsert,
  showHints = true,
  extensions: extraExtensions = EMPTY_EXTENSIONS,
  className = "",
}: MarkdownEditorProps) {
  const wrapperRef = React.useRef<HTMLDivElement>(null);
  const [storedHeight] = React.useState<number | null>(() =>
    resizable && storageKey ? readStoredEditorHeight(storageKey) : null,
  );

  // The three footer switches. Each remembers itself, because a reader who
  // turned the numbers off did so for the way they read rather than for one
  // page, and finding them back on next time is the same decision undone.
  const [lineWrap, setLineWrap] = React.useState(() => readStoredSwitch(WRAP_STORAGE_KEY, true));
  const [showLineNumbers, setShowLineNumbers] = React.useState(() => readStoredSwitch(LINE_NUMBERS_STORAGE_KEY, true));
  const [showWhitespace, setShowWhitespace] = React.useState(() => readStoredSwitch(WHITESPACE_STORAGE_KEY, false));

  const toggleLineWrap = React.useCallback(() => {
    setLineWrap((current) => {
      storeSwitch(WRAP_STORAGE_KEY, !current);
      return !current;
    });
  }, []);

  const toggleLineNumbers = React.useCallback(() => {
    setShowLineNumbers((current) => {
      storeSwitch(LINE_NUMBERS_STORAGE_KEY, !current);
      return !current;
    });
  }, []);

  const toggleWhitespace = React.useCallback(() => {
    setShowWhitespace((current) => {
      storeSwitch(WHITESPACE_STORAGE_KEY, !current);
      return !current;
    });
  }, []);

  // The native `resize: vertical` handle changes the wrapper's inline height
  // directly; React never re-applies its own height because the derived value
  // is stable across renders, so the drag survives. A ResizeObserver captures
  // the final height and persists it (debounced to one write per settle) when a
  // `storageKey` is given — otherwise the resize is session-only.
  React.useEffect(() => {
    if (!resizable || !storageKey) return;
    const el = wrapperRef.current;
    if (!el) return;
    let timer: number | undefined;
    const observer = new ResizeObserver(() => {
      window.clearTimeout(timer);
      timer = window.setTimeout(
        () => persistEditorHeight(storageKey, el.offsetHeight),
        EDITOR_HEIGHT_PERSIST_DEBOUNCE_MS,
      );
    });
    observer.observe(el);
    return () => {
      window.clearTimeout(timer);
      observer.disconnect();
    };
  }, [resizable, storageKey]);

  const rowsHeight = `${rows * 1.5}rem`;
  const defaultHeight = resizable && showHints ? `calc(${rowsHeight} + 2.25rem)` : rowsHeight;
  const resizableHeight = storedHeight != null ? `${storedHeight}px` : defaultHeight;

  const wrapperStyle: React.CSSProperties | undefined = resizable
    ? { height: resizableHeight, minHeight: "4.5rem", resize: "vertical", overflow: "hidden" }
    : height
      ? { height }
      : undefined;

  const hasBoundedHeight = resizable || Boolean(height);
  // A bounded editor is a column: the code area takes what is left and scrolls
  // inside itself, and the hints bar keeps its own line under it. Without the
  // column the code area has no height to fill, so it grows with the document
  // and the bound it was given means nothing.
  const isFlexCol = hasBoundedHeight && showHints;
  const editorContainerClassName = hasBoundedHeight ? "h-full min-h-0" : undefined;
  const frameClassName = bare
    ? "bg-[var(--ds-input-bg)]"
    : "rounded-control border border-[var(--ds-border)] bg-[var(--ds-input-bg)]";

  return (
    <div
      id={id}
      ref={wrapperRef}
      className={`${frameClassName} overflow-hidden focus-within:ring-2 focus-within:ring-inset focus-within:ring-[var(--color-primary)] focus-within:outline-none ${isFlexCol ? "flex flex-col" : ""} ${className}`}
      style={wrapperStyle}
    >
      <div className={isFlexCol ? "flex-1 min-h-0 overflow-hidden" : undefined}>
        <React.Suspense fallback={<div className="h-full min-h-24 bg-[var(--ds-bg-elevated)] animate-pulse" />}>
          <MarkdownCodeMirror
            value={value}
            onChange={onChange}
            onPaste={onPaste}
            placeholder={placeholder}
            extensions={extraExtensions}
            className={editorContainerClassName}
            height={resizable ? "100%" : height}
            minHeight={resizable ? undefined : height ? undefined : rowsHeight}
            registerInsert={registerInsert}
            lineNumbers={showLineNumbers}
            lineWrap={lineWrap}
            whitespace={showWhitespace}
          />
        </React.Suspense>
      </div>
      {showHints && (
        <HintsBar
          lineWrap={lineWrap}
          onToggleLineWrap={toggleLineWrap}
          lineNumbers={showLineNumbers}
          onToggleLineNumbers={toggleLineNumbers}
          whitespace={showWhitespace}
          onToggleWhitespace={toggleWhitespace}
        />
      )}
    </div>
  );
}
