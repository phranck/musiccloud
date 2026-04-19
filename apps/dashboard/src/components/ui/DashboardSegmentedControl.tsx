import { useCallback, useLayoutEffect, useRef, useState } from "react";

interface Segment<T extends string> {
  key: T;
  label: string;
}

interface DashboardSegmentedControlProps<T extends string> {
  segments: readonly Segment<T>[];
  value: T;
  onChange: (value: T) => void;
  className?: string;
}

/**
 * Segmented control in the dashboard visual language:
 *
 * - Track: `var(--ds-segment-bg)` on a `rounded-control` surface matching
 *   `DashboardSection` framing.
 * - Sliding pill: `var(--ds-segment-active-bg)` with a subtle drop shadow,
 *   animated via absolute positioning measured from the active button.
 * - Inactive labels use `var(--ds-text-muted)`; active label is
 *   `var(--ds-text)`.
 *
 * Visually consistent with `SegmentedControl` (iconset/toolbar usage) but
 * tuned for wider labels such as page-segment previews.
 */
export function DashboardSegmentedControl<T extends string>({
  segments,
  value,
  onChange,
  className,
}: DashboardSegmentedControlProps<T>) {
  const activeIndex = segments.findIndex((s) => s.key === value);
  const containerRef = useRef<HTMLDivElement>(null);
  const [pill, setPill] = useState<{ left: number; width: number; height: number } | null>(null);
  const didMount = useRef(false);

  const measurePill = useCallback(() => {
    const container = containerRef.current;
    if (!container) return;
    const buttons = container.querySelectorAll<HTMLButtonElement>("button");
    const btn = buttons[activeIndex];
    if (!btn) return;
    const cRect = container.getBoundingClientRect();
    const bRect = btn.getBoundingClientRect();
    const next = { left: bRect.left - cRect.left, width: bRect.width, height: bRect.height };
    setPill((prev) => {
      if (prev && prev.left === next.left && prev.width === next.width && prev.height === next.height) {
        return prev;
      }
      return next;
    });
    didMount.current = true;
  }, [activeIndex]);

  useLayoutEffect(() => {
    measurePill();
  }, [measurePill]);

  useLayoutEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const observer = new ResizeObserver(() => measurePill());
    observer.observe(container);
    for (const button of container.querySelectorAll<HTMLButtonElement>("button")) {
      observer.observe(button);
    }
    const handleResize = () => measurePill();
    window.addEventListener("resize", handleResize);
    return () => {
      window.removeEventListener("resize", handleResize);
      observer.disconnect();
    };
  }, [measurePill]);

  return (
    // biome-ignore lint/a11y/useSemanticElements: role="group" on a div is intentional; <fieldset> would disrupt the sliding-pill layout.
    <div
      role="group"
      ref={containerRef}
      className={`relative flex items-stretch bg-[var(--ds-card-bg)] rounded-control p-1 ${className ?? ""}`}
    >
      {pill && (
        <div
          aria-hidden="true"
          className="absolute rounded-[4px] bg-[var(--ds-section-header-bg)] shadow-sm pointer-events-none"
          style={{
            left: pill.left,
            width: pill.width,
            height: pill.height,
            top: "50%",
            transform: "translateY(-50%)",
            transition: didMount.current
              ? "left 200ms cubic-bezier(0.4, 0, 0.2, 1), width 200ms cubic-bezier(0.4, 0, 0.2, 1)"
              : "none",
          }}
        />
      )}
      {segments.map(({ key, label }) => {
        const isActive = key === value;
        return (
          <button
            key={key}
            type="button"
            onClick={() => onChange(key)}
            aria-pressed={isActive}
            className={`relative z-10 flex-1 py-2 px-3 rounded-[4px] text-sm font-medium text-center transition-colors ${
              isActive ? "text-[var(--ds-text)]" : "text-[var(--ds-text-muted)] hover:text-[var(--ds-text)]"
            }`}
          >
            {label}
          </button>
        );
      })}
    </div>
  );
}
