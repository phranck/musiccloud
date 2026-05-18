import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

interface TftScreenProps {
  children: ReactNode;
  className?: string;
  /** Adds the shared top-left inset shadow used by recessed artwork screens. */
  insetShadow?: boolean;
}

export function TftScreen({ children, className, insetShadow = true }: TftScreenProps) {
  return (
    <div className={cn("mc-tft-screen relative overflow-hidden", className)}>
      {children}
      {/* Shared dark TFT matrix overlay. Kept here so MediaCard and ArtistInfo
          artwork use the exact same screen treatment instead of duplicating
          layer order, radius handling, and pointer transparency. */}
      <div className="mc-tft-screen-overlay" aria-hidden="true" />
      {insetShadow && <div className="mc-tft-screen-shadow" aria-hidden="true" />}
    </div>
  );
}
