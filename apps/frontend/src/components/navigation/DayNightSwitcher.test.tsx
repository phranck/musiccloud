import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DayNightMode, getDayNightMode, setDayNightMode } from "@/components/background/dayNightMode";
import { DayNightSwitcher } from "@/components/navigation/DayNightSwitcher";
import { LocaleProvider } from "@/i18n/context";
import { SkySignal, sendMusicSignal } from "@/lib/analytics/umami";
import { createLocalStorageMock } from "@/test/localStorageMock";

/**
 * Contract of the header day-night switcher (plan MC-030 Task 4): an icon-only
 * `EmbossedSegmentedControl` that reads/writes the shared `dayNightMode` store.
 * The background reaction lives in BackgroundScene.test.tsx — here only the UI
 * wiring is pinned: the four persistently visible segments, selection → store +
 * analytics signal, and the no-signal guard on re-selecting the active mode.
 *
 * Each segment is icon-only, so its accessible name comes from the segment's
 * `aria-label` (the translated mode label) and is queried via `getByRole`.
 */

vi.mock("@/lib/analytics/umami", async (importOriginal) => {
  const original = await importOriginal<typeof import("@/lib/analytics/umami")>();
  return { ...original, sendMusicSignal: vi.fn() };
});

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
  it("renders all four mode segments, persistently visible", () => {
    renderSwitcher();
    for (const label of ["Day", "Night", "System", "Automatic"]) {
      expect(screen.getByRole("button", { name: label })).toBeInTheDocument();
    }
  });

  it("selects a mode: store updated, signal sent once", () => {
    renderSwitcher();
    fireEvent.click(screen.getByRole("button", { name: "Day" }));

    expect(getDayNightMode()).toBe(DayNightMode.Day);
    expect(sendMusicSignal).toHaveBeenCalledExactlyOnceWith(SkySignal.Day);
    // All segments remain visible after selection.
    expect(screen.getByRole("button", { name: "System" })).toBeInTheDocument();
  });

  it("sends no signal when re-selecting the active mode", () => {
    renderSwitcher();
    fireEvent.click(screen.getByRole("button", { name: "Night" }));

    expect(sendMusicSignal).not.toHaveBeenCalled();
    expect(getDayNightMode()).toBe(DayNightMode.Night);
  });
});
