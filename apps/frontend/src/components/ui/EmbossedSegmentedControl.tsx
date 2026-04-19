import { EmbossedCard } from "@/components/cards/EmbossedCard";
import { RecessedCard } from "@/components/cards/RecessedCard";
import { cn } from "@/lib/utils";

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
 * Generic over the segment key type for type-safe selection.
 */
export function EmbossedSegmentedControl<T extends string>({
  segments,
  value,
  onChange,
  className,
}: EmbossedSegmentedControlProps<T>) {
  const activeIndex = segments.findIndex((s) => s.key === value);
  const count = segments.length;

  return (
    <RecessedCard className={cn("relative flex p-1", className)} radius="0.75rem">
      <RecessedCard.Body className="contents">
        {/* Sliding embossed indicator */}
        <div
          className="absolute top-1 bottom-1 transition-[left] duration-250 ease-out"
          style={{
            left: `calc(${activeIndex} * ${100 / count}% + 4px)`,
            width: `calc(${100 / count}% - 8px)`,
          }}
        >
          <EmbossedCard className="w-full h-full rounded-lg p-0 bg-gray-700/[0.65]" />
        </div>
        {segments.map(({ key, label }) => (
          <button
            key={key}
            type="button"
            onClick={() => onChange(key)}
            className={cn(
              "relative z-10 flex-1 py-2 px-3 rounded-lg text-[13px] font-semibold text-center transition-colors duration-150",
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
