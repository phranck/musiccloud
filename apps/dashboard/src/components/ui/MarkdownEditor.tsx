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

type PillTone = "alert" | "info" | "neutral" | "success";

const PILL_HINTS = [
  { notation: "[[pill:REQ tone=alert]]", tone: "alert", pillLabel: "REQ", description: "Required marker." },
  { notation: "[[pill:OPT]]", tone: "neutral", pillLabel: "OPT", description: "Neutral marker, default tone." },
  { notation: "[[pill:Info tone=info]]", tone: "info", pillLabel: "Info", description: "Informational marker." },
  {
    notation: "[[pill:done tone=success case=upper]]",
    tone: "success",
    pillLabel: "DONE",
    description: "Success marker with uppercase output.",
  },
] satisfies {
  notation: string;
  tone: PillTone;
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

const FIELD_BLOCK_EXAMPLES = [
  {
    label: "Dynamic labels",
    code: ":::fields\ngenre: Genre name or Genre1|Genre2 [[pill:REQ tone=alert]]\ntracks: 1-50, default 10 [[pill:OPT]]\ncount: Applies the same amount to tracks, albums, and artists. [[pill:OPT]]\n:::",
    description: "The label column uses the widest label and wraps long descriptions from the second column start.",
  },
  {
    label: "Fixed label width",
    code: ":::fields labelWidth=9ch gap=1.25rem\ngenre: Genre name or Genre1|Genre2 [[pill:REQ tone=alert]]\ntracks: 1-50, default 10 [[pill:OPT]]\n:::",
    description: "labelWidth accepts auto, px, rem, em, or ch. gap controls the spacing between both columns.",
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

function PillPreview({ tone, children }: { tone: PillTone; children: string }) {
  const toneClasses = {
    alert: "bg-[var(--ds-danger-bg)] text-[var(--ds-danger-text)]",
    info: "bg-[var(--ds-bg-elevated)] text-[var(--color-primary)] border border-[var(--ds-border)]",
    neutral: "bg-[var(--ds-bg-elevated)] text-[var(--ds-text-muted)] border border-[var(--ds-border)]",
    success: "bg-[var(--ds-success-bg)] text-[var(--ds-success-text)] border border-[var(--ds-success-border)]",
  } satisfies Record<PillTone, string>;

  return (
    <span
      className={`inline-flex items-center justify-center h-[1.25rem] px-1.5 rounded text-[0.625rem] font-semibold font-mono tracking-wide leading-none select-none ${toneClasses[tone]}`}
    >
      {children}
    </span>
  );
}

function NotationHint({ notation, tone, pillLabel }: { notation: string; tone: PillTone; pillLabel: string }) {
  return (
    <span className="flex items-center gap-1">
      <NotationCode>{notation}</NotationCode>
      <span className="text-[var(--ds-text-subtle)]" aria-hidden>
        →
      </span>
      <PillPreview tone={tone}>{pillLabel}</PillPreview>
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

interface HelpWindowLayout {
  top: number;
  left: number;
  width: number;
  height: number;
}

interface HelpWindowPointerState {
  type: "move" | "resize";
  pointerId: number;
  startX: number;
  startY: number;
  startLayout: HelpWindowLayout;
}

const HELP_WINDOW_STORAGE_KEY = "musiccloud.markdownHelpWindow";
const HELP_WINDOW_DEFAULT_WIDTH = 512;
const HELP_WINDOW_DEFAULT_HEIGHT = 560;
const HELP_WINDOW_MIN_WIDTH = 360;
const HELP_WINDOW_MIN_HEIGHT = 320;
const HELP_WINDOW_MARGIN = 16;
const HELP_WINDOW_SMALL_SCREEN_MIN_WIDTH = 240;
const HELP_WINDOW_SMALL_SCREEN_MIN_HEIGHT = 220;

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

function getHelpWindowBounds() {
  const viewportWidth = window.innerWidth - HELP_WINDOW_MARGIN * 2;
  const viewportHeight = window.innerHeight - HELP_WINDOW_MARGIN * 2;
  const minWidth = Math.min(HELP_WINDOW_MIN_WIDTH, Math.max(HELP_WINDOW_SMALL_SCREEN_MIN_WIDTH, viewportWidth));
  const minHeight = Math.min(HELP_WINDOW_MIN_HEIGHT, Math.max(HELP_WINDOW_SMALL_SCREEN_MIN_HEIGHT, viewportHeight));

  return {
    minWidth,
    minHeight,
    maxWidth: Math.max(minWidth, viewportWidth),
    maxHeight: Math.max(minHeight, viewportHeight),
  };
}

function clampHelpWindowLayout(layout: HelpWindowLayout): HelpWindowLayout {
  const bounds = getHelpWindowBounds();
  const width = clamp(layout.width, bounds.minWidth, bounds.maxWidth);
  const height = clamp(layout.height, bounds.minHeight, bounds.maxHeight);
  const maxLeft = Math.max(HELP_WINDOW_MARGIN, window.innerWidth - width - HELP_WINDOW_MARGIN);
  const maxTop = Math.max(HELP_WINDOW_MARGIN, window.innerHeight - height - HELP_WINDOW_MARGIN);

  return {
    top: clamp(layout.top, HELP_WINDOW_MARGIN, maxTop),
    left: clamp(layout.left, HELP_WINDOW_MARGIN, maxLeft),
    width,
    height,
  };
}

function getCenteredHelpWindowLayout(): HelpWindowLayout {
  const bounds = getHelpWindowBounds();
  const width = Math.min(HELP_WINDOW_DEFAULT_WIDTH, bounds.maxWidth);
  const height = Math.min(HELP_WINDOW_DEFAULT_HEIGHT, bounds.maxHeight);

  return clampHelpWindowLayout({
    top: (window.innerHeight - height) / 2,
    left: (window.innerWidth - width) / 2,
    width,
    height,
  });
}

function isStoredHelpWindowLayout(value: unknown): value is HelpWindowLayout {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<Record<keyof HelpWindowLayout, unknown>>;
  return (
    typeof candidate.top === "number" &&
    typeof candidate.left === "number" &&
    typeof candidate.width === "number" &&
    typeof candidate.height === "number"
  );
}

function readStoredHelpWindowLayout(): HelpWindowLayout | null {
  try {
    const raw = localStorage.getItem(HELP_WINDOW_STORAGE_KEY);
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    return isStoredHelpWindowLayout(parsed) ? clampHelpWindowLayout(parsed) : null;
  } catch {
    return null;
  }
}

function persistHelpWindowLayout(layout: HelpWindowLayout) {
  try {
    localStorage.setItem(HELP_WINDOW_STORAGE_KEY, JSON.stringify(layout));
  } catch {
    // Persistence is an enhancement; editor usage must not depend on storage availability.
  }
}

function MarkdownHelpWindow({ open, id, onClose }: { open: boolean; id: string; onClose: () => void }) {
  const interactionRef = React.useRef<HelpWindowPointerState | null>(null);
  const layoutRef = React.useRef<HelpWindowLayout | null>(null);
  const [layout, setLayout] = React.useState<HelpWindowLayout | null>(null);
  const closeHelp = React.useEffectEvent(onClose);

  const applyLayout = React.useCallback((next: HelpWindowLayout) => {
    const clamped = clampHelpWindowLayout(next);
    layoutRef.current = clamped;
    setLayout(clamped);
  }, []);
  const applyLayoutFromEvent = React.useEffectEvent(applyLayout);

  React.useEffect(() => {
    if (!open) return;

    applyLayout(readStoredHelpWindowLayout() ?? getCenteredHelpWindowLayout());
  }, [applyLayout, open]);

  React.useEffect(() => {
    if (!open) return;

    const onResize = () => {
      applyLayoutFromEvent(layoutRef.current ?? getCenteredHelpWindowLayout());
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

  const startInteraction = React.useCallback(
    (type: HelpWindowPointerState["type"], event: React.PointerEvent<HTMLElement>) => {
      if (event.button !== 0 || !layout) return;
      event.preventDefault();
      event.stopPropagation();
      event.currentTarget.setPointerCapture(event.pointerId);
      interactionRef.current = {
        type,
        pointerId: event.pointerId,
        startX: event.clientX,
        startY: event.clientY,
        startLayout: layoutRef.current ?? layout,
      };
    },
    [layout],
  );

  const updateInteraction = React.useCallback(
    (event: React.PointerEvent<HTMLElement>) => {
      const state = interactionRef.current;
      if (!state || state.pointerId !== event.pointerId) return;
      event.preventDefault();

      const deltaX = event.clientX - state.startX;
      const deltaY = event.clientY - state.startY;
      const next =
        state.type === "move"
          ? {
              ...state.startLayout,
              top: state.startLayout.top + deltaY,
              left: state.startLayout.left + deltaX,
            }
          : {
              ...state.startLayout,
              width: state.startLayout.width + deltaX,
              height: state.startLayout.height + deltaY,
            };

      applyLayout(next);
    },
    [applyLayout],
  );

  const stopInteraction = React.useCallback((event: React.PointerEvent<HTMLElement>) => {
    if (interactionRef.current?.pointerId === event.pointerId) {
      interactionRef.current = null;
      if (event.currentTarget.hasPointerCapture(event.pointerId)) {
        event.currentTarget.releasePointerCapture(event.pointerId);
      }
      if (layoutRef.current) persistHelpWindowLayout(layoutRef.current);
    }
  }, []);

  const startMove = React.useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      startInteraction("move", event);
    },
    [startInteraction],
  );

  const startResize = React.useCallback(
    (event: React.PointerEvent<HTMLButtonElement>) => {
      startInteraction("resize", event);
    },
    [startInteraction],
  );

  if (!open || !layout) return null;

  return createPortal(
    <div
      id={id}
      role="dialog"
      aria-labelledby={`${id}-title`}
      className="fixed z-50 flex flex-col overflow-hidden rounded-control border border-[var(--ds-border)] bg-[var(--ds-bg-elevated)] shadow-2xl shadow-black/30"
      style={{ top: layout.top, left: layout.left, width: layout.width, height: layout.height }}
    >
      <div
        className="flex cursor-move touch-none select-none items-start justify-between gap-3 border-b border-[var(--ds-border)] bg-[var(--ds-surface-inset)] px-4 py-3"
        onPointerDown={startMove}
        onPointerMove={updateInteraction}
        onPointerUp={stopInteraction}
        onPointerCancel={stopInteraction}
      >
        <div>
          <h3 id={`${id}-title`} className="text-sm font-semibold text-[var(--ds-text)]">
            Markdown help
          </h3>
          <p className="mt-1 text-xs leading-snug text-[var(--ds-text-muted)]">
            Shortcuts, code fences, field blocks, card modifiers, syntax highlighting, pills, and keyboard hints.
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
      <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-4">
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

        <HelpSection title="Field blocks">
          <div className="space-y-2">
            {FIELD_BLOCK_EXAMPLES.map((example) => (
              <HelpExample key={example.label} {...example} />
            ))}
          </div>
        </HelpSection>

        <HelpSection title="Inline helpers">
          <div className="space-y-2">
            {PILL_HINTS.map((hint) => (
              <div key={hint.notation} className="flex flex-wrap items-center gap-x-2 gap-y-1">
                <NotationHint notation={hint.notation} tone={hint.tone} pillLabel={hint.pillLabel} />
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
      <button
        type="button"
        aria-label="Resize Markdown help"
        title="Resize Markdown help"
        className="absolute bottom-1 right-1 flex size-5 cursor-nwse-resize touch-none items-end justify-end rounded-[2px] p-1 text-[var(--ds-text-subtle)] opacity-70 transition-opacity hover:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--color-primary)]"
        onPointerDown={startResize}
        onPointerMove={updateInteraction}
        onPointerUp={stopInteraction}
        onPointerCancel={stopInteraction}
      >
        <span
          aria-hidden
          className="block size-3 bg-[linear-gradient(135deg,transparent_0_42%,currentColor_42%_49%,transparent_49%_58%,currentColor_58%_65%,transparent_65%_100%)]"
        />
      </button>
    </div>,
    document.body,
  );
}

const SHORTCUT_HINTS_MIN_WIDTH = 420;

function HintsBar() {
  const ref = React.useRef<HTMLDivElement>(null);
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
      <MarkdownHelpWindow open={helpOpen} id={helpId} onClose={() => setHelpOpen(false)} />
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
