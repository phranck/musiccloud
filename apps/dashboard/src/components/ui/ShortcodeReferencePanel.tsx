/**
 * @file The editor's shortcode reference, as a panel rather than a dialog.
 *
 * It deliberately does not block the editor. Nothing is dimmed behind it, focus
 * is left where it was, and the writer keeps typing whilst reading. That is the
 * difference between help and an interruption.
 *
 * It is rendered into the document rather than into the editor, because the
 * editor clips its own overflow and would cut the panel off.
 */

import { SHORTCODE_DEFINITIONS } from "@musiccloud/shared";
import { X as XIcon } from "@phosphor-icons/react";
import * as React from "react";
import { createPortal } from "react-dom";

import { CodeFenceReference, ShortcodeEntry, SiteVariableList } from "./ShortcodeReference";
import "./ShortcodeReferencePanel.css";

/** Where the panel sits and how large it is. */
interface HelpFrame {
  x: number;
  y: number;
  width: number;
  height: number;
}

const FRAME_STORAGE_KEY = "musiccloud.markdown-help.frame";

/**
 * The smallest the panel may be.
 *
 * Wide enough that the list keeps its column and the description beside it
 * stays readable rather than wrapping every second word.
 */
const MIN_WIDTH = 520;
const MIN_HEIGHT = 260;

/** The edges and corners the panel can be resized from. */
const RESIZE_EDGES = ["n", "s", "e", "w", "nw", "ne", "sw", "se"] as const;

/** One of the edges in {@link RESIZE_EDGES}. */
type ResizeEdge = (typeof RESIZE_EDGES)[number];

const DEFAULT_WIDTH = 760;
const DEFAULT_HEIGHT = 560;
const VIEWPORT_MARGIN = 16;

/** Which entry the right column describes. */
/** What the panel is currently describing. */
const HelpSelectionKind = {
  Shortcode: "Shortcode",
  Variables: "Variables",
  CodeFences: "CodeFences",
} as const;

type HelpSelection =
  | { kind: typeof HelpSelectionKind.Shortcode; token: string }
  | { kind: typeof HelpSelectionKind.Variables }
  | { kind: typeof HelpSelectionKind.CodeFences };

/**
 * Keeps a frame inside the window, so a stored position can never hide it.
 *
 * @param frame - Where the panel wants to be.
 * @returns The nearest frame that is fully on screen.
 */
function clampToViewport(frame: HelpFrame): HelpFrame {
  const maxWidth = window.innerWidth - VIEWPORT_MARGIN * 2;
  const maxHeight = window.innerHeight - VIEWPORT_MARGIN * 2;
  const width = Math.min(Math.max(frame.width, MIN_WIDTH), Math.max(maxWidth, MIN_WIDTH));
  const height = Math.min(Math.max(frame.height, MIN_HEIGHT), Math.max(maxHeight, MIN_HEIGHT));

  return {
    width,
    height,
    x: Math.min(Math.max(frame.x, VIEWPORT_MARGIN), window.innerWidth - width - VIEWPORT_MARGIN),
    y: Math.min(Math.max(frame.y, VIEWPORT_MARGIN), window.innerHeight - height - VIEWPORT_MARGIN),
  };
}

/**
 * Reads the stored frame, or centres a default one where there is none.
 *
 * @returns A frame that is on screen.
 */
function readFrame(): HelpFrame {
  const centred: HelpFrame = {
    width: DEFAULT_WIDTH,
    height: DEFAULT_HEIGHT,
    x: Math.round((window.innerWidth - DEFAULT_WIDTH) / 2),
    y: Math.round((window.innerHeight - DEFAULT_HEIGHT) / 2),
  };

  try {
    const raw = window.localStorage.getItem(FRAME_STORAGE_KEY);
    if (!raw) return clampToViewport(centred);
    const parsed = JSON.parse(raw) as Partial<HelpFrame>;
    if (
      typeof parsed.x !== "number" ||
      typeof parsed.y !== "number" ||
      typeof parsed.width !== "number" ||
      typeof parsed.height !== "number"
    ) {
      return clampToViewport(centred);
    }
    return clampToViewport(parsed as HelpFrame);
  } catch {
    // A corrupt entry is a reason to start over, not to fail.
    return clampToViewport(centred);
  }
}

/**
 * Writes a frame onto the element. The only place that touches its geometry.
 *
 * @param panel - The panel element.
 * @param frame - Where it goes.
 */
function applyFrame(panel: HTMLElement, frame: HelpFrame): void {
  panel.style.setProperty("--mc-help-x", `${frame.x}px`);
  panel.style.setProperty("--mc-help-y", `${frame.y}px`);
  panel.style.width = `${frame.width}px`;
  panel.style.height = `${frame.height}px`;
}

/**
 * Stores a frame.
 *
 * @param frame - Where the panel was left.
 */
function writeFrame(frame: HelpFrame): void {
  try {
    window.localStorage.setItem(FRAME_STORAGE_KEY, JSON.stringify(frame));
  } catch {
    // Remembering the position is an enhancement, not a requirement.
  }
}

function ShortcodeList({
  selected,
  onSelect,
}: {
  selected: HelpSelection;
  onSelect: (selection: HelpSelection) => void;
}) {
  return (
    <nav className="mc-help-nav" aria-label="Shortcodes and variables">
      {SHORTCODE_DEFINITIONS.map((definition) => {
        const current = selected.kind === HelpSelectionKind.Shortcode && selected.token === definition.token;
        return (
          <button
            key={`${definition.syntax}:${definition.token}`}
            type="button"
            onClick={() => onSelect({ kind: HelpSelectionKind.Shortcode, token: definition.token })}
            data-current={current ? "true" : undefined}
            aria-current={current ? "true" : undefined}
            className="mc-help-nav-item"
          >
            <span className="font-mono">[[{definition.token}]]</span>
            <span className="mc-help-nav-label">{definition.label}</span>
          </button>
        );
      })}

      {/* One entry rather than one per variable. A variable is a single line,
          so the column beside this one can show them all at once. */}
      <p className="mc-help-nav-group">More</p>

      <button
        type="button"
        onClick={() => onSelect({ kind: HelpSelectionKind.Variables })}
        data-current={selected.kind === HelpSelectionKind.Variables ? "true" : undefined}
        aria-current={selected.kind === HelpSelectionKind.Variables ? "true" : undefined}
        className="mc-help-nav-item"
      >
        <span className="font-mono">{"{variables}"}</span>
        <span className="mc-help-nav-label">Figures the system holds</span>
      </button>

      {/* Not a shortcode: a fenced code block is Markdown's own syntax with our
          modifiers on it. It belongs here because it is one more thing a writer
          types, and nowhere near the registry because the tokenizer never
          scans it. */}
      <button
        type="button"
        onClick={() => onSelect({ kind: HelpSelectionKind.CodeFences })}
        data-current={selected.kind === HelpSelectionKind.CodeFences ? "true" : undefined}
        aria-current={selected.kind === HelpSelectionKind.CodeFences ? "true" : undefined}
        className="mc-help-nav-item"
      >
        <span className="font-mono">```code```</span>
        <span className="mc-help-nav-label">Code blocks and their surfaces</span>
      </button>
    </nav>
  );
}

/**
 * The reference panel.
 *
 * @param props.open - Whether the panel is shown.
 * @param props.onClose - Called when the reader dismisses it.
 * @returns The panel, rendered into the document body.
 */
export function ShortcodeReferencePanel({ open, onClose }: { open: boolean; onClose: () => void }) {
  const panelRef = React.useRef<HTMLElement | null>(null);
  const frameRef = React.useRef<HelpFrame | null>(null);

  // Which shortcode the right column describes. It survives a close and reopen,
  // so somebody who was reading about one finds it again.
  const [selected, setSelected] = React.useState<HelpSelection>({
    kind: HelpSelectionKind.Shortcode,
    token: SHORTCODE_DEFINITIONS[0]?.token ?? "",
  });
  const shownDefinition =
    selected.kind === HelpSelectionKind.Shortcode
      ? (SHORTCODE_DEFINITIONS.find((definition) => definition.token === selected.token) ?? SHORTCODE_DEFINITIONS[0])
      : null;

  // Places the panel on open, from storage or centred.
  React.useEffect(() => {
    if (!open) return;
    const panel = panelRef.current;
    if (!panel) return;

    const frame = readFrame();
    frameRef.current = frame;
    applyFrame(panel, frame);
  }, [open]);

  // Held in a ref so the listener is bound once per open rather than rebound
  // whenever the caller passes a new closure.
  const onCloseRef = React.useRef(onClose);
  onCloseRef.current = onClose;

  React.useEffect(() => {
    if (!open) return;

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") onCloseRef.current();
    }

    // Listening on the document rather than trapping focus, so the editor keeps
    // every other key.
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [open]);

  /**
   * Drags the panel by its header.
   *
   * The offset is written straight onto the element during the move rather than
   * through React state, because a pointer move happens once per frame and a
   * render per frame is exactly what makes a drag feel heavy. State is not
   * involved at all; the frame is committed to storage when the pointer lifts.
   *
   * @param event - The press that starts the drag.
   */
  function startDrag(event: React.PointerEvent<HTMLElement>) {
    if (event.button !== 0) return;
    if ((event.target as HTMLElement).closest("button")) return;

    const panel: HTMLElement | null = panelRef.current;
    const frame: HelpFrame | null = frameRef.current;
    if (panel === null || frame === null) return;
    // Bound to constants the closures below can see as non-null; a check inside
    // an event handler runs long after this one did.
    const element = panel;
    const origin = frame;

    // Stops the browser anchoring a text selection on the press. Without it the
    // selection runs across whatever sits behind the panel as the pointer moves.
    event.preventDefault();

    const startX = event.clientX;
    const startY = event.clientY;
    const originX = origin.x;
    const originY = origin.y;

    element.dataset.dragging = "true";
    document.documentElement.classList.add("mc-help-dragging");
    event.currentTarget.setPointerCapture(event.pointerId);

    function onMove(moveEvent: PointerEvent) {
      const next = clampToViewport({
        ...origin,
        x: originX + moveEvent.clientX - startX,
        y: originY + moveEvent.clientY - startY,
      });
      frameRef.current = next;
      applyFrame(element, next);
    }

    function onUp() {
      element.removeAttribute("data-dragging");
      document.documentElement.classList.remove("mc-help-dragging");
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      if (frameRef.current) writeFrame(frameRef.current);
    }

    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
  }

  /**
   * Resizes the panel from one of its edges or corners.
   *
   * Pulling a north or west edge changes the position as well as the size, so
   * the opposite edge stays where it is. The minimum sizes are enforced here
   * rather than in the stylesheet, so the position cannot run past them either.
   *
   * @param event - The press that starts the resize.
   * @param edge - Which edge or corner was taken hold of.
   */
  function startResize(event: React.PointerEvent<HTMLElement>, edge: ResizeEdge) {
    if (event.button !== 0) return;

    const panel: HTMLElement | null = panelRef.current;
    const start: HelpFrame | null = frameRef.current;
    if (panel === null || start === null) return;
    const element = panel;
    const origin = start;

    event.preventDefault();
    event.stopPropagation();

    const startX = event.clientX;
    const startY = event.clientY;

    element.dataset.dragging = "true";
    document.documentElement.classList.add("mc-help-dragging");
    event.currentTarget.setPointerCapture(event.pointerId);

    function onMove(moveEvent: PointerEvent) {
      const deltaX = moveEvent.clientX - startX;
      const deltaY = moveEvent.clientY - startY;
      const next: HelpFrame = { ...origin };

      if (edge.includes("e")) next.width = Math.max(MIN_WIDTH, origin.width + deltaX);
      if (edge.includes("s")) next.height = Math.max(MIN_HEIGHT, origin.height + deltaY);
      if (edge.includes("w")) {
        next.width = Math.max(MIN_WIDTH, origin.width - deltaX);
        next.x = origin.x + (origin.width - next.width);
      }
      if (edge.includes("n")) {
        next.height = Math.max(MIN_HEIGHT, origin.height - deltaY);
        next.y = origin.y + (origin.height - next.height);
      }

      const clamped = clampToViewport(next);
      frameRef.current = clamped;
      applyFrame(element, clamped);
    }

    function onUp() {
      element.removeAttribute("data-dragging");
      document.documentElement.classList.remove("mc-help-dragging");
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      if (frameRef.current) writeFrame(frameRef.current);
    }

    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
  }

  if (!open || typeof document === "undefined") return null;

  return createPortal(
    <aside aria-label="Shortcodes" className="mc-help-panel" ref={panelRef}>
      {/* The header is the drag handle, which is why the cursor changes on it. */}
      <header className="mc-help-header" onPointerDown={startDrag}>
        <h2 className="text-[0.875rem] font-semibold text-[var(--ds-text)]">Shortcodes</h2>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close the help panel"
          className="ml-auto inline-flex size-6 items-center justify-center rounded-control text-[var(--ds-text-muted)] hover:bg-[var(--ds-control-hover-bg,var(--ds-surface-hover))]"
        >
          <XIcon weight="bold" aria-hidden className="size-3.5" />
        </button>
      </header>

      {RESIZE_EDGES.map((edge) => (
        <div key={edge} className="mc-help-grip" data-edge={edge} onPointerDown={(event) => startResize(event, edge)} />
      ))}

      <p className="mc-help-hint">
        A shortcode stands in double square brackets and may run over several lines. A star marks a parameter you have
        to give, and an indented entry only works inside the one above it. A variable stands in single braces and works
        in the text as well as inside a parameter.
      </p>

      <div className="mc-help-split">
        <ShortcodeList selected={selected} onSelect={setSelected} />
        <div className="mc-help-body">
          {shownDefinition ? (
            <ShortcodeEntry definition={shownDefinition} depth={0} />
          ) : selected.kind === HelpSelectionKind.Variables ? (
            <SiteVariableList />
          ) : (
            <CodeFenceReference />
          )}
        </div>
      </div>
    </aside>,
    document.body,
  );
}
