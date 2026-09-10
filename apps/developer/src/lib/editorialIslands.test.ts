import { PLANS_PLACEHOLDER_ATTRIBUTE } from "@musiccloud/shared";
import { describe, expect, it } from "vitest";
import { EditorialSegmentKind, splitEditorialSegments } from "./editorialIslands";

/** A placeholder exactly as the backend emits it, after the sanitizer. */
function placeholder(heading: string): string {
  return `<div ${PLANS_PLACEHOLDER_ATTRIBUTE}="${heading}"></div>`;
}

describe("splitEditorialSegments", () => {
  it("leaves a page without placeholders as one run of markup", () => {
    const html = "<h2>A heading</h2><p>Some copy.</p>";

    expect(splitEditorialSegments(html)).toEqual([{ kind: EditorialSegmentKind.Html, html }]);
  });

  it("returns nothing for an empty page", () => {
    expect(splitEditorialSegments("")).toEqual([]);
  });

  it("cuts the markup around a placeholder and keeps the order", () => {
    const html = `<p>Before.</p>${placeholder("Available plans")}<p>After.</p>`;

    expect(splitEditorialSegments(html)).toEqual([
      { kind: EditorialSegmentKind.Html, html: "<p>Before.</p>" },
      { kind: EditorialSegmentKind.Plans, heading: "Available plans" },
      { kind: EditorialSegmentKind.Html, html: "<p>After.</p>" },
    ]);
  });

  it("carries the heading each placeholder holds", () => {
    const html = `${placeholder("First")}<p>Between.</p>${placeholder("Second")}`;

    expect(splitEditorialSegments(html)).toEqual([
      { kind: EditorialSegmentKind.Plans, heading: "First" },
      { kind: EditorialSegmentKind.Html, html: "<p>Between.</p>" },
      { kind: EditorialSegmentKind.Plans, heading: "Second" },
    ]);
  });

  it("handles a page that is nothing but a placeholder", () => {
    expect(splitEditorialSegments(placeholder("Plans"))).toEqual([
      { kind: EditorialSegmentKind.Plans, heading: "Plans" },
    ]);
  });

  it("leaves a div that is not a placeholder in the markup", () => {
    const html = '<div class="mc-card"><p>A card.</p></div>';

    expect(splitEditorialSegments(html)).toEqual([{ kind: EditorialSegmentKind.Html, html }]);
  });

  it("leaves a placeholder without its attribute alone", () => {
    // The sanitizer drops the attribute when the heading does not pass, and
    // what is left is an empty div rather than a plan list nobody asked for.
    const html = "<p>Before.</p><div></div>";

    expect(splitEditorialSegments(html)).toEqual([{ kind: EditorialSegmentKind.Html, html }]);
  });
});
