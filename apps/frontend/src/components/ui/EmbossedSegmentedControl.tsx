import { useLayoutEffect, useRef, useState } from "react";

import { raisedControlRadius, recessedSurfaceRadius } from "@/components/cards/cardGeometry";
import { RecessedCard } from "@/components/cards/RecessedCard";
import { cn } from "@/lib/utils";
import { embossedCardStyle } from "@/styles/neumorphic";

interface Segment<T extends string> {
  key: T;
  label: string;
}

interface EmbossedSegmentedControlProps<T extends string> {
  segments: Segment<T>[];
  value: T;
  onChange: (value: T) => void;
  className?: string;
}

/**
 * A segmented control with a recessed track and a sliding embossed indicator.
 *
 * Segments size to their content so longer labels stay readable; the indicator
 * tracks the active button's measured geometry.
 */
export function EmbossedSegmentedControl<T extends string>({
  segments,
  value,
  onChange,
  className,
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

    const resizeObserver = new ResizeObserver(update);
    resizeObserver.observe(container);
    for (const btn of buttonRefMap.values()) resizeObserver.observe(btn);

    return () => resizeObserver.disconnect();
  }, [value, segments, buttonRefMap]);

  return (
    <RecessedCard ref={containerRef} className={cn("relative flex p-1", className)} radius={recessedSurfaceRadius}>
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
              className="embossed-gradient-border size-full bg-zinc-700/[0.65]"
              style={{
                ...embossedCardStyle,
                "--neu-radius-base": raisedControlRadius,
                "--neu-radius-sm": raisedControlRadius,
                borderRadius: "var(--neu-radius)",
              }}
            />
          </div>
        )}
        {segments.map(({ key, label }) => (
          <button
            key={key}
            ref={(el) => {
              if (el) buttonRefMap.set(key, el);
              else buttonRefMap.delete(key);
            }}
            type="button"
            onClick={() => onChange(key)}
            className={cn(
              "relative z-10 flex-auto py-2 px-3 rounded-lg text-[13px] font-semibold text-center whitespace-nowrap transition-colors duration-150",
              "border-none",
              key === value ? "text-text-primary" : "text-text-secondary hover:text-text-primary",
            )}
          >
            {label}
          </button>
        ))}
      </RecessedCard.Body>
    </RecessedCard>
  );
}
