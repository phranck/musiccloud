import { type ControlSize, ControlTrigger, ListboxOption, ListboxPopover } from "@musiccloud/dashboard-ui";
import { CaretDownIcon, CaretUpIcon } from "@phosphor-icons/react";
import { useCallback, useEffect, useRef, useState } from "react";

export interface DropdownOption<T extends string = string> {
  value: T;
  label: string;
  icon?: React.ReactNode;
  count?: number;
}

interface DropdownProps<T extends string = string> {
  value: T;
  onChange: (value: T) => void;
  options: DropdownOption<T>[];
  label?: string;
  className?: string;
  /** Trigger size. "sm" matches compact dense controls; "md" (default) uses the standard field control height. */
  size?: "sm" | "md";
  /**
   * Menu alignment. "start" anchors the menu to the trigger's left edge so it
   * grows rightward (default — safe when options are wider than the trigger).
   * "end" anchors to the right edge and grows leftward (use when the trigger
   * sits near the viewport's right edge).
   */
  align?: "start" | "end";
  /** Shown in the trigger when no option matches `value` (e.g. value=""). */
  placeholder?: string;
  /**
   * Accessible name for the trigger when no visible `label` is rendered
   * (e.g. the surrounding form already provides its own label element).
   * Falls back to `label`.
   */
  "aria-label"?: string;
}

export function Dropdown<T extends string = string>({
  value,
  onChange,
  options,
  label,
  className,
  size = "md",
  align = "start",
  placeholder,
  "aria-label": ariaLabel,
}: DropdownProps<T>) {
  const [open, setOpen] = useState(false);
  const [highlightIndex, setHighlightIndex] = useState(-1);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleOutside);
    return () => document.removeEventListener("mousedown", handleOutside);
  }, []);

  const openDropdown = useCallback(() => {
    setHighlightIndex(options.findIndex((o) => o.value === value));
    setOpen(true);
  }, [options, value]);

  const toggleDropdown = useCallback(() => {
    setOpen((prev) => {
      if (!prev) setHighlightIndex(options.findIndex((o) => o.value === value));
      return !prev;
    });
  }, [options, value]);

  const selectOption = useCallback(
    (v: T) => {
      onChange(v);
      setOpen(false);
    },
    [onChange],
  );

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (!open) {
        if (e.key === "ArrowDown" || e.key === "ArrowUp" || e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          openDropdown();
        }
        return;
      }

      switch (e.key) {
        case "ArrowDown":
          e.preventDefault();
          setHighlightIndex((i) => (i + 1) % options.length);
          break;
        case "ArrowUp":
          e.preventDefault();
          setHighlightIndex((i) => (i - 1 + options.length) % options.length);
          break;
        case "Enter":
        case " ":
          e.preventDefault();
          if (highlightIndex >= 0 && highlightIndex < options.length) {
            selectOption(options[highlightIndex].value);
          }
          break;
        case "Escape":
          e.preventDefault();
          setOpen(false);
          break;
      }
    },
    [open, options, highlightIndex, selectOption, openDropdown],
  );

  const current = options.find((o) => o.value === value);
  const controlSize = (size === "sm" ? "compact" : "field") satisfies ControlSize;

  return (
    <div className={`flex flex-col gap-1${className ? ` ${className}` : ""}`}>
      {label && (
        <span className="text-xs font-semibold text-[var(--ds-text-subtle)] uppercase tracking-wider">{label}</span>
      )}
      <div ref={ref} className="relative">
        <ControlTrigger
          controlSize={controlSize}
          onClick={toggleDropdown}
          onKeyDown={handleKeyDown}
          open={open}
          aria-haspopup="listbox"
          aria-expanded={open}
          aria-label={ariaLabel ?? label}
        >
          {current?.icon && <span className="shrink-0">{current.icon}</span>}
          <span className="flex-1 text-left whitespace-nowrap overflow-hidden text-ellipsis">
            {current ? (
              current.label
            ) : placeholder ? (
              <span className="text-[var(--ds-text-subtle)]">{placeholder}</span>
            ) : null}
          </span>
          {typeof current?.count === "number" && current.count > 0 && (
            <span className="shrink-0 rounded-full bg-[var(--ds-surface-hover)] px-2 py-0.5 text-xs font-semibold text-[var(--ds-text-muted)]">
              {current.count}
            </span>
          )}
          {open ? (
            <CaretUpIcon weight="duotone" aria-hidden="true" className="h-4 w-4 shrink-0 text-[var(--ds-text-muted)]" />
          ) : (
            <CaretDownIcon
              weight="duotone"
              aria-hidden="true"
              className="h-4 w-4 shrink-0 text-[var(--ds-text-muted)]"
            />
          )}
        </ControlTrigger>
        {open && (
          <ListboxPopover align={align}>
            {options.map(({ value: v, label: l, icon, count }, index) => (
              <ListboxOption
                key={v}
                active={index === highlightIndex}
                controlSize={controlSize}
                onClick={() => selectOption(v)}
                onMouseEnter={() => setHighlightIndex(index)}
                selected={value === v}
              >
                {icon && <span className="shrink-0">{icon}</span>}
                <span className="whitespace-nowrap">{l}</span>
                {typeof count === "number" && count > 0 && (
                  <span className="ml-auto shrink-0 rounded-full bg-[var(--ds-surface-hover)] px-2 py-0.5 text-xs font-semibold text-[var(--ds-text-muted)]">
                    {count}
                  </span>
                )}
              </ListboxOption>
            ))}
          </ListboxPopover>
        )}
      </div>
    </div>
  );
}
