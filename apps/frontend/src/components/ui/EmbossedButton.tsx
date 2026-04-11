import { cn } from "@/lib/utils";
import { embossedStyle } from "@/styles/neumorphic";

export { embossedStyle };

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
      <button className={cn(baseClasses, className)} style={mergedStyle} {...buttonProps}>
        {children}
      </button>
    );
  }

  const { as: _, ...anchorProps } = props as AnchorProps;
  return (
    <a className={cn(baseClasses, className)} style={mergedStyle} {...anchorProps}>
      {children}
    </a>
  );
}
