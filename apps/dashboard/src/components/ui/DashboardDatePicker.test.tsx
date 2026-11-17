import { DashboardDatePicker } from "@musiccloud/dashboard-ui";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/** The field's visible label, which also names its trigger. */
const LABEL = "From";

/** What the trigger shows while no day is chosen. */
const PLACEHOLDER = "Pick a date";

/** The caption of the action that empties the day. */
const CLEAR = "Clear";

/** The moment the calendar opens on: 2026-08-15, noon local time, so it shows August 2026. */
const NOW = new Date(2026, 7, 15, 12);

/**
 * Renders the picker.
 *
 * @param value - The chosen day, or the empty string.
 * @param clearLabel - The caption of the action that empties it, or none.
 * @returns The change handler.
 */
function renderPicker(value: string, clearLabel?: string) {
  const onChange = vi.fn();
  render(
    <DashboardDatePicker
      id="starts-at"
      label={LABEL}
      placeholder={PLACEHOLDER}
      clearLabel={clearLabel}
      value={value}
      onChange={onChange}
    />,
  );
  return onChange;
}

/** The trigger, found by its label. */
function trigger(): HTMLElement {
  return screen.getByRole("button", { name: LABEL });
}

describe("DashboardDatePicker", () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(NOW);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("shows the placeholder while no day is chosen", () => {
    renderPicker("");
    expect(trigger().textContent).toBe(PLACEHOLDER);
  });

  it("writes a chosen day as lmaa's day picker writes it", () => {
    renderPicker("2026-08-01");
    expect(trigger().textContent).toBe("Aug 01, 2026");
  });

  it("hands a picked day on as YYYY-MM-DD and leaves the calendar open", () => {
    const onChange = renderPicker("");
    fireEvent.click(trigger());

    const calendar = screen.getByRole("dialog");
    fireEvent.click(within(calendar).getByRole("button", { name: /August 22nd, 2026/ }));

    expect(onChange).toHaveBeenCalledWith("2026-08-22");
    expect(screen.queryByRole("dialog")).not.toBeNull();
  });

  it("empties the day and closes from the clear action, handing focus back", () => {
    const onChange = renderPicker("2026-08-01", CLEAR);
    fireEvent.click(trigger());

    fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: CLEAR }));

    expect(onChange).toHaveBeenCalledWith("");
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(document.activeElement).toBe(trigger());
  });

  it("offers no clear action without its caption", () => {
    renderPicker("2026-08-01");
    fireEvent.click(trigger());
    expect(within(screen.getByRole("dialog")).queryByRole("button", { name: CLEAR })).toBeNull();
  });

  it("offers no clear action while no day is chosen", () => {
    renderPicker("", CLEAR);
    fireEvent.click(trigger());
    expect(within(screen.getByRole("dialog")).queryByRole("button", { name: CLEAR })).toBeNull();
  });

  it("closes on Escape and hands focus back to the trigger", () => {
    renderPicker("");
    fireEvent.click(trigger());

    fireEvent.keyDown(screen.getByRole("dialog"), { key: "Escape" });

    expect(screen.queryByRole("dialog")).toBeNull();
    expect(document.activeElement).toBe(trigger());
  });

  it("closes on a click outside", () => {
    renderPicker("");
    fireEvent.click(trigger());

    fireEvent.mouseDown(document.body);

    expect(screen.queryByRole("dialog")).toBeNull();
  });
});
