import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { MarkdownEditor } from "@/components/ui/MarkdownEditor";

/** The keys the three switches remember themselves under. */
const KEYS = {
  wrap: "musiccloud.markdown-editor.line-wrap",
  numbers: "musiccloud.markdown-editor.line-numbers",
  whitespace: "musiccloud.markdown-editor.whitespace",
};

function renderEditor() {
  return render(<MarkdownEditor id="editor" value="# Heading" onChange={() => {}} showHints />);
}

/**
 * One switch, found by what it does rather than by what it reads.
 *
 * `aria-label` replaces a button's contents for a screen reader, and these
 * labels say what a click will do whilst the visible text says what holds now.
 * Both matter, so they are asked for separately.
 */
function switchFor(name: RegExp): HTMLElement {
  return screen.getByRole("button", { name });
}

const NUMBERS = /line numbers$/i;
const WRAP = /wrapping long lines|wrap long lines/i;
const SPACES = /spaces and line ends$/i;

beforeEach(() => {
  localStorage.clear();
});

afterEach(() => {
  localStorage.clear();
});

describe("the editor's footer switches", () => {
  it("offers one switch per reading preference, plus the shortcode reference", () => {
    renderEditor();

    for (const label of [NUMBERS, WRAP, SPACES, /Look up the shortcodes/i]) {
      expect(switchFor(label)).toBeTruthy();
    }
  });

  it("starts with wrapping and numbers on and spaces off", () => {
    // How the editor is normally read, against something you turn on whilst
    // hunting for a stray space.
    renderEditor();

    expect(switchFor(NUMBERS).getAttribute("aria-pressed")).toBe("true");
    expect(switchFor(WRAP).getAttribute("aria-pressed")).toBe("true");
    expect(switchFor(SPACES).getAttribute("aria-pressed")).toBe("false");
  });

  it("says in the label what each switch is doing, not only in its colour", () => {
    renderEditor();
    const numbers = switchFor(NUMBERS);

    expect(numbers.textContent).toContain("Numbers on");
    fireEvent.click(numbers);
    expect(switchFor(NUMBERS).textContent).toContain("Numbers off");
  });

  it("remembers each switch, because it is how somebody reads rather than one page", () => {
    renderEditor();

    fireEvent.click(switchFor(NUMBERS));
    fireEvent.click(switchFor(SPACES));

    expect(localStorage.getItem(KEYS.numbers)).toBe("off");
    expect(localStorage.getItem(KEYS.whitespace)).toBe("on");
  });

  it("starts from what was remembered", () => {
    localStorage.setItem(KEYS.wrap, "off");
    localStorage.setItem(KEYS.whitespace, "on");
    renderEditor();

    expect(switchFor(WRAP).getAttribute("aria-pressed")).toBe("false");
    expect(switchFor(SPACES).getAttribute("aria-pressed")).toBe("true");
  });

  it("keeps the keyboard hints beside the switches", () => {
    renderEditor();

    for (const label of ["Bold", "Italic", "Link", "Strike"]) {
      expect(screen.getByText(label)).toBeTruthy();
    }
  });
});
