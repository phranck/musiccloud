import type { ReactNode } from "react";

import { Checkbox } from "@/shared/ui/Checkbox";

interface PageContextOptionProps {
  checked: boolean;
  disabled?: boolean;
  label: ReactNode;
  onChange: (checked: boolean) => void;
}

export function PageContextOption({ checked, disabled = false, label, onChange }: PageContextOptionProps) {
  return <Checkbox checked={checked} disabled={disabled} label={label} onChange={onChange} />;
}
