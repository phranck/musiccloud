import { ContentContext, type ContentContextMask, NavigationArea, type NavigationAreaMask } from "@musiccloud/shared";
import type { ReactNode } from "react";

import {
  NavigationMaskKind,
  type NavigationMaskKind as NavigationMaskKindValue,
} from "@/features/content/navigation/navigation.constants";
import { Checkbox } from "@/shared/ui/Checkbox";

const MASK_OPTIONS = {
  [NavigationMaskKind.Context]: [
    { bit: ContentContext.Frontend, label: "Frontend" },
    { bit: ContentContext.DeveloperPortal, label: "Developer Portal" },
  ],
  [NavigationMaskKind.Area]: [
    { bit: NavigationArea.Main, label: "Main" },
    { bit: NavigationArea.Footer, label: "Footer" },
  ],
} as const;

type NavigationMaskValue = ContentContextMask | NavigationAreaMask;

interface NavigationMaskOptionProps {
  bit: number;
  checked: boolean;
  disabled: boolean;
  label: ReactNode;
  onChange: (enabled: boolean) => void;
}

function NavigationMaskOption({ bit: _bit, checked, disabled, label, onChange }: NavigationMaskOptionProps) {
  return <Checkbox checked={checked} disabled={disabled} label={label} onChange={onChange} />;
}

export interface NavigationMaskControlProps {
  "aria-label"?: string;
  kind: NavigationMaskKindValue;
  value: NavigationMaskValue;
  disabledMask?: number;
  labels?: Partial<Record<number, ReactNode>>;
  onChange: (value: NavigationMaskValue) => void;
}

/**
 * Edits one non-empty context or area mask. The final active bit and every
 * bit selected through `disabledMask` remain immutable.
 */
export function NavigationMaskControl({
  "aria-label": ariaLabel,
  kind,
  value,
  disabledMask = 0,
  labels,
  onChange,
}: NavigationMaskControlProps) {
  return (
    <fieldset
      className="m-0 flex flex-wrap items-center gap-[var(--ds-space-base)] border-0 p-0"
      aria-label={ariaLabel ?? `${kind} placements`}
    >
      {MASK_OPTIONS[kind].map(({ bit, label }) => {
        const checked = (value & bit) === bit;
        const finalActiveBit = checked && value === bit;
        return (
          <NavigationMaskOption
            key={bit}
            bit={bit}
            checked={checked}
            disabled={finalActiveBit || (disabledMask & bit) === bit}
            label={labels?.[bit] ?? label}
            onChange={(enabled) => {
              const nextValue = enabled ? value | bit : value & ~bit;
              if (nextValue !== 0) onChange(nextValue);
            }}
          />
        );
      })}
    </fieldset>
  );
}
