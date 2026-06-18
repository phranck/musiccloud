import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

interface TftScreenProps {
  children: ReactNode;
  className?: string;
  /** Adds the shared top-left inset shadow used by recessed artwork screens. */
  insetShadow?: boolean;
}

/**
 * The album-cover TFT screen. The artwork is composited under a stack of
 * token-driven overlay layers — art tint, LCD dot-matrix, sheen and the inset
 * frame shadow — each cross-faded day↔night entirely in CSS from the design
 * tokens' `cover` group (see `.mc-tft-screen*` in `animations.css`).
 */
export function TftScreen({ children, className, insetShadow = true }: TftScreenProps) {
  return (
    <div className={cn("mc-tft-screen relative", className)}>
      <div className="mc-tft-screen-content">{children}</div>
      <div className="mc-tft-screen-tint" aria-hidden="true" />
      <div className="mc-tft-screen-matrix" aria-hidden="true" />
      <div className="mc-tft-screen-sheen" aria-hidden="true" />
      {insetShadow && <div className="mc-tft-screen-shadow" aria-hidden="true" />}
    </div>
  );
}
