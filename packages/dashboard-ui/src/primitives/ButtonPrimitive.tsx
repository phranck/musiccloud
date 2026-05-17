import type { ComponentPropsWithoutRef, ReactNode, Ref } from "react";

import { cx } from "../classNames.js";

export type ButtonPrimitiveVariant =
  | "neutral"
  | "primary"
  | "success"
  | "warning"
  | "danger"
  | "filled"
  | "accent"
  | "ghost";

export type ButtonPrimitiveSize = "action" | "control" | "large";

export interface ButtonPrimitiveProps extends ComponentPropsWithoutRef<"button"> {
  variant?: ButtonPrimitiveVariant;
  size?: ButtonPrimitiveSize;
  leadingIcon?: ReactNode;
  ref?: Ref<HTMLButtonElement>;
  trailingIcon?: ReactNode;
}

export interface IconButtonPrimitiveProps extends Omit<ComponentPropsWithoutRef<"button">, "children"> {
  "aria-label"?: string;
  "aria-labelledby"?: string;
  children: ReactNode;
  ref?: Ref<HTMLButtonElement>;
  variant?: ButtonPrimitiveVariant;
  size?: ButtonPrimitiveSize;
}

export const buttonPrimitiveBaseClass =
  "inline-flex shrink-0 items-center justify-center rounded-control border font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-[var(--ds-focus-ring)] disabled:cursor-not-allowed disabled:opacity-[var(--ds-control-disabled-opacity)]";

export const buttonPrimitiveVariantClass: Record<ButtonPrimitiveVariant, string> = {
  neutral:
    "border-[var(--ds-btn-neutral-border)] text-[var(--ds-btn-neutral-text)] hover:border-[var(--ds-btn-neutral-hover-border)] hover:bg-[var(--ds-btn-neutral-hover-bg)]",
  primary:
    "border-[var(--ds-btn-primary-border)] text-[var(--ds-btn-primary-text)] hover:border-[var(--ds-btn-primary-hover-border)] hover:bg-[var(--ds-btn-primary-hover-bg)]",
  success:
    "border-[var(--ds-btn-success-border)] text-[var(--ds-btn-success-text)] hover:border-[var(--ds-btn-success-hover-border)] hover:bg-[var(--ds-btn-success-hover-bg)]",
  warning:
    "border-[var(--ds-btn-warning-border)] text-[var(--ds-btn-warning-text)] hover:border-[var(--ds-btn-warning-hover-border)] hover:bg-[var(--ds-btn-warning-hover-bg)]",
  danger:
    "border-[var(--ds-btn-danger-border)] text-[var(--ds-btn-danger-text)] hover:border-[var(--ds-btn-danger-hover-border)] hover:bg-[var(--ds-btn-danger-hover-bg)]",
  filled:
    "border-transparent bg-[var(--ds-btn-filled-bg)] text-[var(--ds-btn-filled-fg)] hover:bg-[var(--ds-btn-filled-hover)]",
  accent:
    "border-transparent bg-[var(--ds-btn-primary-bg)] text-[var(--ds-btn-primary-fg)] hover:bg-[var(--ds-btn-primary-hover)]",
  ghost:
    "border-transparent text-[var(--ds-text-muted)] hover:bg-[var(--ds-control-hover-bg)] hover:text-[var(--ds-text)]",
};

export const buttonPrimitiveSizeClass: Record<ButtonPrimitiveSize, string> = {
  action: "h-[var(--ds-control-h-action)] gap-1.5 px-3 text-xs",
  control: "h-[var(--ds-control-h-field)] gap-2 px-3 text-sm",
  large: "h-[var(--ds-control-h-field-large)] gap-2 px-4 text-sm",
};

export const iconButtonPrimitiveSizeClass: Record<ButtonPrimitiveSize, string> = {
  action: "size-[var(--ds-control-h-icon)] text-xs",
  control: "size-[var(--ds-control-h-field)] text-sm",
  large: "size-[var(--ds-control-h-field-large)] text-sm",
};

export function getButtonPrimitiveClassName({
  className,
  size = "action",
  variant = "neutral",
}: Pick<ButtonPrimitiveProps, "className" | "size" | "variant"> = {}) {
  return cx(buttonPrimitiveBaseClass, buttonPrimitiveSizeClass[size], buttonPrimitiveVariantClass[variant], className);
}

export function getIconButtonPrimitiveClassName({
  className,
  size = "action",
  variant = "ghost",
}: Pick<IconButtonPrimitiveProps, "className" | "size" | "variant"> = {}) {
  return cx(
    buttonPrimitiveBaseClass,
    iconButtonPrimitiveSizeClass[size],
    buttonPrimitiveVariantClass[variant],
    className,
  );
}

export function ButtonPrimitive({
  children,
  className,
  leadingIcon,
  ref,
  size = "action",
  trailingIcon,
  type = "button",
  variant = "neutral",
  ...buttonProps
}: ButtonPrimitiveProps) {
  return (
    <button
      {...buttonProps}
      ref={ref}
      type={type}
      className={getButtonPrimitiveClassName({ className, size, variant })}
    >
      {leadingIcon}
      {children}
      {trailingIcon}
    </button>
  );
}

export function IconButtonPrimitive({
  children,
  className,
  ref,
  size = "action",
  type = "button",
  variant = "ghost",
  ...buttonProps
}: IconButtonPrimitiveProps) {
  return (
    <button
      {...buttonProps}
      ref={ref}
      type={type}
      className={getIconButtonPrimitiveClassName({ className, size, variant })}
    >
      {children}
    </button>
  );
}
