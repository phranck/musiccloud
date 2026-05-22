import type { ComponentPropsWithoutRef } from "react";

import { cx } from "../classNames.js";
import type { ListboxPopoverAlign } from "./ListboxPrimitives.js";

export interface ListboxPopoverProps extends ComponentPropsWithoutRef<"div"> {
  align?: ListboxPopoverAlign;
}

export function ListboxPopover({
  align = "start",
  children,
  className,
  role = "listbox",
  tabIndex = -1,
  ...divProps
}: ListboxPopoverProps) {
  return (
    <div
      {...divProps}
      role={role}
      tabIndex={tabIndex}
      className={cx(
        "absolute z-20 mt-1 min-w-full w-max overflow-hidden rounded-xl border border-[var(--ds-border)] bg-[var(--ds-surface)] py-1 shadow-lg",
        align === "end" ? "right-0" : "left-0",
        className,
      )}
    >
      {children}
    </div>
  );
}
