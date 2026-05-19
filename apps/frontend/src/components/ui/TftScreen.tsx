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
    <div
      className={cn("mc-tft-screen relative overflow-hidden", insetShadow && "mc-tft-screen-inset-shadow", className)}
    >
      <div className="mc-tft-screen-content">{children}</div>
    </div>
  );
}
