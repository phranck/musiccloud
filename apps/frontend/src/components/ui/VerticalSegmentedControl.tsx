import { useEffect, useEffectEvent, useRef, useState } from "react";

import { raisedControlRadius, recessedSurfaceRadius } from "@/components/cards/cardGeometry";
import { RecessedCard } from "@/components/cards/RecessedCard";
import type { Segment } from "@/components/ui/EmbossedSegmentedControl";
import { cn } from "@/lib/utils";

interface VerticalSegmentedControlProps<T extends string> {
  /** Selectable cells in fixed top-to-bottom order; reuses the segmented-control type. */
  segments: Segment<T>[];
  /** Currently selected key. */
  value: T;
  /** Fired when a segment is chosen (also when the active one is re-chosen, which just closes). */
  onChange: (value: T) => void;
  className?: string;
}

/** Raised-segment radius, matching the embossed indicator of EmbossedSegmentedControl. */
const ACTIVE_RADIUS_STYLE = {
  "--neu-radius-base": raisedControlRadius,
  "--neu-radius-sm": raisedControlRadius,
  borderRadius: "var(--neu-radius)",
} as React.CSSProperties;

/** Auto-collapse an opened control after this long with no selection (ms). */
const AUTO_CLOSE_MS = 5000;

/**
 * A vertical, collapse-by-default segmented control sharing the glass language of
 * {@link EmbossedSegmentedControl}: a recessed track holding fixed-order icon cells
 * with the active cell raised as an embossed indicator.
 *
 * Collapsed (the default) it shows ONLY the active cell at the top. The active cell
 * doubles as the trigger: clicking it opens the list, growing the track downward so
 * the remaining cells reveal below it in their fixed relative order. The active cell
 * is pinned to the top via flex `order`, so it never moves when the list opens or
 * closes. Choosing a cell fires `onChange` and closes; clicking outside, pressing
 * Escape, or leaving it open for {@link AUTO_CLOSE_MS} without a choice also closes.
 * The idle countdown pauses while the pointer hovers the control and restarts when
 * it leaves, so resting on an item keeps the list open.
 *
 * The cells are fixed-size, so the open/close is a pure CSS height + row-gap
 * transition (no layout measurement); it is disabled under `prefers-reduced-motion`.
 *
 * Accessibility: each cell carries its own `aria-label`; the active cell adds the
 * menu-trigger semantics (`aria-haspopup`/`aria-expanded`). While collapsed the
 * hidden cells are removed from the tab order and the accessibility tree. The group
 * name (`<legend>`) belongs to the wrapping `<fieldset>` in the switcher.
 */
export function VerticalSegmentedControl<T extends string>({
  segments,
  value,
  onChange,
  className,
}: VerticalSegmentedControlProps<T>) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement | null>(null);
  // The pending idle-auto-close timer and whether the pointer rests on the control.
  // Both are refs, not state: they drive the imperative dismiss timer, never the
  // rendered output, so toggling them must not trigger a re-render.
  const autoCloseTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isHovered = useRef(false);

  // Non-reactive dismiss for the effect-scoped listeners and idle timer: an Effect
  // Event reads the latest state yet is never a dependency, so the effect stays
  // keyed to `open` alone and never re-subscribes on an unrelated re-render.
  const requestClose = useEffectEvent(() => setOpen(false));

  // While open, dismiss on an outside pointer press, Escape, or the idle timeout.
  // The idle countdown is armed here only when the pointer is not already resting on
  // the control — while it hovers, the pointer-enter/leave handlers own the timer
  // and keep it paused, so hovering an item never auto-collapses the list. Listeners
  // and the timer are torn down on close/unmount.
  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: PointerEvent) => {
      if (!containerRef.current?.contains(event.target as Node)) requestClose();
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") requestClose();
    };
    if (!isHovered.current) {
      autoCloseTimer.current = setTimeout(() => requestClose(), AUTO_CLOSE_MS);
    }
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      if (autoCloseTimer.current) clearTimeout(autoCloseTimer.current);
      autoCloseTimer.current = null;
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  const handleSegment = (key: T) => {
    // Collapsed: the only reachable cell is the active one — it opens the list.
    if (!open) {
      setOpen(true);
      return;
    }
    // Open: choose the cell (re-choosing the active one is a no-op change) and close.
    onChange(key);
    setOpen(false);
  };

  // Pause the idle auto-close while the pointer rests on the control, and start a
  // fresh countdown when it leaves — so hovering its items keeps the list open.
  // Hover lives on a ref so these toggles never re-render the control.
  const handlePointerEnter = () => {
    isHovered.current = true;
    if (autoCloseTimer.current) clearTimeout(autoCloseTimer.current);
    autoCloseTimer.current = null;
  };
  const handlePointerLeave = () => {
    isHovered.current = false;
    if (open) autoCloseTimer.current = setTimeout(() => setOpen(false), AUTO_CLOSE_MS);
  };

  return (
    <div
      ref={containerRef}
      className={cn("relative", className)}
      onPointerEnter={handlePointerEnter}
      onPointerLeave={handlePointerLeave}
    >
      <RecessedCard
        className="mc-glass-nav-track flex flex-col p-1 transition-[row-gap] duration-250 ease-out motion-reduce:transition-none"
        radius={recessedSurfaceRadius}
        style={{ rowGap: open ? "var(--mc-gap-seg, 0px)" : "0px" }}
      >
        <RecessedCard.Body className="contents">
          {segments.map(({ key, icon, ariaLabel: segmentLabel, title: segmentTitle }, index) => {
            const isActive = key === value;
            const shown = open || isActive;
            return (
              <button
                key={key}
                type="button"
                // Keep focus where it is (e.g. the hero input) when a cell is clicked.
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => handleSegment(key)}
                aria-label={segmentLabel}
                title={segmentTitle}
                aria-current={isActive ? "true" : undefined}
                aria-haspopup={isActive ? "menu" : undefined}
                aria-expanded={isActive ? open : undefined}
                // Hidden cells are removed from focus, tab order and the a11y tree via
                // `inert` (not `aria-hidden`, which would flag a focusable button).
                inert={!shown}
                className={cn(
                  "relative z-10 flex w-[34px] cursor-pointer items-center justify-center overflow-hidden rounded-lg border-none",
                  "transition-[height,opacity] duration-250 ease-out motion-reduce:transition-none",
                  shown ? "h-[34px] opacity-100" : "h-0 opacity-0 pointer-events-none",
                  isActive ? "embossed-gradient-border mc-glass-nav-indicator mc-txt-nav-bright" : "mc-txt-nav-normal",
                )}
                // The active cell is pinned to the top via flex `order`; the others keep
                // their fixed relative order below it, so the active icon never moves on
                // open/close.
                style={isActive ? { ...ACTIVE_RADIUS_STYLE, order: -1 } : { order: index }}
              >
                {icon}
              </button>
            );
          })}
        </RecessedCard.Body>
      </RecessedCard>
    </div>
  );
}
