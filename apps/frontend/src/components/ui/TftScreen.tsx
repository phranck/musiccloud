import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

interface TftScreenProps {
  children: ReactNode;
  className?: string;
  /** Adds the shared top-left inset shadow used by recessed artwork screens. */
  insetShadow?: boolean;
  /** Renders the cover-screen tint/sheen/shadow overlays. Disable for hardware art. */
  showEffects?: boolean;
  /** Renders the LCD dot-matrix overlay. Disable for non-screen hardware art. */
  showMatrix?: boolean;
}

/**
 * The album-cover TFT screen. The artwork is composited under a stack of
 * token-driven overlay layers — art tint, LCD dot-matrix, sheen and the inset
 * frame shadow — each cross-faded day↔night entirely in CSS from the design
 * tokens' `cover` group (see `.mc-tft-screen*` in `animations.css`).
 */
export function TftScreen({
  children,
  className,
  insetShadow = true,
  showEffects = true,
  showMatrix = true,
}: TftScreenProps) {
  return (
    <div className={cn("mc-tft-screen relative", className)} data-tft-matrix={showMatrix ? "on" : "off"}>
      <div className="mc-tft-screen-content">{children}</div>
      {showEffects && <div className="mc-tft-screen-tint" aria-hidden="true" />}
      {showEffects && showMatrix && <div className="mc-tft-screen-matrix" aria-hidden="true" />}
      {showEffects && <div className="mc-tft-screen-sheen" aria-hidden="true" />}
      {showEffects && insetShadow && <div className="mc-tft-screen-shadow" aria-hidden="true" />}
    </div>
  );
}
