import { CaretDown as CaretDownIcon, CaretUp as CaretUpIcon, Check as CheckIcon, X as XIcon, XCircle as XCircleIcon } from "@phosphor-icons/react";
import * as React from "react";
import { createPortal } from "react-dom";

function cn(...classes: (string | false | null | undefined)[]): string {
  return classes.filter(Boolean).join(" ");
}

type BadgeVariant = "default" | "secondary" | "destructive" | "inverted";

const badgeStyles: Record<BadgeVariant, string> = {
  default: "border-transparent bg-[var(--color-primary)] text-white",
  secondary: "border-[var(--ds-border)] bg-[var(--ds-bg-elevated)] text-[var(--ds-text)]",
  destructive: "border-transparent bg-red-500 text-white",
  inverted: "border-[var(--ds-border)] bg-[var(--ds-surface)] text-[var(--ds-text)]",
};

function badgeClass(variant: BadgeVariant = "secondary"): string {
  return `inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium transition-colors ${badgeStyles[variant]}`;
}

export interface MultiSelectOption {
  label: string;
  value: string;
  icon?: React.ComponentType<{ className?: string }>;
  disabled?: boolean;
  style?: React.CSSProperties;
}

export interface MultiSelectMessages {
  selectAll: string;
  clearAllAriaLabel: string;
  clearSelectionAriaLabel: string;
  moreSelected: (count: number) => string;
}

export interface MultiSelectProps {
  options: MultiSelectOption[];
  value: string[];
  onValueChange: (value: string[]) => void;
  messages: MultiSelectMessages;
  variant?: BadgeVariant;
  placeholder?: string;
  maxCount?: number;
  className?: string;
  error?: string;
}

export function MultiSelect({
  options,
  value,
  onValueChange,
  messages,
  variant = "secondary",
  placeholder,
  maxCount = 3,
  className,
  error,
}: MultiSelectProps) {
  const [isOpen, setIsOpen] = React.useState(false);
  const [dropdownRect, setDropdownRect] = React.useState<DOMRect | null>(null);
  const triggerRef = React.useRef<HTMLButtonElement>(null);
  const dropdownRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      const target = e.target as Node;
      if (!triggerRef.current?.contains(target) && !dropdownRef.current?.contains(target)) {
        setIsOpen(false);
      }
    }
    if (isOpen) document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, [isOpen]);

  React.useEffect(() => {
    function onEsc(e: KeyboardEvent) {
      if (e.key === "Escape") {
        e.stopPropagation();
        setIsOpen(false);
      }
    }
    if (isOpen) window.addEventListener("keydown", onEsc, true);
    return () => window.removeEventListener("keydown", onEsc, true);
  }, [isOpen]);

  function handleToggle() {
    if (!isOpen && triggerRef.current) {
      setDropdownRect(triggerRef.current.getBoundingClientRect());
    }
    setIsOpen((prev) => !prev);
  }

  function toggleOption(optionValue: string) {
    const next = value.includes(optionValue)
      ? value.filter((v) => v !== optionValue)
      : [...value, optionValue];
    onValueChange(next);
  }

  function handleToggleAll() {
    const all = options.map((o) => o.value);
    if (value.length === options.length) {
      onValueChange([]);
    } else {
      onValueChange(all);
    }
  }

  function clearExtraOptions() {
    onValueChange(value.slice(0, maxCount));
  }

  function handleTriggerClick(e: React.MouseEvent<HTMLButtonElement>) {
    const target = e.target as HTMLElement;
    const removeValue = target.closest<HTMLElement>("[data-remove-value]")?.dataset.removeValue;

    if (removeValue) {
      e.stopPropagation();
      toggleOption(removeValue);
      return;
    }

    if (target.closest("[data-clear-extra]")) {
      e.stopPropagation();
      clearExtraOptions();
      return;
    }

    if (target.closest("[data-clear-all]")) {
      e.stopPropagation();
      onValueChange([]);
      return;
    }

    handleToggle();
  }

  const allSelected = options.length > 0 && value.length === options.length;

  const dropdown =
    isOpen && dropdownRect
      ? createPortal(
          <div
            ref={dropdownRef}
            style={{
              position: "fixed",
              top: dropdownRect.bottom + 4,
              left: dropdownRect.left,
              width: dropdownRect.width,
              zIndex: 9999,
              backgroundColor: "var(--ds-surface)",
            }}
            className="border border-[var(--ds-border)] rounded-control shadow-lg overflow-hidden"
          >
            <div style={{ maxHeight: "300px", overflowY: "auto" }}>
              <button
                type="button"
                onClick={handleToggleAll}
                className="w-full flex items-center gap-3 px-3 py-1.5 text-sm text-left transition-colors outline-none hover:bg-[var(--ds-bg-elevated)]"
              >
                <span
                  className={cn(
                    "w-4 h-4 shrink-0 flex items-center justify-center rounded border transition-colors",
                    allSelected
                      ? "bg-[var(--color-primary)] border-[var(--color-primary)]"
                      : "border-[var(--ds-border-strong)] opacity-50",
                  )}
                >
                  {allSelected && <CheckIcon className="h-2.5 w-2.5 text-white" weight="bold" />}
                </span>
                <span className="text-[var(--ds-text)]">{messages.selectAll}</span>
              </button>

              {options.map((opt) => {
                const isSelected = value.includes(opt.value);
                return (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => toggleOption(opt.value)}
                    disabled={opt.disabled}
                    style={opt.style}
                    className={cn(
                      "w-full flex items-center gap-3 px-3 py-1.5 text-sm text-left transition-colors outline-none hover:bg-[var(--ds-bg-elevated)]",
                      isSelected ? "text-[var(--ds-text)]" : "text-[var(--ds-text-muted)]",
                      opt.disabled && "opacity-50 cursor-not-allowed",
                    )}
                  >
                    <span
                      className={cn(
                        "w-4 h-4 shrink-0 flex items-center justify-center rounded border transition-colors",
                        isSelected
                          ? "bg-[var(--color-primary)] border-[var(--color-primary)]"
                          : "border-[var(--ds-border-strong)]",
                      )}
                    >
                      {isSelected && <CheckIcon className="h-2.5 w-2.5 text-white" weight="bold" />}
                    </span>
                    {opt.icon && <opt.icon className="h-4 w-4 text-[var(--ds-text-muted)]" />}
                    {opt.label}
                  </button>
                );
              })}
            </div>
          </div>,
          document.body,
        )
      : null;

  return (
    <div className="relative">
      <button
        ref={triggerRef}
        type="button"
        onClick={handleTriggerClick}
        className={cn(
          "w-full flex items-center justify-between px-3 py-1.5 border rounded-control text-sm text-left transition-colors [&_svg]:pointer-events-auto",
          isOpen
            ? "border-[var(--color-primary)] ring-2 ring-[var(--color-primary)]/20"
            : error
              ? "border-[var(--ds-btn-danger-border)]"
              : "border-[var(--ds-border)] hover:border-[var(--ds-border-strong)]",
          className,
        )}
        style={{ backgroundColor: "var(--ds-surface)" }}
      >
        {value.length > 0 ? (
          <div className="flex flex-wrap items-center gap-1 flex-1 min-w-0">
            {value.slice(0, maxCount).map((val) => {
              const opt = options.find((o) => o.value === val);
              if (!opt) return null;
              return (
                <span key={val} className={badgeClass(variant)} style={opt.style}>
                  {opt.icon && <opt.icon className="h-3 w-3" />}
                  {opt.label}
                  <span
                    data-remove-value={val}
                    className="cursor-pointer text-current opacity-60 hover:opacity-100"
                    aria-label={messages.clearSelectionAriaLabel}
                  >
                    <XCircleIcon className="h-3 w-3" />
                  </span>
                </span>
              );
            })}
            {value.length > maxCount && (
              <span
                data-clear-extra="true"
                className={`${badgeClass(variant)} cursor-pointer`}
              >
                {messages.moreSelected(value.length - maxCount)}
                <XCircleIcon className="h-3 w-3 opacity-60" />
              </span>
            )}
          </div>
        ) : (
          <span className="text-[var(--ds-text-subtle)]">{placeholder ?? ""}</span>
        )}

        <div className="flex items-center shrink-0 ml-2 gap-0.5">
          {value.length > 0 && (
            <>
              <span
                data-clear-all="true"
                className="cursor-pointer text-[var(--ds-text-subtle)] hover:text-[var(--ds-text)] p-0.5"
                aria-label={messages.clearAllAriaLabel}
              >
                <XIcon className="h-3.5 w-3.5" />
              </span>
              <div className="w-px h-4 bg-[var(--ds-border)] mx-0.5" />
            </>
          )}
          {isOpen ? (
            <CaretUpIcon weight="duotone" className="h-4 w-4 mx-0.5 text-[var(--ds-text-subtle)]" />
          ) : (
            <CaretDownIcon weight="duotone" className="h-4 w-4 mx-0.5 text-[var(--ds-text-subtle)]" />
          )}
        </div>
      </button>

      {dropdown}

      {error && <p className="text-[var(--ds-danger-text)] text-xs mt-1.5">{error}</p>}
    </div>
  );
}
