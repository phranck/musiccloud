import {
  type ControlSize,
  ControlTrigger,
  DashboardInput,
  ListboxOption,
  ListboxPopover,
} from "@musiccloud/dashboard-ui";
import { CaretDownIcon, CaretUpIcon } from "@phosphor-icons/react";
import { type KeyboardEvent, useCallback, useEffect, useRef, useState } from "react";

/** One choice a {@link Dropdown} offers. */
export interface DropdownOption<T extends string = string> {
  /** What choosing it hands to `onChange`. */
  value: T;
  /** What the reader sees, in the list and in the trigger. A search matches against it. */
  label: string;
  /** An icon in front of the label, or none, the default. */
  icon?: React.ReactNode;
  /** A count shown after the label when it is above zero, or none, the default. */
  count?: number;
}

/** Props of {@link Dropdown}. */
interface DropdownProps<T extends string = string> {
  /** The chosen value. */
  value: T;
  /** Receives the value the reader chose. */
  onChange: (value: T) => void;
  /** The choices, in the order they are listed. */
  options: DropdownOption<T>[];
  /** A visible label above the trigger, or none, the default. */
  label?: string;
  /** Classes for the wrapper around the label and the trigger. */
  className?: string;
  /** Trigger size. "sm" matches compact dense controls; "md" (default) uses the standard field control height. */
  size?: "sm" | "md";
  /**
   * Menu alignment. "start", the default, anchors the menu to the trigger's
   * left edge so it grows rightward, which is safe when options are wider than
   * the trigger. "end" anchors it to the right edge so it grows leftward, for a
   * trigger near the viewport's right edge.
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
  /**
   * Whether the list opens with a search field above it, as lmaa.space's
   * searchable combobox does. Typing keeps the options whose label contains
   * what was typed, ignoring case and surrounding spaces, and the arrow keys,
   * Enter and Escape work from the field. Off by default, for a list short
   * enough to read whole.
   */
  searchable?: boolean;
  /**
   * The search field's placeholder, and its accessible name. Without one, the
   * field shows no placeholder and is named after `aria-label` or `label`. Read
   * only with `searchable`.
   */
  searchPlaceholder?: string;
  /**
   * Whether the trigger is at least as wide as its widest option, so it keeps
   * one width whichever option is chosen, as lmaa.space's `minWidthFromOptions`
   * does. Off by default, and then the trigger fills the width it is given.
   */
  minWidthFromOptions?: boolean;
}

/**
 * Keeps the options whose label contains the search, ignoring case and
 * surrounding spaces.
 *
 * @param options - Every option.
 * @param query - What was typed into the search field.
 * @returns The matching options in their order, or every option for an empty search.
 */
function filterOptions<T extends string>(options: DropdownOption<T>[], query: string): DropdownOption<T>[] {
  const needle = query.trim().toLowerCase();
  if (!needle) return options;
  return options.filter((option) => option.label.toLowerCase().includes(needle));
}

/** Props of {@link WidestLabel}. */
interface WidestLabelProps<T extends string> {
  /** The chosen option, or `undefined` when none matches the value. */
  current: DropdownOption<T> | undefined;
  /** Every option, whose labels set the width. */
  options: DropdownOption<T>[];
  /** What stands in for no choice, which counts toward the width too, or none. */
  placeholder: string | undefined;
}

/**
 * The trigger's label, laid over every other option's label when the trigger
 * takes its width from the options.
 *
 * Every label sits in the same grid cell, and all but the shown one are
 * invisible and hidden from assistive technology, so the cell is as wide as
 * the widest of them and the browser does the measuring. Nothing runs when the
 * options change.
 *
 * @param props - See {@link WidestLabelProps}.
 * @returns The label.
 */
function WidestLabel<T extends string>({ current, options, placeholder }: WidestLabelProps<T>) {
  return (
    <span className="grid flex-1 text-left">
      {options.map((option) => (
        <span
          key={option.value}
          aria-hidden={option !== current}
          className={`col-start-1 row-start-1 whitespace-nowrap ${option === current ? "" : "invisible"}`}
        >
          {option.label}
        </span>
      ))}
      {placeholder && (
        <span
          aria-hidden={current !== undefined}
          className={`col-start-1 row-start-1 whitespace-nowrap text-[var(--ds-text-subtle)] ${current ? "invisible" : ""}`}
        >
          {placeholder}
        </span>
      )}
    </span>
  );
}

/**
 * A button that opens a list of choices below it, the dashboard's one select.
 *
 * It opens with the arrow keys, Enter or Space, moves through the list with
 * the arrows, chooses with Enter or Space, and closes with Escape or a click
 * outside, handing focus back to the trigger. With `searchable` the list opens
 * with a search field that narrows it. With `minWidthFromOptions` the trigger
 * keeps the width of its widest option.
 *
 * @param props - See {@link DropdownProps}.
 * @returns The dropdown.
 */
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
  searchable = false,
  searchPlaceholder,
  minWidthFromOptions = false,
}: DropdownProps<T>) {
  const [open, setOpen] = useState(false);
  const [highlightIndex, setHighlightIndex] = useState(-1);
  const [query, setQuery] = useState("");
  const ref = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);

  const visibleOptions = searchable ? filterOptions(options, query) : options;

  useEffect(() => {
    function handleOutside(event: MouseEvent) {
      if (ref.current && !ref.current.contains(event.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleOutside);
    return () => document.removeEventListener("mousedown", handleOutside);
  }, []);

  /** Opens the list with an empty search and the chosen option highlighted. */
  const openDropdown = useCallback(() => {
    setQuery("");
    setHighlightIndex(options.findIndex((option) => option.value === value));
    setOpen(true);
  }, [options, value]);

  /** Closes the list and puts focus back on the trigger, where the reader started. */
  const closeDropdown = useCallback(() => {
    setOpen(false);
    triggerRef.current?.focus();
  }, []);

  /** Opens a closed list and closes an open one, as a click on the trigger does. */
  const toggleDropdown = useCallback(() => {
    if (open) {
      setOpen(false);
      return;
    }
    openDropdown();
  }, [open, openDropdown]);

  /**
   * Hands a choice to the caller and closes the list.
   *
   * @param chosen - The value chosen.
   */
  const selectOption = useCallback(
    (chosen: T) => {
      onChange(chosen);
      closeDropdown();
    },
    [onChange, closeDropdown],
  );

  /** Chooses the highlighted option, when one is highlighted. */
  const selectHighlighted = useCallback(() => {
    const highlighted = visibleOptions[highlightIndex];
    if (highlighted) selectOption(highlighted.value);
  }, [visibleOptions, highlightIndex, selectOption]);

  /**
   * Handles a key pressed while the list is open, from the trigger or from the
   * search field.
   *
   * @param event - The key event.
   */
  const handleOpenKey = useCallback(
    (event: KeyboardEvent) => {
      const count = visibleOptions.length;
      switch (event.key) {
        case "ArrowDown":
          event.preventDefault();
          if (count > 0) setHighlightIndex((index) => (index + 1) % count);
          break;
        case "ArrowUp":
          event.preventDefault();
          if (count > 0) setHighlightIndex((index) => (index - 1 + count) % count);
          break;
        case "Enter":
          event.preventDefault();
          selectHighlighted();
          break;
        case "Escape":
          event.preventDefault();
          closeDropdown();
          break;
      }
    },
    [visibleOptions.length, selectHighlighted, closeDropdown],
  );

  /**
   * Handles a key pressed on the trigger: opens a closed list, and in an open
   * one also chooses with Space, which the search field needs for typing.
   *
   * @param event - The key event.
   */
  const handleTriggerKeyDown = useCallback(
    (event: KeyboardEvent) => {
      if (!open) {
        if (event.key === "ArrowDown" || event.key === "ArrowUp" || event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          openDropdown();
        }
        return;
      }
      if (event.key === " ") {
        event.preventDefault();
        selectHighlighted();
        return;
      }
      handleOpenKey(event);
    },
    [open, openDropdown, selectHighlighted, handleOpenKey],
  );

  const current = options.find((option) => option.value === value);
  const controlSize = (size === "sm" ? "compact" : "field") satisfies ControlSize;

  return (
    <div className={`flex flex-col gap-1${className ? ` ${className}` : ""}`}>
      {label && (
        <span className="text-xs font-semibold text-[var(--ds-text-subtle)] uppercase tracking-wider">{label}</span>
      )}
      <div ref={ref} className="relative">
        <ControlTrigger
          ref={triggerRef}
          controlSize={controlSize}
          onClick={toggleDropdown}
          onKeyDown={handleTriggerKeyDown}
          open={open}
          aria-haspopup="listbox"
          aria-expanded={open}
          aria-label={ariaLabel ?? label}
        >
          {current?.icon && <span className="shrink-0">{current.icon}</span>}
          {minWidthFromOptions ? (
            <WidestLabel current={current} options={options} placeholder={placeholder} />
          ) : (
            <span className="flex-1 text-left whitespace-nowrap overflow-hidden text-ellipsis">
              {current ? (
                current.label
              ) : placeholder ? (
                <span className="text-[var(--ds-text-subtle)]">{placeholder}</span>
              ) : null}
            </span>
          )}
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
            {searchable && (
              <div className="border-b border-[var(--ds-border-subtle)] px-2 pb-2">
                <DashboardInput
                  // The list was opened to search it, so the field takes the focus at once.
                  autoFocus
                  aria-label={searchPlaceholder ?? ariaLabel ?? label}
                  placeholder={searchPlaceholder}
                  value={query}
                  onChange={(event) => {
                    const nextQuery = event.currentTarget.value;
                    setQuery(nextQuery);
                    setHighlightIndex(filterOptions(options, nextQuery).length > 0 ? 0 : -1);
                  }}
                  onKeyDown={handleOpenKey}
                />
              </div>
            )}
            {visibleOptions.map(({ value: optionValue, label: optionLabel, icon, count }, index) => (
              <ListboxOption
                key={optionValue}
                active={index === highlightIndex}
                controlSize={controlSize}
                onClick={() => selectOption(optionValue)}
                onMouseEnter={() => setHighlightIndex(index)}
                selected={value === optionValue}
              >
                {icon && <span className="shrink-0">{icon}</span>}
                <span className="whitespace-nowrap">{optionLabel}</span>
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
