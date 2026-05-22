import type { ControlSize } from "./ListboxPrimitives.js";

export const controlTriggerSizeClass: Record<ControlSize, string> = {
  compact: "h-7 px-2 text-xs",
  field: "h-[var(--ds-control-h-field)] px-3 text-sm",
  large: "h-[var(--ds-control-h-field-large)] px-4 text-sm",
};

export const listboxOptionSizeClass: Record<ControlSize, string> = {
  compact: "h-7 px-2 text-xs",
  field: "min-h-[var(--ds-control-h-menu-item)] px-3 py-1.5 text-sm",
  large: "min-h-[var(--ds-control-h-field-large)] px-4 py-2 text-sm",
};
