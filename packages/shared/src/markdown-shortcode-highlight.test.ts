import { describe, expect, it } from "vitest";
import { highlightShortcodes, type ShortcodeHighlightSpan } from "./markdown-shortcode-highlight.js";

/** What the highlighter marked, as the text it covers, so a test reads like the source. */
function marked(source: string, kind: ShortcodeHighlightSpan["kind"]): string[] {
  return highlightShortcodes(source)
    .filter((span) => span.kind === kind)
    .map((span) => source.slice(span.from, span.to));
}

describe("highlightShortcodes", () => {
  it("marks the brackets, the token, the target and the value", () => {
    const source = "[[pill:Beta tone=info]]";

    expect(marked(source, "bracket")).toEqual(["[[", "]]"]);
    expect(marked(source, "token")).toEqual(["pill"]);
    expect(marked(source, "target")).toEqual(["Beta"]);
    expect(marked(source, "attribute-name")).toEqual(["tone"]);
    expect(marked(source, "value-bare")).toEqual(["info"]);
  });

  it("marks a token no definition claims as unknown", () => {
    const source = "[[nosuchthing]] and [[pill:Beta]]";

    expect(marked(source, "unknown-token")).toEqual(["nosuchthing"]);
    expect(marked(source, "token")).toEqual(["pill"]);
  });

  it("marks the fence markers, and the token between them as one nothing claims", () => {
    // The notation itself is still read, because pages written before the
    // bracket form carry it and the renderer keeps rendering them. No shortcode
    // is written this way any more, so the editor says so.
    const source = ":::fields gap=2rem\nMethod: GET\n:::";

    expect(marked(source, "fence-marker")).toEqual([":::", ":::"]);
    expect(marked(source, "unknown-token")).toEqual(["fields"]);
  });

  it("marks the braces form", () => {
    const source = "Press {{Esc}} to close.";

    expect(marked(source, "brace-marker")).toEqual(["{{", "}}"]);
    expect(marked(source, "target")).toEqual(["Esc"]);
  });

  it("leaves ordinary prose unmarked, so the Markdown colouring keeps it", () => {
    expect(highlightShortcodes("Just a sentence with an {unknown} name in it.")).toEqual([]);
  });

  it("returns spans in order and never overlapping", () => {
    const spans = highlightShortcodes('[[pill:Beta note="a {name} b" case=upper]] then {{Esc}}');

    for (let index = 1; index < spans.length; index += 1) {
      expect(spans[index].from).toBeGreaterThanOrEqual(spans[index - 1].to);
    }
  });

  it("marks a known variable, in prose and inside an attribute alike", () => {
    const source = 'A budget of {dailyLimit}, and [[pill:x note="up to {dailyLimit}"]].';
    const spans = highlightShortcodes(source, { variableNames: ["dailyLimit"] });
    const variables = spans.filter((span) => span.kind === "variable").map((span) => source.slice(span.from, span.to));

    expect(variables).toEqual(["{dailyLimit}", "{dailyLimit}"]);
  });

  it("leaves a braced name nothing declares alone", () => {
    const source = "A {madeUpName} in prose.";

    expect(highlightShortcodes(source, { variableNames: ["dailyLimit"] })).toEqual([]);
  });

  it("splits a quoted value around the variable inside it, so nothing overlaps", () => {
    const source = '[[pill:x note="up to {dailyLimit} a day"]]';
    const spans = highlightShortcodes(source, { variableNames: ["dailyLimit"] });
    const value = spans
      .filter((span) => span.kind === "value-string" || span.kind === "variable")
      .map((span) => source.slice(span.from, span.to));

    expect(value).toEqual(['"up to ', "{dailyLimit}", ' a day"']);
  });

  it("reads the shortcodes inside a container as shortcodes of their own", () => {
    // The container is a real one and so is what stands in it, so both are
    // marked as known: what a body holds is read the way the page reads it.
    const source = "[[card {\n[[pill:Beta]]\n}]]";

    expect(marked(source, "token")).toEqual(["card", "pill"]);
    expect(marked(source, "unknown-token")).toEqual([]);
    expect(marked(source, "target")).toEqual(["Beta"]);
  });

  it("marks an unknown token inside a container as unknown", () => {
    const source = "[[card {\n[[nosuchthing]]\n}]]";

    expect(marked(source, "token")).toEqual(["card"]);
    expect(marked(source, "unknown-token")).toEqual(["nosuchthing"]);
  });

  it("keeps every span pointing at the source it came from", () => {
    const source = "Intro.\n\n[[card {\n  [[pill:Beta tone=info]]\n}]]\n\nOutro.";

    for (const span of highlightShortcodes(source)) {
      expect(span.from).toBeGreaterThanOrEqual(0);
      expect(span.to).toBeLessThanOrEqual(source.length);
    }
    expect(marked(source, "target")).toEqual(["Beta"]);
  });
});
