import { MoonStarsIcon, SunIcon } from "@phosphor-icons/react";

import { SegmentedControl } from "@/components/ui/SegmentedControl";

/** Selectable colour schemes — light or dark, no system option. */
export type ColorSchemeOption = "light" | "dark";

const ALL_OPTIONS = [
  { value: "light" as const, icon: <SunIcon weight="duotone" className="w-3.5 h-3.5" /> },
  { value: "dark" as const, icon: <MoonStarsIcon weight="duotone" className="w-3.5 h-3.5" /> },
] as const;

interface ColorSchemeSegmentedControlProps {
  value: ColorSchemeOption;
  onChange: (v: ColorSchemeOption) => void;
  storageKey?: string;
}

/**
 * Light/dark segmented toggle. Generic colour-scheme picker used by the
 * e-mail-template preview to switch the rendered preview between light and
 * dark recipient clients. Not tied to any application-wide theme.
 *
 * @param value - Currently selected colour scheme.
 * @param onChange - Invoked with the newly selected scheme.
 * @param storageKey - Optional persistence key forwarded to the underlying control.
 */
export function ColorSchemeSegmentedControl({ value, onChange, storageKey }: ColorSchemeSegmentedControlProps) {
  return <SegmentedControl value={value} onChange={onChange} options={ALL_OPTIONS} storageKey={storageKey} />;
}
