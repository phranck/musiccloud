import { CalendarBlankIcon, CaretLeftIcon, CaretRightIcon, DotIcon } from "@phosphor-icons/react";
import { type ReactNode, useEffect, useRef, useState } from "react";
import { DayPicker } from "react-day-picker";
import { ControlTrigger } from "../primitives/ControlTrigger.js";
import { FieldShell } from "../primitives/FieldPrimitives.js";
import { DashboardActionId } from "./actionCatalog.js";
import { DashboardActionButton } from "./DashboardActionButton.js";

/** How a day is written in a value: `YYYY-MM-DD`, captured as year, month and day. */
const DAY_VALUE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;

/** How many digits a month or a day takes in a value: 2. */
const DAY_PART_DIGITS = 2;

/** The week starts on Monday in the calendar, as in lmaa.space's day picker: 1. */
const WEEK_STARTS_ON_MONDAY = 1;

/** The key that closes the open calendar: `Escape`. */
const ESCAPE_KEY = "Escape";

/**
 * How many days the calendar lets the reader choose.
 *
 * - `Single`: one day, the only mode this field uses. Choosing the chosen day
 *   again empties it, because the mode is not marked required.
 */
const DayPickerMode = {
  Single: "single",
} as const;

/**
 * Writes a day for the trigger, such as `Aug 01, 2026`, the English format of
 * lmaa.space's day picker. Made once, because formatting through a new
 * formatter on every render builds one each time.
 */
const DAY_DISPLAY_FORMAT = new Intl.DateTimeFormat("en-US", { day: "2-digit", month: "short", year: "numeric" });

/** Props of {@link DashboardDatePicker}. */
export interface DashboardDatePickerProps {
  /** The trigger's id, which the label points at. */
  id: string;
  /** The chosen day as `YYYY-MM-DD`, or the empty string for none. */
  value: string;
  /** Receives the chosen day as `YYYY-MM-DD`, or the empty string once it is emptied. */
  onChange: (value: string) => void;
  /** What the trigger shows while no day is chosen. */
  placeholder: string;
  /**
   * The caption of the action that empties the day. With one, the action
   * stands at the right edge of the open calendar while a day is chosen, as
   * lmaa.space's `clearable` picker has it, for a field where an empty day
   * means something, such as a window with no end. Without one, the default,
   * a chosen day can only be replaced.
   */
  clearLabel?: string;
  /** A visible label above the trigger, or none, the default. */
  label?: ReactNode;
  /** A line of help under the trigger, or none, the default. */
  hint?: ReactNode;
  /** Classes for the field around the label, the trigger and the hint. */
  fieldClassName?: string;
}

/**
 * Reads a value into the day it names, in local time.
 *
 * @param value - A day as `YYYY-MM-DD`, or anything else.
 * @returns The day at local midnight, or `undefined` for an empty or unreadable value.
 */
function parseDay(value: string): Date | undefined {
  const match = DAY_VALUE_PATTERN.exec(value);
  if (!match) return undefined;
  const [, year, month, day] = match;
  const parsed = new Date(Number(year), Number(month) - 1, Number(day));
  return Number.isNaN(parsed.getTime()) ? undefined : parsed;
}

/**
 * Writes a day as a value.
 *
 * @param day - The day, read in local time.
 * @returns The day as `YYYY-MM-DD`.
 */
function formatDay(day: Date): string {
  const month = String(day.getMonth() + 1).padStart(DAY_PART_DIGITS, "0");
  const date = String(day.getDate()).padStart(DAY_PART_DIGITS, "0");
  return `${day.getFullYear()}-${month}-${date}`;
}

/**
 * The calendar's arrows, in the dashboard's icon family.
 *
 * @param props.orientation - Which way the arrow points; anything but left or right shows a dot.
 * @returns The icon.
 */
function CalendarChevron({ orientation }: { orientation?: "up" | "down" | "left" | "right" }) {
  if (orientation === "left") return <CaretLeftIcon weight="bold" className="size-3.5" />;
  if (orientation === "right") return <CaretRightIcon weight="bold" className="size-3.5" />;
  return <DotIcon className="size-3.5" />;
}

/** The ring a focused calendar control shows, the one a focused field shows, never the browser's. */
const CALENDAR_FOCUS_CLASS = "focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ds-focus-ring)]";

/** The calendar's parts, styled through the dashboard's tokens as lmaa.space's day picker styles them. */
const CALENDAR_CLASS_NAMES = {
  root: "rdp-root",
  months: "rdp-months",
  month_caption: "rdp-month-caption flex items-center justify-between mb-2",
  caption_label: "text-sm font-semibold text-[var(--ds-text)]",
  nav: "rdp-nav flex items-center gap-0.5",
  button_previous: `rdp-btn p-1 rounded-control hover:bg-[var(--ds-surface-hover)] text-[var(--ds-text-muted)] hover:text-[var(--ds-text)] ${CALENDAR_FOCUS_CLASS}`,
  button_next: `rdp-btn p-1 rounded-control hover:bg-[var(--ds-surface-hover)] text-[var(--ds-text-muted)] hover:text-[var(--ds-text)] ${CALENDAR_FOCUS_CLASS}`,
  weekdays: "rdp-weekdays",
  weekday:
    "h-[var(--ds-control-h-field)] w-[var(--ds-control-h-field-large)] text-xs font-semibold text-[var(--ds-text-subtle)] uppercase",
  week: "rdp-week",
  day: "size-[var(--ds-control-h-field-large)] text-center text-sm",
  day_button: `flex size-[var(--ds-control-h-field-large)] items-center justify-center rounded-full text-[var(--ds-text)] hover:bg-[var(--ds-surface-hover)] ${CALENDAR_FOCUS_CLASS}`,
  today: "font-bold",
  selected: "[&>button]:bg-[var(--color-primary)] [&>button]:text-white [&>button]:hover:bg-[var(--color-primary)]",
  outside: "text-[var(--ds-text-subtle)] opacity-40",
  disabled: "opacity-30 cursor-not-allowed",
};

/**
 * A field that asks for one day, ported from lmaa.space's day picker
 * (`DateTimePicker` with `mode="date"`).
 *
 * The trigger shows the chosen day, such as `Aug 01, 2026`, or the placeholder,
 * and opens a calendar below it whose weeks start on Monday. Choosing a day
 * hands it on and leaves the calendar open, and choosing the chosen day again
 * empties it, as in lmaa. A click outside closes the calendar, and so does
 * Escape, which hands focus back to the trigger. With `clearLabel` the
 * calendar ends in an action that empties the day and closes it.
 *
 * It is one control rather than a compound, because no caller varies its
 * inner parts. It lives in the shared package so the admin dashboard and the
 * developer portal ask for a day the same way.
 *
 * @param props - See {@link DashboardDatePickerProps}.
 * @returns The field.
 */
export function DashboardDatePicker({
  id,
  value,
  onChange,
  placeholder,
  clearLabel,
  label,
  hint,
  fieldClassName,
}: DashboardDatePickerProps) {
  const [open, setOpen] = useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const selected = parseDay(value);

  // While the calendar is open, a click outside the field closes it, and so
  // does Escape, which also hands focus back to the trigger.
  useEffect(() => {
    if (!open) return;
    function handleOutside(event: MouseEvent) {
      if (wrapperRef.current && !wrapperRef.current.contains(event.target as Node)) setOpen(false);
    }
    function handleEscape(event: KeyboardEvent) {
      if (event.key !== ESCAPE_KEY) return;
      event.preventDefault();
      setOpen(false);
      triggerRef.current?.focus();
    }
    document.addEventListener("mousedown", handleOutside);
    document.addEventListener("keydown", handleEscape);
    return () => {
      document.removeEventListener("mousedown", handleOutside);
      document.removeEventListener("keydown", handleEscape);
    };
  }, [open]);

  return (
    <FieldShell className={fieldClassName} label={label} labelHtmlFor={id} hint={hint}>
      <div ref={wrapperRef} className="relative">
        <ControlTrigger
          ref={triggerRef}
          id={id}
          aria-haspopup="dialog"
          aria-expanded={open}
          open={open}
          onClick={() => setOpen((current) => !current)}
        >
          <CalendarBlankIcon weight="duotone" aria-hidden="true" className="size-4 shrink-0" />
          <span className={`flex-1 text-left ${selected ? "" : "text-[var(--ds-text-subtle)]"}`}>
            {selected ? DAY_DISPLAY_FORMAT.format(selected) : placeholder}
          </span>
        </ControlTrigger>
        {open && (
          // The dialog is non-modal, so the page stays usable around it. The
          // classes undo the browser's dialog box, which centers it with a
          // margin and stretches it between both inline edges.
          <dialog
            open
            aria-labelledby={id}
            className="absolute left-0 right-auto z-20 mx-0 mb-0 mt-1 w-max max-w-none rounded-xl border border-[var(--ds-border)] bg-[var(--ds-surface)] p-3 text-[var(--ds-text)] shadow-lg"
          >
            <DayPicker
              mode={DayPickerMode.Single}
              selected={selected}
              onSelect={(day) => onChange(day ? formatDay(day) : "")}
              weekStartsOn={WEEK_STARTS_ON_MONDAY}
              showOutsideDays
              classNames={CALENDAR_CLASS_NAMES}
              components={{ Chevron: CalendarChevron }}
            />
            {clearLabel && selected && (
              <div className="mt-2 pt-2 flex justify-end border-t border-[var(--ds-border)]">
                <DashboardActionButton
                  action={DashboardActionId.Remove}
                  label={clearLabel}
                  size="control"
                  type="button"
                  onClick={() => {
                    onChange("");
                    setOpen(false);
                    triggerRef.current?.focus();
                  }}
                />
              </div>
            )}
          </dialog>
        )}
      </div>
    </FieldShell>
  );
}
