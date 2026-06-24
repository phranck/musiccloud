import type { CSSProperties } from "react";
import { raisedControlRadius, recessedSurfaceRadius } from "@/components/cards/cardGeometry";
import { RecessedCard } from "@/components/cards/RecessedCard";
import { VfdBrightness, VfdDisplay, VfdSectionAlign } from "@/components/ui/VfdDisplay";
import { cn } from "@/lib/utils";

/** One selectable option of a {@link RadioButtonControl}. */
export interface RadioButtonOption<T extends string> {
  /** Stable value emitted on selection. */
  value: T;
  /** Short label rendered on the option's mini-VFD (a few glyph cells). */
  label: string;
}

interface RadioButtonControlProps<T extends string> {
  /** The selectable options, rendered left-to-right as equal-width cells. */
  options: RadioButtonOption<T>[];
  /** Currently selected value. */
  value: T;
  /** Fired with the option value when a cell is activated. */
  onChange: (value: T) => void;
  /** Accessible group label (the individual cells label themselves by value). */
  ariaLabel: string;
  /** Phosphor colour forwarded to every mini-VFD so they match the host display. */
  phosphorColor?: string;
  /** Extra classes for the outer group wrapper. */
  className?: string;
}

/** Glyph cells per mini-VFD — sized for the widest format label ("256k", "FLAC"). */
const FORMAT_VFD_CELLS = 4;

/**
 * A compact segmented selector whose cells are equal-width and each render a
 * tiny {@link VfdDisplay} instead of plain text: the active cell's VFD glows
 * `bright`, the others stay `dim`, so the control reads as a bank of hardware
 * format buttons.
 *
 * Geometry mirrors {@link import("./EmbossedSegmentedControl").EmbossedSegmentedControl}:
 * a recessed CC-green track with a single embossed indicator sliding behind the
 * active cell. Because every cell is the same width (no content measuring is
 * needed), the indicator is positioned purely with CSS — its width is one
 * `1/n` slice and it translates by whole multiples of its own width — so there
 * is no per-cell `ResizeObserver`.
 *
 * Cells are plain `aria-pressed` buttons (matching the sibling segmented
 * control's a11y model); the group carries the accessible name.
 *
 * @param options - The equal-width option cells.
 * @param value - The currently selected value.
 * @param onChange - Selection handler.
 * @param ariaLabel - Accessible group label.
 * @param phosphorColor - Phosphor colour shared with the host VFD.
 * @param className - Extra classes for the outer wrapper.
 */
export function RadioButtonControl<T extends string>({
  options,
  value,
  onChange,
  ariaLabel,
  phosphorColor,
  className,
}: RadioButtonControlProps<T>) {
  const count = options.length;
  const activeIndex = Math.max(
    0,
    options.findIndex((option) => option.value === value),
  );

  return (
    <fieldset className={cn("m-0 min-w-0 border-0 p-0", className)} aria-label={ariaLabel}>
      <RecessedCard className="mc-glass-cc-seg-track relative flex gap-0 p-1" radius={recessedSurfaceRadius}>
        <RecessedCard.Body className="contents">
          {count > 0 && (
            <div
              className="pointer-events-none absolute top-1 bottom-1 left-1 transition-transform duration-250 ease-out"
              style={{
                width: `calc((100% - 0.5rem) / ${count})`,
                transform: `translateX(calc(${activeIndex} * 100%))`,
              }}
            >
              <div
                className="mc-glass-cc-seg-indicator embossed-gradient-border size-full"
                style={
                  {
                    "--neu-radius-base": raisedControlRadius,
                    "--neu-radius-sm": raisedControlRadius,
                    borderRadius: "var(--neu-radius)",
                  } as CSSProperties
                }
              />
            </div>
          )}
          {options.map((option) => {
            const active = option.value === value;
            return (
              <button
                key={option.value}
                type="button"
                // Preserve focus (e.g. the player) when a cell is clicked.
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => onChange(option.value)}
                aria-pressed={active}
                aria-label={option.label}
                className="relative z-10 flex flex-1 cursor-pointer items-center justify-center border-none bg-transparent p-0"
              >
                <VfdDisplay
                  rows={1}
                  charsPerLine={FORMAT_VFD_CELLS}
                  lines={[
                    {
                      content: option.label,
                      align: VfdSectionAlign.Center,
                      brightness: active ? VfdBrightness.Bright : VfdBrightness.Dim,
                    },
                  ]}
                  ariaLabel={option.label}
                  phosphorColor={phosphorColor}
                  className="pointer-events-none bg-transparent px-1.5 py-1"
                />
              </button>
            );
          })}
        </RecessedCard.Body>
      </RecessedCard>
    </fieldset>
  );
}
