import type { CSSProperties } from "react";

import {
  OverlayBackdropPlacement,
  type OverlayBackdropPlacement as OverlayBackdropPlacementType,
} from "@/components/ui/OverlayBackdropTypes";
import { cn } from "@/lib/utils";

// Scrim colour + blur from the design-token `backdrop` group, cross-faded
// day↔night. Applied only while open; the opacity transition fades it in/out.
const BACKDROP_BG =
  "color-mix(in srgb, var(--backdrop-day-bg) calc(var(--g-dayness) * 100%), var(--backdrop-night-bg))";
const BACKDROP_BLUR =
  "blur(calc(var(--backdrop-day-blur) * var(--g-dayness) + var(--backdrop-night-blur) * (1 - var(--g-dayness))))";

interface OverlayBackdropProps {
  open: boolean;
  onClick: () => void;
  ariaLabel: string;
  placement?: OverlayBackdropPlacementType;
  className?: string;
  style?: CSSProperties;
}

export function OverlayBackdrop({
  open,
  onClick,
  ariaLabel,
  placement = OverlayBackdropPlacement.Absolute,
  className,
  style,
}: OverlayBackdropProps) {
  const backdropStyle: CSSProperties = open
    ? { backgroundColor: BACKDROP_BG, backdropFilter: BACKDROP_BLUR, WebkitBackdropFilter: BACKDROP_BLUR }
    : { backgroundColor: "transparent" };

  return (
    <button
      type="button"
      aria-label={ariaLabel}
      onClick={onClick}
      className={cn(placement, "inset-0 cursor-default border-0 p-0 transition-colors duration-300", className)}
      style={{ ...backdropStyle, ...style }}
    />
  );
}
