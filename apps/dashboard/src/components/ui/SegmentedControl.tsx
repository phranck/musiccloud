import { DashboardSegmentedControl } from "@musiccloud/dashboard-ui";
import type { ReactNode } from "react";

interface SegmentOption<T extends string> {
  badge?: ReactNode;
  icon?: ReactNode;
  label?: ReactNode;
  value: T;
}

interface SegmentedControlProps<T extends string> {
  onChange: (value: T) => void;
  options: readonly SegmentOption<T>[];
  storageKey?: string;
  value: T;
}

/**
 * Dashboard segmented control wrapper with optional localStorage restore.
 *
 * @typeParam T - Literal union of option values.
 * @param props - Options, current value, storage key and selection callback.
 * @returns Segmented toggle component.
 */
export function SegmentedControl<T extends string>({ onChange, options, storageKey, value }: SegmentedControlProps<T>) {
  function handleValueChange(nextValue: T) {
    try {
      if (storageKey && typeof window !== "undefined") {
        window.localStorage.setItem(storageKey, nextValue);
      }
    } catch (error) {
      void error;
    }
    onChange(nextValue);
  }

  return <DashboardSegmentedControl onValueChange={handleValueChange} options={options} value={value} />;
}
