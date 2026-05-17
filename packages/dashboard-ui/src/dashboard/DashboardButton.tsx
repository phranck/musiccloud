import type { ReactNode } from "react";

import { cx } from "../classNames.js";
import {
  ButtonPrimitive,
  type ButtonPrimitiveProps,
  type ButtonPrimitiveSize,
  type ButtonPrimitiveVariant,
  IconButtonPrimitive,
  type IconButtonPrimitiveProps,
} from "../primitives/ButtonPrimitive.js";

export type DashboardButtonVariant = ButtonPrimitiveVariant | "review";
export type DashboardButtonSize = ButtonPrimitiveSize;

export interface DashboardButtonProps extends Omit<ButtonPrimitiveProps, "variant"> {
  variant?: DashboardButtonVariant;
}

export interface DashboardIconButtonProps extends Omit<IconButtonPrimitiveProps, "variant"> {
  variant?: DashboardButtonVariant;
}

const reviewVariantClass =
  "border-[var(--ds-badge-review-text)]/30 text-[var(--ds-badge-review-text)] hover:border-[var(--ds-badge-review-text)]/50 hover:bg-[var(--ds-badge-review-bg)]";

function resolvePrimitiveVariant(variant: DashboardButtonVariant): ButtonPrimitiveVariant {
  return variant === "review" ? "neutral" : variant;
}

export function DashboardButton({
  className,
  size = "action",
  variant = "neutral",
  ...buttonProps
}: DashboardButtonProps) {
  return (
    <ButtonPrimitive
      {...buttonProps}
      size={size}
      variant={resolvePrimitiveVariant(variant)}
      className={cx(variant === "review" && reviewVariantClass, className)}
    />
  );
}

export function DashboardIconButton({
  className,
  size = "action",
  variant = "ghost",
  ...buttonProps
}: DashboardIconButtonProps) {
  return (
    <IconButtonPrimitive
      {...buttonProps}
      size={size}
      variant={resolvePrimitiveVariant(variant)}
      className={cx(variant === "review" && reviewVariantClass, className)}
    />
  );
}

export interface DashboardButtonIconProps {
  children: ReactNode;
}

export function DashboardButtonIcon({ children }: DashboardButtonIconProps) {
  return <span className="inline-flex size-3.5 shrink-0 items-center justify-center">{children}</span>;
}
