import { useCallback, useLayoutEffect, useRef, useState } from "react";

interface Segment<T extends string> {
  key: T;
  label: string;
}

interface EmbossedSegmentedControlProps<T extends string> {
  segments: readonly Segment<T>[];
  value: T;
  onChange: (next: T) => void;
  className?: string;
}

/**
 * Recessed-track + raised-pill segmented control. Visual match for the
 * frontend's `SegmentedControl` (used in EmbedModal + content-page overlays)
 * so the dashboard preview renders identically to production.
 *
 * Self-contained styling — no dependency on EmbossedCard/RecessedCard or
 * neumorphic.css, so it can render anywhere Tailwind is available.
 */
export function EmbossedSegmentedControl<T extends string>({
  segments,
  value,
  onChange,
  className,
}: EmbossedSegmentedControlProps<T>) {
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
      className={`relative flex items-stretch bg-black/30 rounded-xl p-1 ${className ?? ""}`}
      style={{
        boxShadow: "inset 1px 1px 4px rgba(0,0,0,0.25)",
      }}
    >
      {pill && (
        <div
          aria-hidden="true"
          className="absolute rounded-lg bg-white/[0.07] pointer-events-none"
          style={{
            left: pill.left,
            width: pill.width,
            height: pill.height,
            top: "50%",
            transform: "translateY(-50%)",
            boxShadow: "0 2px 6px rgba(0,0,0,0.4), 0 -2px 6px rgba(255,255,255,0.03)",
            border: "1px solid rgba(255,255,255,0.08)",
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
            className={`relative z-10 flex-1 py-2 px-3 rounded-lg text-[13px] font-semibold text-center transition-colors duration-150 ${
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
