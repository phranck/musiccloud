import { DesktopIcon, MoonStarsIcon, SunIcon } from "@phosphor-icons/react";

import { SegmentedControl } from "@/components/ui/SegmentedControl";

export type ThemeOption = "light" | "dark" | "system";

const ALL_OPTIONS = [
  { value: "light" as const, icon: <SunIcon weight="duotone" className="w-3.5 h-3.5" /> },
  { value: "dark" as const, icon: <MoonStarsIcon weight="duotone" className="w-3.5 h-3.5" /> },
  { value: "system" as const, icon: <DesktopIcon weight="duotone" className="w-3.5 h-3.5" /> },
] as const;

interface ThemeSegmentedControlProps {
  value: ThemeOption;
  onChange: (v: ThemeOption) => void;
  options?: readonly ThemeOption[];
  storageKey?: string;
}

export function ThemeSegmentedControl({
  value,
  onChange,
  options,
  storageKey,
}: ThemeSegmentedControlProps) {
  const filtered = options ? ALL_OPTIONS.filter((o) => options.includes(o.value)) : ALL_OPTIONS;

  return (
    <SegmentedControl
      value={value}
      onChange={onChange}
      options={filtered}
      storageKey={storageKey}
    />
  );
}
