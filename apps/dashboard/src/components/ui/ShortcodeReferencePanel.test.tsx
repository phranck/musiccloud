import { SHORTCODE_DEFINITIONS, SITE_VARIABLE_NAMES } from "@musiccloud/shared";
import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ShortcodeReferencePanel } from "@/components/ui/ShortcodeReferencePanel";

const FRAME_KEY = "musiccloud.markdown-help.frame";

beforeEach(() => {
  localStorage.clear();
  // jsdom reports zero for both, and a panel clamped into a window of no size
  // ends up nowhere the test can reason about.
  window.innerWidth = 1400;
  window.innerHeight = 900;
});

afterEach(() => {
  localStorage.clear();
  document.documentElement.className = "";
});

function open() {
  return render(<ShortcodeReferencePanel open onClose={vi.fn()} />);
}

/** The panel itself, which is rendered into the document body. */
function panel(): HTMLElement {
  return screen.getByRole("complementary", { name: "Shortcodes" });
}

describe("the shortcode reference panel", () => {
  it("renders nothing whilst closed", () => {
    render(<ShortcodeReferencePanel open={false} onClose={vi.fn()} />);

    expect(screen.queryByRole("complementary", { name: "Shortcodes" })).toBeNull();
  });

  it("lists every shortcode, and the variables beside them", () => {
    open();

    // By token rather than by label: "Card" is a prefix of "Card row", and a
    // name that matches two entries is not a name.
    for (const definition of SHORTCODE_DEFINITIONS) {
      expect(screen.getByRole("button", { name: new RegExp(`\\[\\[${definition.token}\\]\\]`) })).toBeTruthy();
    }
    expect(screen.getByRole("button", { name: /Figures the system holds/ })).toBeTruthy();
  });

  it("describes the first shortcode until another is picked", () => {
    open();

    const first = SHORTCODE_DEFINITIONS[0];
    expect(screen.getByText(first.description)).toBeTruthy();
  });

  it("switches the description when a different entry is chosen", () => {
    open();

    const second = SHORTCODE_DEFINITIONS[1];
    fireEvent.click(screen.getByRole("button", { name: new RegExp(`\\[\\[${second.token}\\]\\]`) }));

    expect(screen.getByText(second.description)).toBeTruthy();
  });

  it("shows every variable under its own entry", () => {
    open();
    fireEvent.click(screen.getByRole("button", { name: /Figures the system holds/ }));

    for (const name of SITE_VARIABLE_NAMES) {
      expect(screen.getByText(`{${name}}`)).toBeTruthy();
    }
  });

  it("describes the code fence too, which is Markdown's own syntax rather than a shortcode", () => {
    open();
    fireEvent.click(screen.getByRole("button", { name: /Code blocks and their surfaces/ }));

    expect(screen.getByText("Default code block")).toBeTruthy();
    expect(screen.getByText("mc-query")).toBeTruthy();
  });

  it("marks the chosen entry as current, and not by colour alone", () => {
    open();
    const second = SHORTCODE_DEFINITIONS[1];
    const name = new RegExp(`\\[\\[${second.token}\\]\\]`);

    fireEvent.click(screen.getByRole("button", { name }));
    expect(screen.getByRole("button", { name }).getAttribute("aria-current")).toBe("true");
  });

  it("dims nothing behind it, because it is help rather than a dialog", () => {
    open();

    // A dialog would take the role and trap focus. This one does neither, so a
    // writer keeps typing whilst reading.
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(panel().getAttribute("aria-modal")).toBeNull();
  });

  it("opens centred when nothing is remembered", () => {
    open();

    // 1400 wide, panel 760, so (1400 - 760) / 2.
    expect(panel().style.getPropertyValue("--mc-help-x")).toBe("320px");
    expect(panel().style.width).toBe("760px");
  });

  it("opens where it was left", () => {
    localStorage.setItem(FRAME_KEY, JSON.stringify({ x: 100, y: 80, width: 600, height: 400 }));
    open();

    expect(panel().style.getPropertyValue("--mc-help-x")).toBe("100px");
    expect(panel().style.getPropertyValue("--mc-help-y")).toBe("80px");
    expect(panel().style.width).toBe("600px");
  });

  it("pulls a remembered frame back on screen rather than hiding itself", () => {
    localStorage.setItem(FRAME_KEY, JSON.stringify({ x: 9000, y: 9000, width: 600, height: 400 }));
    open();

    expect(panel().style.getPropertyValue("--mc-help-x")).toBe(`${1400 - 600 - 16}px`);
    expect(panel().style.getPropertyValue("--mc-help-y")).toBe(`${900 - 400 - 16}px`);
  });

  it("refuses a frame smaller than the two columns need", () => {
    localStorage.setItem(FRAME_KEY, JSON.stringify({ x: 100, y: 80, width: 120, height: 40 }));
    open();

    expect(panel().style.width).toBe("520px");
    expect(panel().style.height).toBe("260px");
  });

  it("starts over from a corrupt entry rather than failing", () => {
    localStorage.setItem(FRAME_KEY, "not json");
    open();

    expect(panel().style.width).toBe("760px");
  });

  it("offers a grip on every edge and corner", () => {
    const { container } = open();
    const grips = document.querySelectorAll(".mc-help-grip");

    expect(grips).toHaveLength(8);
    expect([...grips].map((grip) => grip.getAttribute("data-edge")).sort()).toEqual([
      "e",
      "n",
      "ne",
      "nw",
      "s",
      "se",
      "sw",
      "w",
    ]);
    expect(container).toBeTruthy();
  });

  it("closes on Escape, without taking the key from the editor otherwise", () => {
    const onClose = vi.fn();
    render(<ShortcodeReferencePanel open onClose={onClose} />);

    fireEvent.keyDown(document, { key: "Escape" });
    expect(onClose).toHaveBeenCalledOnce();

    fireEvent.keyDown(document, { key: "a" });
    expect(onClose).toHaveBeenCalledOnce();
  });

  it("closes when the close button is used", () => {
    const onClose = vi.fn();
    render(<ShortcodeReferencePanel open onClose={onClose} />);

    fireEvent.click(screen.getByRole("button", { name: "Close the help panel" }));
    expect(onClose).toHaveBeenCalledOnce();
  });
});
