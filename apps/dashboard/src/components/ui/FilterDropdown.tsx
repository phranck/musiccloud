import { useEffect, useRef } from "react";

import { Dropdown, type DropdownOption } from "@/components/ui/Dropdown";

interface FilterDropdownProps<T extends string = string> {
  value: T;
  onChange: (value: T) => void;
  options: DropdownOption<T>[];
  storageKey?: string;
  className?: string;
}

export function FilterDropdown<T extends string = string>({
  value,
  onChange,
  options,
  storageKey,
  className,
}: FilterDropdownProps<T>) {
  const restoredRef = useRef(false);

  useEffect(() => {
    if (restoredRef.current || !storageKey) return;
    restoredRef.current = true;
    try {
      const stored = window.localStorage.getItem(storageKey);
      if (!stored) return;
      const hasStoredValue = options.some((option) => option.value === stored);
      if (!hasStoredValue) {
        window.localStorage.removeItem(storageKey);
        return;
      }
      if (stored !== value) onChange(stored as T);
    } catch {}
  }, [onChange, options, storageKey, value]);

  useEffect(() => {
    if (!storageKey) return;
    try {
      const hasValue = options.some((option) => option.value === value);
      if (!hasValue) {
        window.localStorage.removeItem(storageKey);
        return;
      }
      window.localStorage.setItem(storageKey, value);
    } catch {}
  }, [options, storageKey, value]);

  return <Dropdown value={value} onChange={onChange} options={options} className={className ?? "w-52"} />;
}
