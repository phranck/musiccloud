import type { ComponentPropsWithoutRef, ReactNode, Ref } from "react";

import { getButtonPrimitiveClassName, getIconButtonPrimitiveClassName } from "./buttonPrimitiveClasses.js";

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
