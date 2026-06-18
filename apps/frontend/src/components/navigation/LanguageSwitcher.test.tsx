import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { LanguageSwitcher } from "@/components/navigation/LanguageSwitcher";
import { LocaleProvider } from "@/i18n/context";
import { languageSignal, sendMusicSignal } from "@/lib/analytics/umami";
import { createLocalStorageMock } from "@/test/localStorageMock";

/**
 * Contract of the header language switcher: a collapse-by-default
 * `VerticalSegmentedControl` that reads/writes the shared `LocaleProvider`
 * context. Collapsed it exposes ONLY the active locale (the other cell is removed
 * from the accessibility tree); clicking the active icon opens the list, and
 * choosing a locale changes it + fires the analytics signal once.
 *
 * Each segment is icon-only, so its accessible name comes from the segment's
 * `aria-label` (the translated language name) and is queried via `getByRole`. The
 * provider starts at `en`, so English is the active cell and German is the
 * inactive target revealed on open.
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
  it("collapsed exposes only the active locale; opening reveals both", () => {
    renderSwitcher();
    // English is the active locale → the only non-inert cell while collapsed.
    expect(screen.getByRole("button", { name: "English" })).not.toHaveAttribute("inert");
    expect(screen.getByRole("button", { name: "Deutsch" })).toHaveAttribute("inert");
    // Click the active trigger to open → both locale cells become active (not inert).
    fireEvent.click(screen.getByRole("button", { name: "English" }));
    for (const label of ["English", "Deutsch"]) {
      expect(screen.getByRole("button", { name: label })).not.toHaveAttribute("inert");
    }
  });

  it("selects a locale: signal sent once", () => {
    renderSwitcher();
    fireEvent.click(screen.getByRole("button", { name: "English" })); // open
    fireEvent.click(screen.getByRole("button", { name: "Deutsch" })); // select

    expect(sendMusicSignal).toHaveBeenCalledExactlyOnceWith(languageSignal("de"));
  });

  it("sends no signal when re-selecting the active locale", () => {
    renderSwitcher();
    fireEvent.click(screen.getByRole("button", { name: "English" })); // open
    fireEvent.click(screen.getByRole("button", { name: "English" })); // re-select active

    expect(sendMusicSignal).not.toHaveBeenCalled();
  });
});
