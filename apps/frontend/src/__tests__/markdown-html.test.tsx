import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { MarkdownHtml } from "@/components/layout/PageOverlayContent";

describe("MarkdownHtml", () => {
  it("wraps <pre data-card-style='recessed'> in RecessedCard", () => {
    const html = '<pre data-card-style="recessed"><code>foo</code></pre>';
    render(<MarkdownHtml html={html} />);
    const recessed = document.querySelector(".recessed-gradient-border");
    expect(recessed).not.toBeNull();
    const pre = recessed?.querySelector("pre");
    expect(pre).not.toBeNull();
    expect(pre?.hasAttribute("data-card-style")).toBe(false);
    expect(pre?.getAttribute("data-card-wrapped")).toBe("true");
  });

  it("wraps <pre data-card-style='embossed'> in EmbossedCard", () => {
    const html = '<pre data-card-style="embossed"><code>foo</code></pre>';
    render(<MarkdownHtml html={html} />);
    const embossed = document.querySelector(".embossed-gradient-border");
    expect(embossed).not.toBeNull();
  });

  it("renders <pre> without marker unchanged", () => {
    const html = "<pre><code>foo</code></pre>";
    render(<MarkdownHtml html={html} />);
    const pre = document.querySelector("pre");
    expect(pre).not.toBeNull();
    expect(document.querySelectorAll(".recessed-gradient-border, .embossed-gradient-border").length).toBe(0);
  });

  it("strips unknown data-card-style values defensively", () => {
    const html = '<pre data-card-style="weird"><code>foo</code></pre>';
    render(<MarkdownHtml html={html} />);
    const pre = document.querySelector("pre");
    expect(pre).not.toBeNull();
    expect(document.querySelectorAll(".recessed-gradient-border, .embossed-gradient-border").length).toBe(0);
  });
});
