import { cn } from "@/lib/utils";
import { recessedStyle } from "@/styles/neumorphic";

interface RecessedCardProps {
  children: React.ReactNode;
  className?: string;
  style?: React.CSSProperties;
  /** Width of the gradient border. Defaults to 1px. */
  borderWidth?: string;
}

/**
 * A card with a recessed/inset appearance. Light source from top-left:
 * dark shadow on top/left edges, subtle highlight on bottom/right.
 *
 * Includes padding (p-4) and overflow hidden by default.
 * No default border-radius -- the caller must set it to match
 * the rule: outer radius - padding = inner radius.
 */
export function RecessedCard({ children, className, style, borderWidth }: RecessedCardProps) {
  const mergedStyle: React.CSSProperties = {
    ...recessedStyle,
    ...(borderWidth ? ({ "--neu-border-width": borderWidth } as React.CSSProperties) : {}),
    ...style,
  };
  return (
    <div
      className={cn("recessed-gradient-border bg-black/25 backdrop-blur-md p-4 overflow-hidden", className)}
      style={mergedStyle}
    >
      {children}
    </div>
  );
}
