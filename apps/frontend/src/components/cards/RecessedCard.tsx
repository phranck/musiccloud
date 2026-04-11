import { cn } from "@/lib/utils";

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
      className={cn("bg-black/20 p-4 overflow-hidden", className)}
      style={{
        boxShadow: "inset 1px 1px 4px rgba(0,0,0,0.25), inset -1px -1px 4px rgba(255,255,255,0.02)",
        borderTop: "1px solid rgba(0,0,0,0.25)",
        borderLeft: "1px solid rgba(0,0,0,0.2)",
        borderBottom: "1px solid rgba(255,255,255,0.15)",
        borderRight: "1px solid rgba(255,255,255,0.10)",
        ...style,
      }}
    >
      {children}
    </div>
  );
}
