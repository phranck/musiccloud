import { render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PageHeader } from "@/components/layout/PageHeader";
import { createLocalStorageMock } from "@/test/localStorageMock";

beforeEach(() => {
  vi.stubGlobal("localStorage", createLocalStorageMock());
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("PageHeader", () => {
  it.each([
    "en-US",
    "de-DE",
  ])("renders the same English-only controls under the %s browser language", (browserLanguage) => {
    vi.spyOn(window.navigator, "language", "get").mockReturnValue(browserLanguage);
    const { container } = render(<PageHeader />);

    expect(screen.queryByText("Commercial")).not.toBeInTheDocument();
    expect(screen.queryByText("Creative Commons")).not.toBeInTheDocument();
    expect(container.querySelector(".left-3")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Night" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "English" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Deutsch" })).not.toBeInTheDocument();
  });
});
