import type { ComponentPropsWithoutRef } from "react";

import { cx } from "../classNames.js";
import type { ControlSize } from "./ListboxPrimitives.js";
import { controlTriggerSizeClass } from "./listboxClasses.js";

export interface ControlTriggerProps extends ComponentPropsWithoutRef<"button"> {
  controlSize?: ControlSize;
  open?: boolean;
}

export function ControlTrigger({
  children,
  className,
  controlSize = "field",
  open,
  type = "button",
  ...buttonProps
}: ControlTriggerProps) {
  return (
    <button
      {...buttonProps}
      type={type}
      className={cx(
        "flex w-full items-center gap-2 rounded-control border border-[var(--ds-border)] bg-[var(--ds-form-control-bg,var(--ds-input-bg))] text-[var(--ds-text)] transition-colors whitespace-nowrap hover:border-[var(--ds-border-strong)] focus:outline-none focus:border-[var(--ds-border-focus)] focus:ring-2 focus:ring-[var(--ds-focus-ring)] disabled:cursor-not-allowed disabled:opacity-[var(--ds-control-disabled-opacity)]",
        controlTriggerSizeClass[controlSize],
        open && "border-[var(--ds-border-focus)] ring-2 ring-[var(--ds-focus-ring)]",
        className,
      )}
    >
      {children}
    </button>
  );
}
