import { embossedCardStyle, recessedStyle } from "@/shared/styles/neumorphic";

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
 * Pixel-identical port of the frontend's `EmbossedSegmentedControl`
 * (see `apps/frontend/src/components/ui/EmbossedSegmentedControl.tsx`).
 * Uses the same neumorphic CSS classes (`recessed-gradient-border`,
 * `embossed-gradient-border`) and inline shadow tokens so the dashboard
 * preview renders byte-for-byte identical to production.
 *
 * Requires `@/shared/styles/neumorphic.css` to be imported once at the
 * dashboard entry point.
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
    // biome-ignore lint/a11y/useSemanticElements: role="group" on a div is intentional; <fieldset> would disrupt the absolute-positioned sliding pill.
    <div
      role="group"
      className={`relative flex p-1 recessed-gradient-border bg-black/25 backdrop-blur-md overflow-hidden ${className ?? ""}`}
      style={
        {
          ...recessedStyle,
          borderRadius: "0.75rem",
          "--neu-radius-base": "0.75rem",
          "--neu-radius-sm": "0.75rem",
        } as React.CSSProperties
      }
    >
      {count > 0 && (
        <div
          aria-hidden="true"
          className="absolute top-1 bottom-1 transition-[left] duration-200 ease-out pointer-events-none"
          style={{
            left: `calc(${activeIndex} * ${100 / count}% + 4px)`,
            width: `calc(${100 / count}% - 8px)`,
          }}
        >
          <div
            className="w-full h-full rounded-lg embossed-gradient-border bg-white/[0.07] overflow-hidden"
            style={
              {
                ...embossedCardStyle,
                "--neu-radius-base": "0.5rem",
                "--neu-radius-sm": "0.5rem",
                "--emb-radius-base": "0.5rem",
                "--emb-radius-sm": "0.5rem",
              } as React.CSSProperties
            }
          />
        </div>
      )}
      {segments.map(({ key, label }) => {
        const isActive = key === value;
        return (
          <button
            key={key}
            type="button"
            onClick={() => onChange(key)}
            aria-pressed={isActive}
            className={`relative z-10 flex-1 py-2 px-3 rounded-lg text-[13px] font-semibold text-center transition-colors duration-150 border-none ${
              isActive ? "text-[#F5F5F7]" : "text-[#C7C7CC] hover:text-[#F5F5F7]"
            }`}
          >
            {label}
          </button>
        );
      })}
    </div>
  );
}
