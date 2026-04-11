import { cn } from "@/lib/utils";

/** Shared embossed border/shadow styles. Light source top-left. */
export const embossedStyle: React.CSSProperties = {
  boxShadow: "2px 2px 6px rgba(0,0,0,0.4), -2px -2px 6px rgba(255,255,255,0.03)",
  borderTop: "1px solid rgba(255,255,255,0.15)",
  borderLeft: "1px solid rgba(255,255,255,0.10)",
  borderBottom: "1px solid rgba(0,0,0,0.35)",
  borderRight: "1px solid rgba(0,0,0,0.3)",
};

const baseClasses = [
  "bg-white/[0.07] px-5 py-2.5 overflow-hidden",
  "transition-all duration-150",
  "hover:bg-white/[0.10] hover:scale-[1.03]",
  "focus-visible:bg-white/[0.10] focus-visible:scale-[1.03]",
  "active:scale-[0.97]",
];

type AnchorProps = React.AnchorHTMLAttributes<HTMLAnchorElement> & { as?: "a" };
type ButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> & { as: "button" };

type EmbossedButtonProps = (AnchorProps | ButtonProps) & {
  children: React.ReactNode;
  className?: string;
};

/**
 * A button/link with a raised/embossed appearance matching EmbossedCard.
 *
 * Renders as `<a>` by default. Pass `as="button"` for a `<button>` element.
 * No default border-radius -- the caller must set it.
 */
export function EmbossedButton({ children, className, style, ...props }: EmbossedButtonProps) {
  const mergedStyle = { ...embossedStyle, ...style };

  if ("as" in props && props.as === "button") {
    const { as: _, ...buttonProps } = props as ButtonProps;
    return (
      <button
        className={cn(baseClasses, className)}
        style={mergedStyle}
        {...buttonProps}
      >
        {children}
      </button>
    );
  }

  const { as: _, ...anchorProps } = props as AnchorProps;
  return (
    <a
      className={cn(baseClasses, className)}
      style={mergedStyle}
      {...anchorProps}
    >
      {children}
    </a>
  );
}
