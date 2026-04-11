import { cn } from "@/lib/utils";

interface EmbossedButtonProps extends React.AnchorHTMLAttributes<HTMLAnchorElement> {
  children: React.ReactNode;
  className?: string;
}

/**
 * A button/link with a raised/embossed appearance matching EmbossedCard.
 * Light source from top-left: bright highlight on top/left edges,
 * dark shadow on bottom/right.
 *
 * Renders as an `<a>` element. No default border-radius -- the caller
 * must set it to match the radius nesting rule.
 */
export function EmbossedButton({ children, className, style, ...props }: EmbossedButtonProps) {
  return (
    <a
      className={cn(
        "bg-white/[0.07] px-5 py-2.5 overflow-hidden",
        "transition-all duration-150",
        "hover:bg-white/[0.10] hover:scale-[1.03]",
        "focus-visible:bg-white/[0.10] focus-visible:scale-[1.03]",
        "active:scale-[0.97]",
        className,
      )}
      style={{
        boxShadow: "2px 2px 6px rgba(0,0,0,0.4), -2px -2px 6px rgba(255,255,255,0.03)",
        borderTop: "1px solid rgba(255,255,255,0.15)",
        borderLeft: "1px solid rgba(255,255,255,0.10)",
        borderBottom: "1px solid rgba(0,0,0,0.35)",
        borderRight: "1px solid rgba(0,0,0,0.3)",
        ...style,
      }}
      {...props}
    >
      {children}
    </a>
  );
}
