import { cn } from "@/lib/utils";

interface EmbossedCardProps {
  children: React.ReactNode;
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
      className={cn("bg-white/[0.07] p-4 overflow-hidden", className)}
      style={{
        boxShadow: "2px 2px 6px rgba(0,0,0,0.4), -2px -2px 6px rgba(255,255,255,0.03)",
        borderTop: "1px solid rgba(255,255,255,0.15)",
        borderLeft: "1px solid rgba(255,255,255,0.10)",
        borderBottom: "1px solid rgba(0,0,0,0.35)",
        borderRight: "1px solid rgba(0,0,0,0.3)",
        ...style,
      }}
    >
      {children}
    </div>
  );
}
