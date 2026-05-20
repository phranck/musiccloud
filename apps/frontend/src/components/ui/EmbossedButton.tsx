import { recessedControlInset, recessedSurfaceRadius } from "@/components/cards/cardGeometry";
import { cn } from "@/lib/utils";

const CONTROL_RADIUS_BASE = `max(4px, calc(var(--mc-recessed-radius-base, ${recessedSurfaceRadius}) - var(--mc-recessed-padding, ${recessedControlInset})))`;
const CONTROL_RADIUS_SM = `max(4px, calc(var(--mc-recessed-radius-sm, var(--mc-recessed-radius-base, ${recessedSurfaceRadius})) - var(--mc-recessed-padding, ${recessedControlInset})))`;

const controlRadiusStyle = {
  "--neu-radius-base": CONTROL_RADIUS_BASE,
  "--neu-radius-sm": CONTROL_RADIUS_SM,
  // The old play button blueprint used the inset control shadow as its visible border.
  // Keep the gradient-border layer present for API compatibility, but neutral by default.
  "--neu-light": "transparent",
  "--neu-shadow": "transparent",
  borderRadius: "var(--neu-radius)",
} as React.CSSProperties;

const baseClasses = [
  "mc-raised-control bg-[#1f242f] px-5 py-2.5 overflow-hidden cursor-pointer transform-gpu",
  "transition-[background-color,transform] duration-100",
  "disabled:cursor-not-allowed disabled:opacity-50",
  "focus-visible:outline-2 focus-visible:outline-white/40 focus-visible:outline-offset-2",
];

const raisedHoverClasses = ["hover:bg-[#283040]", "focus-visible:bg-[#283040]"];

const raisedScaleClasses = ["hover:scale-[1.015]", "focus-visible:scale-[1.015]", "active:scale-[0.985]"];

type AnchorProps = React.AnchorHTMLAttributes<HTMLAnchorElement> & { as?: "a" };
type ButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> & { as: "button" };

type EmbossedButtonProps = (AnchorProps | ButtonProps) & {
  children: React.ReactNode;
  className?: string;
  /** When true, render as a latched/pressed-in button (recessed look, no hover scale). */
  pressed?: boolean;
  /** When true, disable the hover/active scale transition. */
  noScale?: boolean;
};

/**
 * A button/link with the raised control appearance used inside recessed button wells.
 *
 * Renders as `<a>` by default. Pass `as="button"` for a `<button>` element.
 * Corner radii default to the surrounding `RecessedCard` radius minus its padding.
 */

export function EmbossedButton({
  children,
  className,
  style,
  pressed = false,
  noScale = false,
  ...props
}: EmbossedButtonProps) {
  const surfaceClass = pressed ? "recessed-gradient-border" : "embossed-gradient-border";
  const mergedClassName = cn(
    surfaceClass,
    baseClasses,
    pressed && "mc-raised-control-pressed",
    !pressed && raisedHoverClasses,
    !pressed && !noScale && raisedScaleClasses,
    className,
  );
  const mergedStyle: React.CSSProperties = { ...controlRadiusStyle, ...style };

  if ("as" in props && props.as === "button") {
    const { as: _, ...buttonProps } = props as ButtonProps;
    return (
      <button className={mergedClassName} style={mergedStyle} {...buttonProps}>
        {children}
      </button>
    );
  }

  const { as: _, ...anchorProps } = props as AnchorProps;
  return (
    <a className={mergedClassName} style={mergedStyle} {...anchorProps}>
      {children}
    </a>
  );
}
