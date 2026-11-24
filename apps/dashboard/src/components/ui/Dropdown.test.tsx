import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { Dropdown } from "./Dropdown";

/** The visible label of the dropdown in these tests, which also names its trigger. */
const LABEL = "Where it leads";

/** Three pages to choose between, two of which share the word "support". */
const OPTIONS = [
  { value: "/about", label: "About · /about" },
  { value: "/support-me", label: "Support me · /support-me" },
  { value: "/supporters", label: "Supporters · /supporters" },
];

/**
 * Renders a dropdown over {@link OPTIONS} with the first one chosen.
 *
 * @param searchable - Whether it opens with a search field.
 * @returns The change handler.
 */
function renderDropdown(searchable: boolean) {
  const onChange = vi.fn();
  render(<Dropdown label={LABEL} value="/about" options={OPTIONS} onChange={onChange} searchable={searchable} />);
  return onChange;
}

/** The names of the options the open list shows. */
function listedOptions(): string[] {
  return screen.getAllByRole("option").map((option) => option.textContent ?? "");
}

describe("Dropdown with a search", () => {
  it("narrows the list to the options whose label contains the search, ignoring case and spaces", async () => {
    renderDropdown(true);
    await userEvent.click(screen.getByRole("button", { name: LABEL }));

    await userEvent.type(screen.getByRole("textbox", { name: LABEL }), "  SUPPORT ");

    expect(listedOptions()).toEqual(["Support me · /support-me", "Supporters · /supporters"]);
  });

  it("takes the focus into the search field when it opens", async () => {
    renderDropdown(true);
    await userEvent.click(screen.getByRole("button", { name: LABEL }));

    expect(document.activeElement).toBe(screen.getByRole("textbox", { name: LABEL }));
  });

  it("chooses a narrowed option with the arrow keys and Enter, and hands focus back", async () => {
    const onChange = renderDropdown(true);
    const trigger = screen.getByRole("button", { name: LABEL });
    await userEvent.click(trigger);

    await userEvent.type(screen.getByRole("textbox", { name: LABEL }), "support");
    await userEvent.keyboard("{ArrowDown}{Enter}");

    expect(onChange).toHaveBeenCalledWith("/supporters");
    expect(screen.queryByRole("listbox")).toBeNull();
    expect(document.activeElement).toBe(trigger);
  });

  it("lists every option again for a new search", async () => {
    renderDropdown(true);
    const trigger = screen.getByRole("button", { name: LABEL });
    await userEvent.click(trigger);
    await userEvent.type(screen.getByRole("textbox", { name: LABEL }), "about");
    await userEvent.keyboard("{Escape}");

    await userEvent.click(trigger);

    expect(listedOptions()).toHaveLength(OPTIONS.length);
  });
});

describe("Dropdown without a search", () => {
  it("opens the whole list with no search field", async () => {
    renderDropdown(false);
    await userEvent.click(screen.getByRole("button", { name: LABEL }));

    expect(screen.queryByRole("textbox")).toBeNull();
    expect(listedOptions()).toHaveLength(OPTIONS.length);
  });
});

describe("Dropdown with no option highlighted", () => {
  /**
   * Opens a dropdown whose value matches no option, so the open list starts
   * with nothing highlighted, presses the given arrow key and then Enter.
   *
   * @param arrowKey - The `userEvent.keyboard` name of the arrow key to press.
   * @returns The change handler, which received whatever Enter chose.
   */
  async function chooseWithArrowFromNothing(arrowKey: "ArrowUp" | "ArrowDown") {
    const onChange = vi.fn();
    render(<Dropdown label={LABEL} value="" placeholder="Choose a page" options={OPTIONS} onChange={onChange} />);
    await userEvent.click(screen.getByRole("button", { name: LABEL }));

    await userEvent.keyboard(`{${arrowKey}}{Enter}`);
    return onChange;
  }

  it("highlights the last option on ArrowUp", async () => {
    const onChange = await chooseWithArrowFromNothing("ArrowUp");

    expect(onChange).toHaveBeenCalledWith(OPTIONS[OPTIONS.length - 1].value);
  });

  it("highlights the first option on ArrowDown", async () => {
    const onChange = await chooseWithArrowFromNothing("ArrowDown");

    expect(onChange).toHaveBeenCalledWith(OPTIONS[0].value);
  });
});

describe("Dropdown that takes its width from its options", () => {
  it("names only the chosen option to assistive technology", () => {
    render(<Dropdown label={LABEL} value="/about" options={OPTIONS} onChange={vi.fn()} minWidthFromOptions />);

    const trigger = screen.getByRole("button", { name: LABEL });
    const announced = Array.from(trigger.querySelectorAll("span"))
      .filter((span) => span.childElementCount === 0 && span.getAttribute("aria-hidden") !== "true")
      .map((span) => span.textContent);
    expect(announced).toEqual(["About · /about"]);
  });
});
