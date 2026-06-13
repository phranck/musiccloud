import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DayNightMode, getDayNightMode, setDayNightMode } from "@/components/background/dayNightMode";
import { DayNightSwitcher } from "@/components/navigation/DayNightSwitcher";
import { LocaleProvider } from "@/i18n/context";
import { SkySignal, sendMusicSignal } from "@/lib/analytics/umami";
import { createLocalStorageMock } from "@/test/localStorageMock";

/**
 * Contract of the header day-night switcher (plan MC-030 Task 4): a dropdown
 * after the LanguageSwitcher pattern that reads/writes the shared
 * `dayNightMode` store. The background reaction lives in
 * BackgroundScene.test.tsx — here only the UI wiring is pinned: store sync
 * on the trigger, the four entries, selection → store + analytics signal,
 * and the no-signal guard on re-selecting the active mode.
 */

vi.mock("@/lib/analytics/umami", async (importOriginal) => {
  const original = await importOriginal<typeof import("@/lib/analytics/umami")>();
  return { ...original, sendMusicSignal: vi.fn() };
});

/** English UI labels (the test locale below pins `en`). */
const TRIGGER_LABEL_NIGHT = "Background mode: Night";
const TRIGGER_LABEL_DAY = "Background mode: Day";

function renderSwitcher() {
  return render(
    <LocaleProvider initialLocale="en">
      <DayNightSwitcher />
    </LocaleProvider>,
  );
}

beforeEach(() => {
  vi.stubGlobal("localStorage", createLocalStorageMock());
  vi.mocked(sendMusicSignal).mockClear();
});

afterEach(() => {
  // Reset the module-level store so no test leaks its mode.
  setDayNightMode(DayNightMode.Night);
  vi.unstubAllGlobals();
});

describe("DayNightSwitcher", () => {
  it("shows the stored mode on the trigger button", () => {
    setDayNightMode(DayNightMode.Day);
    renderSwitcher();
    expect(screen.getByLabelText(TRIGGER_LABEL_DAY)).toBeInTheDocument();
  });

  it("opens the menu with all four mode entries", () => {
    renderSwitcher();
    const trigger = screen.getByLabelText(TRIGGER_LABEL_NIGHT);
    expect(trigger).toHaveAttribute("aria-expanded", "false");

    fireEvent.click(trigger);
    expect(trigger).toHaveAttribute("aria-expanded", "true");
    for (const label of ["Day", "Night", "System", "Automatic"]) {
      expect(screen.getByText(label)).toBeInTheDocument();
    }
  });

  it("selects a mode: store updated, signal sent, menu closed", () => {
    renderSwitcher();
    fireEvent.click(screen.getByLabelText(TRIGGER_LABEL_NIGHT));
    fireEvent.click(screen.getByText("Day"));

    expect(getDayNightMode()).toBe(DayNightMode.Day);
    expect(sendMusicSignal).toHaveBeenCalledExactlyOnceWith(SkySignal.Day);
    // The trigger reflects the new mode; the menu is gone.
    expect(screen.getByLabelText(TRIGGER_LABEL_DAY)).toBeInTheDocument();
    expect(screen.queryByText("System")).toBeNull();
  });

  it("sends no signal when re-selecting the active mode", () => {
    renderSwitcher();
    fireEvent.click(screen.getByLabelText(TRIGGER_LABEL_NIGHT));
    fireEvent.click(screen.getByText("Night"));

    expect(sendMusicSignal).not.toHaveBeenCalled();
    expect(screen.queryByText("Day")).toBeNull(); // menu still closes
  });
});
