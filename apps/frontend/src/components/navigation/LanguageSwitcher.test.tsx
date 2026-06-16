import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { LanguageSwitcher } from "@/components/navigation/LanguageSwitcher";
import { LocaleProvider } from "@/i18n/context";
import { languageSignal, sendMusicSignal } from "@/lib/analytics/umami";
import { createLocalStorageMock } from "@/test/localStorageMock";

/**
 * Contract of the header language switcher: an icon-only
 * `EmbossedSegmentedControl` that reads/writes the shared `LocaleProvider`
 * context. Only the UI wiring is pinned here: both persistently visible
 * segments, selection → locale change + analytics signal, and the no-signal
 * guard on re-selecting the active locale.
 *
 * Each segment is icon-only, so its accessible name comes from the segment's
 * `aria-label` (the translated language name) and is queried via `getByRole`.
 * The provider starts at `en`, so the German segment is the inactive target and
 * the English segment is the active one used for the no-signal guard.
 */

vi.mock("@/lib/analytics/umami", async (importOriginal) => {
  const original = await importOriginal<typeof import("@/lib/analytics/umami")>();
  return { ...original, sendMusicSignal: vi.fn() };
});

function renderSwitcher() {
  return render(
    <LocaleProvider initialLocale="en">
      <LanguageSwitcher />
    </LocaleProvider>,
  );
}

beforeEach(() => {
  vi.stubGlobal("localStorage", createLocalStorageMock());
  vi.mocked(sendMusicSignal).mockClear();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("LanguageSwitcher", () => {
  it("renders both locale segments, persistently visible", () => {
    renderSwitcher();
    for (const label of ["English", "Deutsch"]) {
      expect(screen.getByRole("button", { name: label })).toBeInTheDocument();
    }
  });

  it("selects a locale: signal sent once, both segments stay visible", () => {
    renderSwitcher();
    fireEvent.click(screen.getByRole("button", { name: "Deutsch" }));

    expect(sendMusicSignal).toHaveBeenCalledExactlyOnceWith(languageSignal("de"));
    // Both segments remain visible after selection.
    expect(screen.getByRole("button", { name: "English" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Deutsch" })).toBeInTheDocument();
  });

  it("sends no signal when re-selecting the active locale", () => {
    renderSwitcher();
    fireEvent.click(screen.getByRole("button", { name: "English" }));

    expect(sendMusicSignal).not.toHaveBeenCalled();
  });
});
