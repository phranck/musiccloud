import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { DashboardSection } from "./DashboardSection";

/** The accessible name of the header's toggle in these tests. */
const TOGGLE_LABEL = "Limits";

/** What the body of every section in these tests shows. */
const BODY_TEXT = "The body";

/**
 * Renders a section with the header's own toggle.
 *
 * @param expanded - Whether it stands open.
 * @param onExpandedChange - Receives the state the toggle asks for.
 */
function renderToggledSection(expanded: boolean, onExpandedChange: (next: boolean) => void) {
  render(
    <DashboardSection expanded={expanded} onExpandedChange={onExpandedChange} collapseButtonLabel={TOGGLE_LABEL}>
      <DashboardSection.Header icon={null} title="Title" />
      <DashboardSection.Body>{BODY_TEXT}</DashboardSection.Body>
    </DashboardSection>,
  );
}

describe("DashboardSection with its own toggle", () => {
  it("keeps a closed body in the document, out of reach and at no height", () => {
    renderToggledSection(false, vi.fn());

    const region = screen.getByText(BODY_TEXT).parentElement;
    expect(region?.hasAttribute("inert")).toBe(true);
    expect(region?.parentElement?.classList.contains("grid-rows-[0fr]")).toBe(true);
  });

  it("opens the body to its full height and lets it be reached", () => {
    renderToggledSection(true, vi.fn());

    const region = screen.getByText(BODY_TEXT).parentElement;
    expect(region?.hasAttribute("inert")).toBe(false);
    expect(region?.parentElement?.classList.contains("grid-rows-[1fr]")).toBe(true);
  });

  it("asks for the other state when the toggle is pressed", async () => {
    const onExpandedChange = vi.fn();
    renderToggledSection(false, onExpandedChange);

    await userEvent.click(screen.getByRole("button", { name: TOGGLE_LABEL }));

    expect(onExpandedChange).toHaveBeenCalledWith(true);
  });
});

describe("DashboardSection whose caller controls it", () => {
  it("leaves the document while closed", () => {
    render(
      <DashboardSection expanded={false}>
        <DashboardSection.Header icon={null} title="Title" />
        <DashboardSection.Body>{BODY_TEXT}</DashboardSection.Body>
      </DashboardSection>,
    );

    expect(screen.queryByText(BODY_TEXT)).toBeNull();
  });
});
