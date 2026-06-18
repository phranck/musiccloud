import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DayNightMode, getDayNightMode, setDayNightMode } from "@/components/background/dayNightMode";
import { DayNightSwitcher } from "@/components/navigation/DayNightSwitcher";
import { LocaleProvider } from "@/i18n/context";
import { SkySignal, sendMusicSignal } from "@/lib/analytics/umami";
import { createLocalStorageMock } from "@/test/localStorageMock";

/**
 * Contract of the header day-night switcher: a collapse-by-default
 * `VerticalSegmentedControl` that reads/writes the shared `dayNightMode` store.
 * Collapsed it exposes ONLY the active mode (the other cells are removed from the
 * accessibility tree); clicking the active icon opens the list, and choosing a
 * mode writes the store + fires the analytics signal once. The background
 * reaction lives in BackgroundScene.test.tsx.
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
  // Pin Night as the active mode so every test (incl. the first) has a known
  // collapsed trigger; the store is module-level and otherwise leaks its default.
  setDayNightMode(DayNightMode.Night);
  vi.mocked(sendMusicSignal).mockClear();
});

afterEach(() => {
  // Reset the module-level store so no test leaks its mode.
  setDayNightMode(DayNightMode.Night);
  vi.unstubAllGlobals();
});

describe("DayNightSwitcher", () => {
  it("collapsed exposes only the active mode; opening reveals all four", () => {
    renderSwitcher();
    // Night is the default active mode → the only non-inert cell while collapsed.
    expect(screen.getByRole("button", { name: "Night" })).not.toHaveAttribute("inert");
    expect(screen.getByRole("button", { name: "Day" })).toHaveAttribute("inert");
    // Click the active trigger to open → every mode cell becomes active (not inert).
    fireEvent.click(screen.getByRole("button", { name: "Night" }));
    for (const label of ["Day", "Night", "System", "Automatic"]) {
      expect(screen.getByRole("button", { name: label })).not.toHaveAttribute("inert");
    }
  });

  it("selects a mode: store updated, signal sent once", () => {
    renderSwitcher();
    fireEvent.click(screen.getByRole("button", { name: "Night" })); // open
    fireEvent.click(screen.getByRole("button", { name: "Day" })); // select

    expect(getDayNightMode()).toBe(DayNightMode.Day);
    expect(sendMusicSignal).toHaveBeenCalledExactlyOnceWith(SkySignal.Day);
  });

  it("sends no signal when re-selecting the active mode", () => {
    renderSwitcher();
    fireEvent.click(screen.getByRole("button", { name: "Night" })); // open
    fireEvent.click(screen.getByRole("button", { name: "Night" })); // re-select active

    expect(sendMusicSignal).not.toHaveBeenCalled();
    expect(getDayNightMode()).toBe(DayNightMode.Night);
  });

  it("auto-collapses 5s after opening when nothing is clicked", () => {
    vi.useFakeTimers();
    try {
      renderSwitcher();
      fireEvent.click(screen.getByRole("button", { name: "Night" })); // open
      expect(screen.getByRole("button", { name: "Day" })).not.toHaveAttribute("inert");
      act(() => {
        vi.advanceTimersByTime(5000);
      });
      // No selection within 5s → the list collapses on its own.
      expect(screen.getByRole("button", { name: "Day" })).toHaveAttribute("inert");
      expect(getDayNightMode()).toBe(DayNightMode.Night);
    } finally {
      vi.useRealTimers();
    }
  });

  it("keeps the list open while hovered, then auto-collapses after the pointer leaves", () => {
    vi.useFakeTimers();
    try {
      renderSwitcher();
      fireEvent.click(screen.getByRole("button", { name: "Night" })); // open
      // The control container owns the hover handlers (parent of the track).
      const container = document.querySelector(".mc-glass-seg-track")?.parentElement;
      if (!container) throw new Error("control container not found");

      // Pointer resting on the control pauses the idle countdown.
      fireEvent.pointerEnter(container);
      act(() => {
        vi.advanceTimersByTime(5000);
      });
      expect(screen.getByRole("button", { name: "Day" })).not.toHaveAttribute("inert");

      // Once it leaves, the full 5s countdown resumes and collapses the list.
      fireEvent.pointerLeave(container);
      act(() => {
        vi.advanceTimersByTime(5000);
      });
      expect(screen.getByRole("button", { name: "Day" })).toHaveAttribute("inert");
    } finally {
      vi.useRealTimers();
    }
  });
});
