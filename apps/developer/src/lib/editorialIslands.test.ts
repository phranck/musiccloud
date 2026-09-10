import { PLANS_PLACEHOLDER_ATTRIBUTE } from "@musiccloud/shared";
import { describe, expect, it } from "vitest";
import { EditorialSegmentKind, splitEditorialSegments } from "./editorialIslands";

/** A placeholder exactly as the backend emits it, after the sanitizer. */
function placeholder(): string {
  return `<div ${PLANS_PLACEHOLDER_ATTRIBUTE}=""></div>`;
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
    const html = `<p>Before.</p>${placeholder()}<p>After.</p>`;

    expect(splitEditorialSegments(html)).toEqual([
      { kind: EditorialSegmentKind.Html, html: "<p>Before.</p>" },
      { kind: EditorialSegmentKind.Plans },
      { kind: EditorialSegmentKind.Html, html: "<p>After.</p>" },
    ]);
  });

  it("finds every placeholder on a page, not only the first", () => {
    const html = `${placeholder()}<p>Between.</p>${placeholder()}`;

    expect(splitEditorialSegments(html)).toEqual([
      { kind: EditorialSegmentKind.Plans },
      { kind: EditorialSegmentKind.Html, html: "<p>Between.</p>" },
      { kind: EditorialSegmentKind.Plans },
    ]);
  });

  it("handles a page that is nothing but a placeholder", () => {
    expect(splitEditorialSegments(placeholder())).toEqual([{ kind: EditorialSegmentKind.Plans }]);
  });

  it("finds the marker whether or not it was serialised with an empty value", () => {
    const bare = `<div ${PLANS_PLACEHOLDER_ATTRIBUTE}></div>`;

    expect(splitEditorialSegments(bare)).toEqual([{ kind: EditorialSegmentKind.Plans }]);
  });

  it("leaves a div that is not a placeholder in the markup", () => {
    const html = '<div class="mc-card"><p>A card.</p></div>';

    expect(splitEditorialSegments(html)).toEqual([{ kind: EditorialSegmentKind.Html, html }]);
  });

  it("leaves a div without the marker alone", () => {
    const html = "<p>Before.</p><div></div>";

    expect(splitEditorialSegments(html)).toEqual([{ kind: EditorialSegmentKind.Html, html }]);
  });
});
