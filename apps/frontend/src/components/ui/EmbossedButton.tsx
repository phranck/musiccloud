import { cn } from "@/lib/utils";
import { recessedStyle } from "@/styles/neumorphic";

const baseClasses = ["bg-white/[0.03] px-5 py-2.5 overflow-hidden cursor-pointer", "transition-all duration-150"];

const raisedInteractionClasses = [
  "hover:bg-white/[0.10] hover:scale-[1.015]",
  "focus-visible:bg-white/[0.10] focus-visible:scale-[1.015]",
  "active:scale-[0.985]",
];

type AnchorProps = React.AnchorHTMLAttributes<HTMLAnchorElement> & { as?: "a" };
type ButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> & { as: "button" };

type EmbossedButtonProps = (AnchorProps | ButtonProps) & {
  children: React.ReactNode;
  className?: string;
  hasInnerShadow?: boolean;
  /** When true, render as a latched/pressed-in button (recessed look, no hover scale). */
  pressed?: boolean;
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

export function EmbossedButton({
  children,
  className,
  style,
  hasInnerShadow,
  pressed = false,
  ...props
}: EmbossedButtonProps) {
  const surfaceClass = pressed ? "recessed-gradient-border" : "embossed-gradient-border";
  const mergedClassName = cn(surfaceClass, baseClasses, !pressed && raisedInteractionClasses, className);
  const mergedStyle: React.CSSProperties = pressed ? { ...recessedStyle, ...style } : (style ?? {});

  if ("as" in props && props.as === "button") {
    const { as: _, ...buttonProps } = props as ButtonProps;
    return (
      <button className={mergedClassName} style={mergedStyle} {...buttonProps}>
        {hasInnerShadow && <InnerShadowFilter />}
        {children}
      </button>
    );
  }

  const { as: _, ...anchorProps } = props as AnchorProps;
  return (
    <a className={mergedClassName} style={mergedStyle} {...anchorProps}>
      {hasInnerShadow && <InnerShadowFilter />}
      {children}
    </a>
  );
}
