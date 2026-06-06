import type { CSSProperties } from "react";

import {
  OverlayBackdropPlacement,
  type OverlayBackdropPlacement as OverlayBackdropPlacementType,
} from "@/components/ui/OverlayBackdropTypes";
import { cn } from "@/lib/utils";

const OVERLAY_BACKDROP_OPEN_CLASS = "bg-black/70";
const OVERLAY_BACKDROP_CLOSED_CLASS = "bg-black/0";

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
  return (
    <button
      type="button"
      aria-label={ariaLabel}
      onClick={onClick}
      className={cn(
        placement,
        "inset-0 cursor-default border-0 p-0 transition-colors duration-300",
        open ? OVERLAY_BACKDROP_OPEN_CLASS : OVERLAY_BACKDROP_CLOSED_CLASS,
        className,
      )}
      style={style}
    />
  );
}
