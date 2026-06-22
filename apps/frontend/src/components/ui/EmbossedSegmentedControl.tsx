import { useLayoutEffect, useRef, useState } from "react";

import { raisedControlRadius, recessedSurfaceRadius } from "@/components/cards/cardGeometry";
import { RecessedCard } from "@/components/cards/RecessedCard";
import { cn } from "@/lib/utils";

/**
 * One selectable cell of the segmented control.
 *
 * A segment can render a visible text label, an icon-only cell, or both. When
 * `icon` is set and `label` is empty, the cell is icon-only and MUST supply
 * `ariaLabel` so the button stays announced to assistive tech.
 *
 * @property key Stable identifier for this segment and the control's value.
 * @property label Visible text. Empty string for an icon-only segment.
 * @property icon Optional decorative icon node (rendered `aria-hidden` by the caller).
 * @property ariaLabel Accessible name applied to the button when no visible text exists.
 * @property title Optional help text surfaced as the button's native `title` tooltip.
 */
export interface Segment<T extends string> {
  key: T;
  label: string;
  icon?: React.ReactNode;
  ariaLabel?: string;
  title?: string;
}

interface EmbossedSegmentedControlProps<T extends string> {
  segments: Segment<T>[];
  value: T;
  onChange: (value: T) => void;
  className?: string;
  /**
   * Glass surface class for the recessed track. Defaults to the neutral
   * `mc-glass-seg-track`. Callers that need a different token-driven surface
   * (e.g. the CC-mode green `mc-glass-cc-seg-track`) pass it here instead of
   * relying on ad-hoc colours.
   */
  trackClassName?: string;
  /**
   * Glass surface class for the sliding embossed indicator. Defaults to the
   * neutral `mc-glass-seg-indicator`. Pair with {@link trackClassName} to swap
   * the whole control onto an alternate token surface (e.g. the CC green).
   */
  indicatorClassName?: string;
}

/**
 * A segmented control with a recessed track and a sliding embossed indicator.
 *
 * Segments size to their content so longer labels stay readable; the indicator
 * tracks the active button's measured geometry. Each segment renders either a
 * text label, an icon-only cell, or both: icon-only cells get square padding
 * and fall back to `ariaLabel` for their accessible name, while labelled cells
 * keep the wider text padding and typography.
 *
 * The indicator geometry is measured per active button via a `ResizeObserver`,
 * so icon-only and text segments are handled identically without extra layout
 * logic.
 */
export function EmbossedSegmentedControl<T extends string>({
  segments,
  value,
  onChange,
  className,
  trackClassName = "mc-glass-seg-track",
  indicatorClassName = "mc-glass-seg-indicator",
}: EmbossedSegmentedControlProps<T>) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const buttonRefs = useRef<Map<T, HTMLButtonElement> | null>(null);
  const buttonRefMap = buttonRefs.current ?? (buttonRefs.current = new Map());
  const [indicator, setIndicator] = useState<{ left: number; width: number } | null>(null);

  // biome-ignore lint/correctness/useExhaustiveDependencies: re-run when segments change so newly mounted buttons are observed
  useLayoutEffect(() => {
    const container = containerRef.current;
    const active = buttonRefMap.get(value);
    if (!container || !active) return;

    const update = () => {
      const containerRect = container.getBoundingClientRect();
      const rect = active.getBoundingClientRect();
      setIndicator({ left: rect.left - containerRect.left, width: rect.width });
    };

    update();

    // SSR / jsdom have no ResizeObserver. The initial `update()` already seeds
    // the indicator; live re-measuring on resize only matters in the browser,
    // which always provides it. Mirrors the guard in BackgroundScene/VfdDisplay.
    if (typeof ResizeObserver === "undefined") return;

    const resizeObserver = new ResizeObserver(update);
    resizeObserver.observe(container);
    for (const btn of buttonRefMap.values()) resizeObserver.observe(btn);

    return () => resizeObserver.disconnect();
  }, [value, segments, buttonRefMap]);

  return (
    <RecessedCard
      ref={containerRef}
      className={cn(trackClassName, "relative flex gap-[var(--mc-gap-seg,0px)] p-1", className)}
      radius={recessedSurfaceRadius}
    >
      <RecessedCard.Body className="contents">
        {indicator && (
          <div
            className="absolute top-1 bottom-1 transition-[transform,width] duration-250 ease-out"
            style={{
              width: indicator.width,
              transform: `translateX(${indicator.left - 4}px)`,
              left: "0.25rem",
            }}
          >
            <div
              className={cn("embossed-gradient-border size-full", indicatorClassName)}
              style={
                {
                  "--neu-radius-base": raisedControlRadius,
                  "--neu-radius-sm": raisedControlRadius,
                  borderRadius: "var(--neu-radius)",
                } as React.CSSProperties
              }
            />
          </div>
        )}
        {segments.map(({ key, label, icon, ariaLabel, title }) => {
          const hasVisibleText = label.length > 0;
          return (
            <button
              key={key}
              ref={(el) => {
                if (el) buttonRefMap.set(key, el);
                else buttonRefMap.delete(key);
              }}
              type="button"
              // Keep focus where it is (e.g. the hero input) when a segment is
              // clicked: preventing the mousedown default stops the button from
              // stealing focus. The selection still fires via onClick, and
              // keyboard focus (Tab/Enter) is unaffected (it sends no mousedown).
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => onChange(key)}
              aria-label={hasVisibleText ? undefined : ariaLabel}
              title={title}
              className={cn(
                "relative z-10 flex cursor-pointer items-center justify-center rounded-lg whitespace-nowrap transition-colors duration-150",
                "border-none",
                // Text cells grow to share the track width; icon-only cells get a
                // fixed square size so a control's segment height/size stays the
                // same regardless of the glyph (an 18px Phosphor icon and a 16px
                // flag emoji both yield identical 34px segments).
                hasVisibleText ? "flex-auto py-2 px-3 text-[13px] font-semibold text-center" : "size-[34px]",
                key === value ? "mc-txt-button-bright" : "mc-txt-button-normal",
              )}
            >
              {icon}
              {hasVisibleText ? label : null}
            </button>
          );
        })}
      </RecessedCard.Body>
    </RecessedCard>
  );
}
