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
}

export function Dropdown<T extends string = string>({ value, onChange, options, label, className }: DropdownProps<T>) {
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

  return (
    <div className={`flex flex-col gap-1${className ? ` ${className}` : ""}`}>
      {label && (
        <span className="text-xs font-semibold text-[var(--ds-text-subtle)] uppercase tracking-wider">{label}</span>
      )}
      <div ref={ref} className="relative">
        <button
          type="button"
          onClick={toggleDropdown}
          onKeyDown={handleKeyDown}
          aria-haspopup="listbox"
          aria-expanded={open}
          aria-label={label}
          className="w-full h-9 px-3 flex items-center gap-2 rounded-control border border-[var(--ds-border)] bg-[var(--ds-input-bg)] text-sm text-[var(--ds-text)] hover:border-[var(--ds-border-strong)] transition-colors whitespace-nowrap"
        >
          {current?.icon && <span className="shrink-0">{current.icon}</span>}
          <span className="flex-1 text-left whitespace-nowrap overflow-hidden text-ellipsis">{current?.label}</span>
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
        </button>
        {open && (
          <div
            role="listbox"
            tabIndex={-1}
            className="absolute z-20 right-0 mt-1 py-1 min-w-full w-max bg-[var(--ds-surface)] border border-[var(--ds-border)] rounded-xl shadow-lg overflow-hidden"
          >
            {options.map(({ value: v, label: l, icon, count }, index) => (
              <button
                role="option"
                key={v}
                aria-selected={value === v}
                type="button"
                onClick={() => selectOption(v)}
                onMouseEnter={() => setHighlightIndex(index)}
                className={`w-full h-8 flex items-center gap-2 px-3 text-sm transition-colors whitespace-nowrap ${
                  value === v
                    ? "bg-[var(--ds-nav-active-bg)] text-[var(--ds-nav-active-text)] font-medium"
                    : index === highlightIndex
                      ? "bg-[var(--ds-surface-hover)] text-[var(--ds-text)]"
                      : "text-[var(--ds-text)] hover:bg-[var(--ds-surface-hover)]"
                }`}
              >
                {icon && <span className="shrink-0">{icon}</span>}
                <span className="whitespace-nowrap">{l}</span>
                {typeof count === "number" && count > 0 && (
                  <span className="ml-auto shrink-0 rounded-full bg-[var(--ds-surface-hover)] px-2 py-0.5 text-xs font-semibold text-[var(--ds-text-muted)]">
                    {count}
                  </span>
                )}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
