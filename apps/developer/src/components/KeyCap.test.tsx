import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { KeyCap } from "./KeyCap";

describe("KeyCap", () => {
  it("renders Escape as its dedicated symbol while preserving its accessible shortcut", () => {
    const html = renderToStaticMarkup(<KeyCap shortcut="Esc" />);

    expect(html).toContain('aria-label="Esc"');
    expect(html).toContain('class="keycap__key">⎋</span>');
    expect(html).not.toContain('class="keycap__key">E</span>');
  });

  it("renders alphabetic shortcuts in uppercase", () => {
    const html = renderToStaticMarkup(<KeyCap shortcut="cmd" />);

    expect(html).toContain('class="keycap__key">C</span>');
    expect(html).toContain('class="keycap__key">M</span>');
    expect(html).toContain('class="keycap__key">D</span>');
  });
});
