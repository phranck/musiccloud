import { markdown } from "@codemirror/lang-markdown";
import { HighlightStyle, syntaxHighlighting } from "@codemirror/language";
import { EditorSelection, type Extension, Prec } from "@codemirror/state";
import { placeholder as cmPlaceholder, drawSelection, EditorView, keymap } from "@codemirror/view";
import { tags as t } from "@lezer/highlight";
import { InfoIcon, X as XIcon } from "@phosphor-icons/react";
import CodeMirror from "@uiw/react-codemirror";
import * as React from "react";
import { createPortal } from "react-dom";

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
const SHORTCUT_HINTS = [
  { keys: ["⌘", "B"], label: "Bold" },
  { keys: ["⌘", "I"], label: "Italic" },
  { keys: ["⌘", "K"], label: "Link" },
  { keys: ["⌘", "⇧", "D"], label: "Strike" },
] satisfies { keys: string[]; label: string }[];

const BADGE_HINTS = [
  { notation: "[[REQ]]", variant: "req", pillLabel: "REQ", description: "Short required marker." },
  { notation: "[[REQUIRED]]", variant: "req", pillLabel: "REQUIRED", description: "Full required marker." },
  { notation: "[[OPT]]", variant: "opt", pillLabel: "OPT", description: "Optional marker." },
] satisfies {
  notation: string;
  variant: "req" | "opt";
  pillLabel: string;
  description: string;
}[];

const CODE_FENCE_EXAMPLES = [
  {
    label: "Default code block",
    code: "```js\nconst value = 1;\n```",
    description: "Renders as a recessed card with syntax highlighting.",
  },
  {
    label: "Explicit recessed / embossed",
    code: "```js recessed\nconst value = 1;\n```\n\n```js embossed\nconst value = 1;\n```",
    description: "Use the modifier after the language to choose the card surface.",
  },
  {
    label: "Custom spacing",
    code: "```js recessed padding=1rem radius=12px\nconst value = 1;\n```",
    description: "padding= and radius= override the default 0.75rem card geometry.",
  },
  {
    label: "Plain text comments",
    code: "```text\n# comment\n// note\nplain line\n```",
    description: "# and // at the start of a text line render as muted italic comments.",
  },
  {
    label: "musiccloud query",
    code: "```mc-query\ngenre: jazz | soul\ntracks: 20\n# internal note\n```",
    description: "Highlights query keys, numbers, |, ?, and # / // comments.",
  },
] satisfies { label: string; code: string; description: string }[];

const HIGHLIGHT_LANGUAGES = ["js", "ts", "jsx", "tsx", "python", "swift", "bash", "json", "css", "html", "mc-query"];

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

function NotationCode({ children }: { children: string }) {
  return (
    <code className="inline-flex items-center justify-center h-[1.25rem] px-1 rounded border border-[var(--ds-border-strong)] bg-[var(--ds-bg-elevated)] text-[var(--ds-text-muted)] text-[0.625rem] font-medium font-mono shadow-[0_1px_0_var(--ds-border)] leading-none select-none">
      {children}
    </code>
  );
}

function PillPreview({ variant, children }: { variant: "req" | "opt"; children: string }) {
  const variantClasses =
    variant === "req"
      ? "bg-[var(--ds-danger-bg)] text-[var(--ds-danger-text)]"
      : "bg-[var(--ds-bg-elevated)] text-[var(--ds-text-muted)] border border-[var(--ds-border)]";
  return (
    <span
      className={`inline-flex items-center justify-center h-[1.25rem] px-1.5 rounded text-[0.625rem] font-semibold font-mono uppercase tracking-wider leading-none select-none ${variantClasses}`}
    >
      {children}
    </span>
  );
}

function NotationHint({
  notation,
  variant,
  pillLabel,
}: {
  notation: string;
  variant: "req" | "opt";
  pillLabel: string;
}) {
  return (
    <span className="flex items-center gap-1">
      <NotationCode>{notation}</NotationCode>
      <span className="text-[var(--ds-text-subtle)]" aria-hidden>
        →
      </span>
      <PillPreview variant={variant}>{pillLabel}</PillPreview>
    </span>
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

function HelpSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-2">
      <h4 className="text-[0.6875rem] font-semibold uppercase tracking-wide text-[var(--ds-text)]">{title}</h4>
      {children}
    </section>
  );
}

function HelpExample({ label, code, description }: { label: string; code: string; description: string }) {
  return (
    <article className="rounded-control border border-[var(--ds-border)] bg-[var(--ds-surface)] p-2.5">
      <div className="mb-1.5 flex items-center justify-between gap-2">
        <h5 className="text-xs font-medium text-[var(--ds-text)]">{label}</h5>
      </div>
      <pre className="overflow-x-auto rounded bg-[var(--ds-input-bg)] px-2 py-1.5 text-[0.6875rem] leading-relaxed text-[var(--ds-text)]">
        <code>{code}</code>
      </pre>
      <p className="mt-1.5 text-[0.6875rem] leading-snug text-[var(--ds-text-muted)]">{description}</p>
    </article>
  );
}

interface HelpWindowPosition {
  top: number;
  left: number;
  maxHeight: number;
}

interface DragState {
  pointerId: number;
  startX: number;
  startY: number;
  startLeft: number;
  startTop: number;
}

const HELP_WINDOW_WIDTH = 512;
const HELP_WINDOW_MARGIN = 16;
const HELP_WINDOW_GAP = 8;

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

function getHelpWindowMaxHeight(): number {
  return Math.max(220, window.innerHeight - HELP_WINDOW_MARGIN * 2);
}

function clampHelpWindowPosition(position: HelpWindowPosition, panel?: HTMLDivElement | null): HelpWindowPosition {
  const width = panel?.offsetWidth ?? Math.min(HELP_WINDOW_WIDTH, window.innerWidth - HELP_WINDOW_MARGIN * 2);
  const height = panel?.offsetHeight ?? Math.min(520, getHelpWindowMaxHeight());
  const maxLeft = Math.max(HELP_WINDOW_MARGIN, window.innerWidth - width - HELP_WINDOW_MARGIN);
  const maxTop = Math.max(HELP_WINDOW_MARGIN, window.innerHeight - height - HELP_WINDOW_MARGIN);

  return {
    top: clamp(position.top, HELP_WINDOW_MARGIN, maxTop),
    left: clamp(position.left, HELP_WINDOW_MARGIN, maxLeft),
    maxHeight: getHelpWindowMaxHeight(),
  };
}

function getInitialHelpWindowPosition(anchor: HTMLButtonElement): HelpWindowPosition {
  const rect = anchor.getBoundingClientRect();
  const width = Math.min(HELP_WINDOW_WIDTH, window.innerWidth - HELP_WINDOW_MARGIN * 2);
  const maxHeight = getHelpWindowMaxHeight();
  const preferredTop = rect.bottom + HELP_WINDOW_GAP;
  const top =
    preferredTop + Math.min(520, maxHeight) <= window.innerHeight - HELP_WINDOW_MARGIN
      ? preferredTop
      : rect.top - Math.min(520, maxHeight) - HELP_WINDOW_GAP;

  return clampHelpWindowPosition({
    top,
    left: rect.right - width,
    maxHeight,
  });
}

function MarkdownHelpWindow({
  open,
  anchorRef,
  id,
  onClose,
}: {
  open: boolean;
  anchorRef: React.RefObject<HTMLButtonElement | null>;
  id: string;
  onClose: () => void;
}) {
  const panelRef = React.useRef<HTMLDivElement>(null);
  const dragRef = React.useRef<DragState | null>(null);
  const [position, setPosition] = React.useState<HelpWindowPosition | null>(null);
  const closeHelp = React.useEffectEvent(onClose);

  React.useEffect(() => {
    if (!open) return;

    const anchor = anchorRef.current;
    if (anchor) setPosition(getInitialHelpWindowPosition(anchor));
  }, [anchorRef, open]);

  React.useEffect(() => {
    if (!open) return;

    const onResize = () => {
      setPosition((current) => (current ? clampHelpWindowPosition(current, panelRef.current) : current));
    };

    window.addEventListener("resize", onResize);
    return () => {
      window.removeEventListener("resize", onResize);
    };
  }, [open]);

  React.useEffect(() => {
    if (!open) return;

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") closeHelp();
    };

    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  const startDrag = React.useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      if (event.button !== 0 || !position) return;
      event.currentTarget.setPointerCapture(event.pointerId);
      dragRef.current = {
        pointerId: event.pointerId,
        startX: event.clientX,
        startY: event.clientY,
        startLeft: position.left,
        startTop: position.top,
      };
    },
    [position],
  );

  const drag = React.useCallback((event: React.PointerEvent<HTMLDivElement>) => {
    const state = dragRef.current;
    if (!state || state.pointerId !== event.pointerId) return;
    const next = {
      top: state.startTop + event.clientY - state.startY,
      left: state.startLeft + event.clientX - state.startX,
      maxHeight: getHelpWindowMaxHeight(),
    };
    setPosition(clampHelpWindowPosition(next, panelRef.current));
  }, []);

  const stopDrag = React.useCallback((event: React.PointerEvent<HTMLDivElement>) => {
    if (dragRef.current?.pointerId === event.pointerId) {
      dragRef.current = null;
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  }, []);

  if (!open || !position) return null;

  return createPortal(
    <div
      ref={panelRef}
      id={id}
      role="dialog"
      aria-labelledby={`${id}-title`}
      className="fixed z-50 flex w-[min(32rem,calc(100vw-2rem))] flex-col overflow-hidden rounded-control border border-[var(--ds-border)] bg-[var(--ds-bg-elevated)] shadow-2xl shadow-black/30"
      style={{ top: position.top, left: position.left, maxHeight: position.maxHeight }}
    >
      <div
        className="flex cursor-move select-none items-start justify-between gap-3 border-b border-[var(--ds-border)] bg-[var(--ds-surface-inset)] px-4 py-3"
        onPointerDown={startDrag}
        onPointerMove={drag}
        onPointerUp={stopDrag}
        onPointerCancel={stopDrag}
      >
        <div>
          <h3 id={`${id}-title`} className="text-sm font-semibold text-[var(--ds-text)]">
            Markdown help
          </h3>
          <p className="mt-1 text-xs leading-snug text-[var(--ds-text-muted)]">
            Shortcuts, code fences, card modifiers, syntax highlighting, badges, and keyboard hints.
          </p>
        </div>
        <button
          type="button"
          title="Close Markdown help"
          onClick={onClose}
          onPointerDown={(event) => event.stopPropagation()}
          className="inline-flex size-6 shrink-0 items-center justify-center rounded-control border border-[var(--ds-border)] text-[var(--ds-text-muted)] transition-colors hover:border-[var(--ds-border-strong)] hover:text-[var(--ds-text)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--color-primary)]"
        >
          <XIcon className="size-3.5" />
        </button>
      </div>
      <div className="min-h-0 space-y-4 overflow-y-auto p-4">
        <HelpSection title="Shortcuts">
          <div className="grid grid-cols-2 gap-2">
            {SHORTCUT_HINTS.map((hint) => (
              <Hint key={hint.label} keys={hint.keys} label={hint.label} />
            ))}
          </div>
        </HelpSection>

        <HelpSection title="Code fences">
          <div className="space-y-2">
            {CODE_FENCE_EXAMPLES.map((example) => (
              <HelpExample key={example.label} {...example} />
            ))}
          </div>
          <div className="flex flex-wrap gap-1.5">
            {HIGHLIGHT_LANGUAGES.map((lang) => (
              <NotationCode key={lang}>{lang}</NotationCode>
            ))}
          </div>
        </HelpSection>

        <HelpSection title="Inline helpers">
          <div className="space-y-2">
            {BADGE_HINTS.map((hint) => (
              <div key={hint.notation} className="flex flex-wrap items-center gap-x-2 gap-y-1">
                <NotationHint notation={hint.notation} variant={hint.variant} pillLabel={hint.pillLabel} />
                <span className="text-[0.6875rem] text-[var(--ds-text-muted)]">{hint.description}</span>
              </div>
            ))}
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
              <NotationCode>{"{{Esc}}"}</NotationCode>
              <span className="text-[var(--ds-text-subtle)]" aria-hidden>
                →
              </span>
              <Key>Esc</Key>
              <span className="text-[0.6875rem] text-[var(--ds-text-muted)]">
                Keyboard-style hints, for example {"{{Cmd+K}}"}.
              </span>
            </div>
          </div>
        </HelpSection>
      </div>
    </div>,
    document.body,
  );
}

const SHORTCUT_HINTS_MIN_WIDTH = 420;

function HintsBar() {
  const ref = React.useRef<HTMLDivElement>(null);
  const infoButtonRef = React.useRef<HTMLButtonElement>(null);
  const helpId = React.useId();
  const [showShortcuts, setShowShortcuts] = React.useState(true);
  const [helpOpen, setHelpOpen] = React.useState(false);

  React.useEffect(() => {
    const el = ref.current?.parentElement;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => {
      setShowShortcuts(entry.contentRect.width >= SHORTCUT_HINTS_MIN_WIDTH);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  return (
    <div
      ref={ref}
      className="flex items-center justify-between gap-3 px-2.5 py-1.5 border-t border-[var(--ds-border)] bg-[var(--ds-section-header-bg,var(--ds-bg-elevated))] text-[0.625rem]"
    >
      <div className={showShortcuts ? "flex items-center gap-2.5" : "hidden"}>
        {SHORTCUT_HINTS.map((hint) => (
          <Hint key={hint.label} keys={hint.keys} label={hint.label} />
        ))}
      </div>
      <button
        ref={infoButtonRef}
        type="button"
        aria-controls={helpId}
        aria-expanded={helpOpen}
        aria-haspopup="dialog"
        title="Markdown help"
        onClick={() => setHelpOpen((open) => !open)}
        className="ml-auto inline-flex size-6 shrink-0 items-center justify-center rounded-control border border-[var(--ds-border)] text-[var(--ds-text-muted)] transition-colors hover:border-[var(--ds-border-strong)] hover:text-[var(--ds-text)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--color-primary)]"
      >
        <InfoIcon weight="duotone" className="size-3.5" />
      </button>
      <MarkdownHelpWindow open={helpOpen} anchorRef={infoButtonRef} id={helpId} onClose={() => setHelpOpen(false)} />
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
      className={`rounded-control border border-[var(--ds-border)] bg-[var(--ds-input-bg)] overflow-hidden focus-within:ring-2 focus-within:ring-inset focus-within:ring-[var(--color-primary)] focus-within:outline-none ${isFlexCol ? "flex flex-col" : ""} ${className}`}
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
