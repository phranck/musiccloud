import { cn } from "@/lib/utils";
import { embossedStyle } from "@/styles/neumorphic";

export { embossedStyle };

const baseClasses = [
  "embossed-gradient-border bg-white/[0.07] px-5 py-2.5 overflow-hidden cursor-pointer",
  "transition-all duration-150",
  "hover:bg-white/[0.10] hover:scale-[1.015] hover:shadow-[0_0_16px_var(--embossed-glow,rgba(255,255,255,0.15))]",
  "focus-visible:bg-white/[0.10] focus-visible:scale-[1.015] focus-visible:shadow-[0_0_16px_var(--embossed-glow,rgba(255,255,255,0.15))]",
  "active:scale-[0.985]",
];

type AnchorProps = React.AnchorHTMLAttributes<HTMLAnchorElement> & { as?: "a" };
type ButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> & { as: "button" };

type EmbossedButtonProps = (AnchorProps | ButtonProps) & {
  children: React.ReactNode;
  className?: string;
  hasInnerShadow?: boolean;
};

/**
 * A button/link with a raised/embossed appearance matching EmbossedCard.
 *
 * Renders as `<a>` by default. Pass `as="button"` for a `<button>` element.
 * No default border-radius -- the caller must set it.
 */
/** CSS filter value to apply on SVG icons inside an EmbossedButton with hasInnerShadow. */
export const iconInnerShadow = "url(#icon-inset)";

const InnerShadowFilter = () => (
  <svg className="absolute w-0 h-0 overflow-hidden" aria-hidden="true">
    <defs>
      <filter id="icon-inset">
        <feFlood floodColor="black" floodOpacity="0.7" />
        <feComposite operator="out" in2="SourceGraphic" />
        <feMorphology operator="dilate" radius="0.5" />
        <feGaussianBlur stdDeviation="0.8" />
        <feOffset dx="1" dy="1" />
        <feComposite operator="atop" in2="SourceGraphic" />
      </filter>
    </defs>
  </svg>
);

export function EmbossedButton({ children, className, style, hasInnerShadow, ...props }: EmbossedButtonProps) {
  const mergedStyle = { ...embossedStyle, ...style };

  if ("as" in props && props.as === "button") {
    const { as: _, ...buttonProps } = props as ButtonProps;
    return (
      <button className={cn(baseClasses, className)} style={mergedStyle} {...buttonProps}>
        {hasInnerShadow && <InnerShadowFilter />}
        {children}
      </button>
    );
  }

  const { as: _, ...anchorProps } = props as AnchorProps;
  return (
    <a className={cn(baseClasses, className)} style={mergedStyle} {...anchorProps}>
      {hasInnerShadow && <InnerShadowFilter />}
      {children}
    </a>
  );
}
