import { type ReactNode, useId } from "react";
import { cn } from "@/lib/utils";

interface TftScreenProps {
  children: ReactNode;
  className?: string;
  /** Adds the shared top-left inset shadow used by recessed artwork screens. */
  insetShadow?: boolean;
}

export function TftScreen({ children, className, insetShadow = true }: TftScreenProps) {
  const matrixPatternId = useId().replace(/[^a-zA-Z0-9_-]/g, "");
  const patternId = `mc-tft-matrix-${matrixPatternId}`;
  const sheenId = `mc-tft-sheen-${matrixPatternId}`;

  return (
    <div className={cn("mc-tft-screen relative", className)}>
      <div className="mc-tft-screen-content">{children}</div>
      <svg className="mc-tft-screen-matrix" aria-hidden="true" focusable="false">
        <defs>
          <pattern id={patternId} width="4" height="4" patternUnits="userSpaceOnUse">
            <rect x="0" y="0" width="1" height="4" fill="rgba(0, 0, 0, 0.28)" />
            <rect x="0" y="0" width="4" height="1" fill="rgba(0, 0, 0, 0.24)" />
          </pattern>
          <linearGradient id={sheenId} x1="0" x2="0" y1="0" y2="1">
            <stop offset="0" stopColor="rgba(255, 255, 255, 0.07)" />
            <stop offset="0.3" stopColor="transparent" />
            <stop offset="1" stopColor="rgba(0, 0, 0, 0.16)" />
          </linearGradient>
        </defs>
        <rect width="100%" height="100%" fill={`url(#${patternId})`} />
        <rect width="100%" height="100%" fill={`url(#${sheenId})`} />
      </svg>
      {insetShadow && <div className="mc-tft-screen-shadow" aria-hidden="true" />}
    </div>
  );
}
