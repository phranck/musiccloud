import { render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PageHeader } from "@/components/layout/PageHeader";
import { LocaleProvider } from "@/i18n/context";
import { createLocalStorageMock } from "@/test/localStorageMock";

beforeEach(() => {
  vi.stubGlobal("localStorage", createLocalStorageMock());
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("PageHeader", () => {
  it("does not render a left header control when no navigation items exist", () => {
    const { container } = render(
      <LocaleProvider initialLocale="en">
        <PageHeader />
      </LocaleProvider>,
    );

    expect(screen.queryByText("Commercial")).not.toBeInTheDocument();
    expect(screen.queryByText("Creative Commons")).not.toBeInTheDocument();
    expect(container.querySelector(".left-3")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "English" })).toBeInTheDocument();
  });
});
