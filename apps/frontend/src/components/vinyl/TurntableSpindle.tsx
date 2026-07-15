import type { CSSProperties } from "react";
import { cn } from "@/lib/utils";
import { TurntableSpindlePlacement, type TurntableSpindlePlacementValue } from "./TurntableSpindlePlacement";

interface TurntableSpindleProps {
  /** Stacking and size supplied by the owning record or turntable stage. */
  className?: string;
  /** Physical spindle size relative to its owning disc or swap stage. */
  style?: CSSProperties;
  /** Selects stable data hooks for deck hardware versus a standalone record. */
  placement: TurntableSpindlePlacementValue;
}

/**
 * Static rounded chrome spindle shared by standalone vinyl and the turntable.
 *
 * The rendered metal is deliberately outside every rotating rotor. Its baked
 * specular highlights therefore stay fixed to the turntable lighting while the
 * record and its paper label turn around it.
 */
export function TurntableSpindle({ className, placement, style }: TurntableSpindleProps) {
  const isDeckHardware = placement === TurntableSpindlePlacement.Deck;

  return (
    <span
      aria-hidden="true"
      className={cn(
        "pointer-events-none absolute left-1/2 top-1/2 aspect-square -translate-x-1/2 -translate-y-1/2 overflow-hidden rounded-full",
        className,
      )}
      data-turntable-spindle={isDeckHardware ? "true" : undefined}
      data-vinyl-turntable-spindle={isDeckHardware ? undefined : "true"}
      style={style}
    >
      <img
        alt=""
        aria-hidden="true"
        className="absolute inset-0 h-full w-full max-w-none object-cover"
        data-turntable-spindle-render={isDeckHardware ? "true" : undefined}
        data-vinyl-turntable-spindle-render={isDeckHardware ? undefined : "true"}
        draggable={false}
        src="/img/vinyl/lp-spindle-render.png"
      />
    </span>
  );
}
