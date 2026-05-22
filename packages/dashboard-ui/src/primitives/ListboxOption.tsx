import type { ComponentPropsWithoutRef } from "react";

import { cx } from "../classNames.js";
import type { ControlSize } from "./ListboxPrimitives.js";
import { listboxOptionSizeClass } from "./listboxClasses.js";

export interface ListboxOptionProps extends ComponentPropsWithoutRef<"button"> {
  active?: boolean;
  controlSize?: ControlSize;
  selected?: boolean;
}

export function ListboxOption({
  active,
  children,
  className,
  controlSize = "field",
  role = "option",
  selected,
  type = "button",
  ...buttonProps
}: ListboxOptionProps) {
  return (
    // biome-ignore lint/a11y/useAriaPropsSupportedByRole: this primitive renders a button as a listbox option; aria-selected is valid for role="option".
    <button
      {...buttonProps}
      aria-selected={selected}
      role={role}
      type={type}
      className={cx(
        "flex w-full items-center gap-2 whitespace-nowrap transition-colors",
        listboxOptionSizeClass[controlSize],
        selected
          ? "bg-[var(--ds-nav-active-bg)] text-[var(--ds-nav-active-text)] font-medium"
          : active
            ? "bg-[var(--ds-control-hover-bg)] text-[var(--ds-text)]"
            : "text-[var(--ds-text)] hover:bg-[var(--ds-control-hover-bg)]",
        className,
      )}
    >
      {children}
    </button>
  );
}
