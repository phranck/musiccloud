import { cn } from "@/lib/utils";
import { recessedStyle } from "@/styles/neumorphic";

interface RecessedCardProps {
  children: React.ReactNode;
  className?: string;
  style?: React.CSSProperties;
}

/**
 * A card with a recessed/inset appearance. Light source from top-left:
 * dark shadow on top/left edges, subtle highlight on bottom/right.
 *
 * Includes padding (p-4) and overflow hidden by default.
 * No default border-radius -- the caller must set it to match
 * the rule: outer radius - padding = inner radius.
 */
export function RecessedCard({ children, className, style }: RecessedCardProps) {
  return (
    <div
      className={cn("recessed-gradient-border bg-black/50 backdrop-blur-md p-4 overflow-hidden", className)}
      style={{ ...recessedStyle, ...style }}
    >
      {children}
    </div>
  );
}
