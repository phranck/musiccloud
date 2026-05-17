import type { ComponentPropsWithoutRef } from "react";

import { cx } from "../classNames.js";

export type ControlSize = "compact" | "field" | "large";
export type ListboxPopoverAlign = "start" | "end";

export interface ControlTriggerProps extends ComponentPropsWithoutRef<"button"> {
  controlSize?: ControlSize;
  open?: boolean;
}

export interface ListboxPopoverProps extends ComponentPropsWithoutRef<"div"> {
  align?: ListboxPopoverAlign;
}

export interface ListboxOptionProps extends ComponentPropsWithoutRef<"button"> {
  active?: boolean;
  controlSize?: ControlSize;
  selected?: boolean;
}

const controlTriggerSizeClass: Record<ControlSize, string> = {
  compact: "h-7 px-2 text-xs",
  field: "h-[var(--ds-control-h-field)] px-3 text-sm",
  large: "h-[var(--ds-control-h-field-large)] px-4 text-sm",
};

const listboxOptionSizeClass: Record<ControlSize, string> = {
  compact: "h-7 px-2 text-xs",
  field: "min-h-[var(--ds-control-h-menu-item)] px-3 py-1.5 text-sm",
  large: "min-h-[var(--ds-control-h-field-large)] px-4 py-2 text-sm",
};

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
