import { describe, expect, it } from "vitest";
import {
  reindentShortcodeBlock,
  SHORTCODE_INDENT_UNIT,
  shortcodeBraceDelta,
  shortcodeIndentDepth,
  shortcodeIndentFor,
  shortcodeLineDepth,
  shortcodePasteRewrite,
} from "./markdown-shortcode-indent.js";

describe("shortcodeBraceDelta", () => {
  it("counts a line that opens a container", () => {
    expect(shortcodeBraceDelta("[[card {")).toBe(1);
  });

  it("counts a line that closes one", () => {
    expect(shortcodeBraceDelta("}]]")).toBe(-1);
  });

  it("counts a container opened and closed on one line as neither", () => {
    expect(shortcodeBraceDelta("[[card { copy }]]")).toBe(0);
  });

  it("counts a container that names its parts, which carries no braces", () => {
    expect(shortcodeBraceDelta('[[fields width=160 align="trailing"')).toBe(1);
    expect(shortcodeBraceDelta("]]")).toBe(-1);
  });

  it("counts a part written on one line as neither", () => {
    expect(shortcodeBraceDelta('[[header text="## What you get"]]')).toBe(0);
  });

  it("ignores a brace in prose, which carries no shortcode syntax", () => {
    expect(shortcodeBraceDelta("A sentence with a { in it.")).toBe(0);
    expect(shortcodeBraceDelta("And a } here.")).toBe(0);
  });

  it("ignores an escaped brace, exactly as the tokenizer does", () => {
    expect(shortcodeBraceDelta("[[card { a \\{ b")).toBe(1);
  });

  it("counts two levels opened on one line", () => {
    expect(shortcodeBraceDelta("[[cards { [[card {")).toBe(2);
  });
});

describe("shortcodeIndentDepth", () => {
  const lines = ["[[cards {", "[[card {", "copy", "}]]", "}]]"];

  it("counts the containers open at the end of a line", () => {
    expect(shortcodeIndentDepth(lines, 0)).toBe(1);
    expect(shortcodeIndentDepth(lines, 1)).toBe(2);
    expect(shortcodeIndentDepth(lines, 2)).toBe(2);
    expect(shortcodeIndentDepth(lines, 3)).toBe(1);
    expect(shortcodeIndentDepth(lines, 4)).toBe(0);
  });

  it("never falls below zero, however many closings a document carries", () => {
    expect(shortcodeIndentDepth(["}]]", "}]]"], 1)).toBe(0);
  });
});

describe("shortcodeLineDepth", () => {
  const lines = ["[[cards {", "[[card {", "copy", "}]]", "}]]"];

  it("places a closing line beside the line that opened it", () => {
    // The content between them stands one level further in than either.
    expect(shortcodeLineDepth(lines, 2)).toBe(2);
    expect(shortcodeLineDepth(lines, 3)).toBe(1);
    expect(shortcodeLineDepth(lines, 4)).toBe(0);
  });

  it("places an opening line on the level it opens from", () => {
    expect(shortcodeLineDepth(lines, 0)).toBe(0);
    expect(shortcodeLineDepth(lines, 1)).toBe(1);
  });
});

describe("shortcodeIndentFor", () => {
  /** Asks what the editor should offer just after the given text. */
  function afterTyping(text: string): string | null {
    return shortcodeIndentFor(text, text.length);
  }

  it("steps in on the line after a container opens", () => {
    expect(afterTyping("[[card {")).toBe(SHORTCODE_INDENT_UNIT);
  });

  it("steps in twice inside two containers", () => {
    expect(afterTyping("[[cards {\n  [[card {")).toBe(SHORTCODE_INDENT_UNIT.repeat(2));
  });

  it("leaves an ordinary line to Markdown's own rules", () => {
    expect(afterTyping("Just a paragraph.")).toBeNull();
    expect(afterTyping("- a list item")).toBeNull();
  });

  it("pulls a closing line back out when it starts the line", () => {
    const text = "[[card {\n  copy\n  }]]";
    // The closing line is asked what it should start with, and the answer is
    // the level it closes rather than the level of the content above it.
    expect(shortcodeIndentFor(text, text.length - 3)).toBe("");
  });

  it("says nothing after a closing line, where Markdown decides", () => {
    expect(afterTyping("[[card {\ncopy\n}]]")).toBeNull();
  });
});

describe("reindentShortcodeBlock", () => {
  it("leaves prose alone at the top level", () => {
    expect(reindentShortcodeBlock("One.\nTwo.", 0)).toBe("One.\nTwo.");
  });

  it("places a block at the level it lands on", () => {
    expect(reindentShortcodeBlock("[[card {\ncopy\n}]]", 1)).toBe("  [[card {\n    copy\n  }]]");
  });

  it("keeps whatever a line indents beyond its own structure", () => {
    // Four spaces on a line one level in is two beyond it, and those two stay.
    expect(reindentShortcodeBlock("[[card {\n- one\n    - nested\n}]]", 0)).toBe(
      "[[card {\n  - one\n    - nested\n}]]",
    );
  });

  it("reads an indent of exactly one level as structure rather than as the author's", () => {
    // A nested list item indented by one unit is indistinguishable from a line
    // the container itself indented, so it is placed rather than kept. The cost
    // is one level of a hand-indented list; the alternative is a pasted
    // container arriving with its own indentation added on top of its level.
    expect(reindentShortcodeBlock("[[card {\n- one\n  - nested\n}]]", 0)).toBe("[[card {\n  - one\n  - nested\n}]]");
  });

  it("indents a container that names its parts", () => {
    const flat = '[[card\n[[header text="## A"]]\n[[body {\nB\n}]]\n]]';

    expect(reindentShortcodeBlock(flat, 0)).toBe('[[card\n  [[header text="## A"]]\n  [[body {\n    B\n  }]]\n]]');
  });

  it("leaves an empty line empty rather than filling it with spaces", () => {
    expect(reindentShortcodeBlock("[[card {\n\ncopy\n}]]", 0)).toBe("[[card {\n\n  copy\n}]]");
  });
});

describe("shortcodePasteRewrite", () => {
  it("leaves a phrase pasted into a sentence alone", () => {
    expect(shortcodePasteRewrite("A sentence ", 11, 11, "with more", SHORTCODE_INDENT_UNIT)).toBeNull();
  });

  it("leaves a block pasted at the top level alone when it opens nothing", () => {
    expect(shortcodePasteRewrite("", 0, 0, "One.\nTwo.")).toBeNull();
  });

  it("re-indents a block pasted inside a container", () => {
    const before = "[[card {\n  ";
    const rewrite = shortcodePasteRewrite(before, before.length, before.length, "copy\nmore");

    expect(rewrite).not.toBeNull();
    expect(rewrite?.insert).toBe("  copy\n  more");
    // The indentation already on the line is replaced rather than added to.
    expect(rewrite?.from).toBe(9);
  });

  it("re-indents a nested container for where it lands", () => {
    const before = "[[cards {\n  ";
    const rewrite = shortcodePasteRewrite(before, before.length, before.length, "[[card {\ncopy\n}]]");

    expect(rewrite?.insert).toBe("  [[card {\n    copy\n  }]]");
  });
});
