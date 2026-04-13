import { cn } from "@/lib/utils";
import { embossedCardStyle } from "@/styles/neumorphic";

interface EmbossedCardProps {
  children?: React.ReactNode;
  className?: string;
  style?: React.CSSProperties;
}

/**
 * A card with a raised/embossed appearance. Light source from top-left:
 * bright highlight on top/left edges, dark shadow on bottom/right.
 *
 * Includes padding (p-4) and overflow hidden by default.
 * No default border-radius -- the caller must set it to match
 * the rule: outer radius - padding = inner radius.
 */
export function EmbossedCard({ children, className, style }: EmbossedCardProps) {
  return (
    <div
      className={cn("embossed-gradient-border bg-white/[0.07] p-4 overflow-hidden", className)}
      style={{ ...embossedCardStyle, ...style }}
    >
      {children}
    </div>
  );
}
