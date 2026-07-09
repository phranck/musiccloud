import type { ReactNode } from "react";
import { FormLabel } from "@/shared/ui/FormPrimitives";
import { SwitchLabelPosition, SwitchStackAlign, stackAlignClass } from "./labeledSwitchLayout";
import { ToggleSwitch } from "./ToggleSwitch";

interface LabeledSwitchProps {
  /** The visible label rendered next to the switch. */
  label: ReactNode;
  /** Links the label to the switch (applied as the switch button `id`). Required for the label/switch association. */
  id: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
  disabled?: boolean;
  /** Accessible name for the switch. Defaults to `label` when it is a string. */
  ariaLabel?: string;
  /** Where the label sits relative to the switch. Defaults to `Top`. */
  labelPosition?: SwitchLabelPosition;
  /** For `Top`/`Bottom` only: how the label and switch align on the cross axis. Defaults to `Center`. */
  align?: SwitchStackAlign;
  /** Extra classes for the outer wrapper. */
  className?: string;
}

/**
 * A {@link ToggleSwitch} paired with a label in a configurable layout. The
 * label can sit to the `Left`, `Top`, `Right` or `Bottom` of the switch. When
 * the label is stacked above or below (`Top`/`Bottom`), the `align` prop
 * controls whether the label and switch are centered on their shared axis or
 * flush to the start/end edge. Horizontal layouts (`Left`/`Right`) keep the
 * label and switch vertically centered. This encapsulates the label-plus-switch
 * layout so call sites never re-implement it.
 */
export function LabeledSwitch({
  label,
  id,
  checked,
  onChange,
  disabled = false,
  ariaLabel,
  labelPosition = SwitchLabelPosition.Top,
  align = SwitchStackAlign.Center,
  className,
}: LabeledSwitchProps) {
  const stacked = labelPosition === SwitchLabelPosition.Top || labelPosition === SwitchLabelPosition.Bottom;
  const labelFirst = labelPosition === SwitchLabelPosition.Top || labelPosition === SwitchLabelPosition.Left;
  const layoutClass = stacked ? `flex flex-col gap-1 ${stackAlignClass[align]}` : "flex items-center gap-2";

  const labelNode = <FormLabel htmlFor={id}>{label}</FormLabel>;
  const switchNode = (
    <ToggleSwitch
      id={id}
      checked={checked}
      onChange={onChange}
      disabled={disabled}
      aria-label={ariaLabel ?? (typeof label === "string" ? label : undefined)}
    />
  );

  return (
    <div className={className ? `${layoutClass} ${className}` : layoutClass}>
      {labelFirst ? labelNode : switchNode}
      {labelFirst ? switchNode : labelNode}
    </div>
  );
}
