import { describe, expect, it } from "vitest";
import { rewriteFieldsShortcodes } from "./rewrite-fields-shortcode.js";

describe("rewriting a stored fields list", () => {
  it("moves a plain one into the bracket notation", () => {
    const before = ":::fields\nMethod: GET\nPath: /v1/resolve\n:::";

    expect(rewriteFieldsShortcodes(before)).toBe("[[fields {\nMethod: GET\nPath: /v1/resolve\n}]]");
  });

  it("quotes an attribute the old notation allowed bare", () => {
    const before = ":::fields labelWidth=10ch\nMethod: GET\n:::";

    expect(rewriteFieldsShortcodes(before)).toBe('[[fields labelWidth="10ch" {\nMethod: GET\n}]]');
  });

  it("keeps the indentation, because a list inside a card carries it", () => {
    const before = "  :::fields\n  Method: GET\n  :::";

    expect(rewriteFieldsShortcodes(before)).toBe("  [[fields {\n  Method: GET\n  }]]");
  });

  it("moves every list on a page, not only the first", () => {
    const before = ":::fields\nOne: a\n:::\n\nBetween.\n\n:::fields\nTwo: b\n:::";
    const after = rewriteFieldsShortcodes(before) ?? "";

    expect(after.match(/\[\[fields/g)).toHaveLength(2);
    expect(after).not.toContain(":::");
    expect(after).toContain("Between.");
  });

  it("leaves a page that carries none alone", () => {
    expect(rewriteFieldsShortcodes("# A page\n\nNothing to move.")).toBeNull();
  });

  it("refuses a page whose body would close the container early", () => {
    // The bracket form counts braces to find where a body ends, so a row
    // holding an unbalanced one cannot be moved. The whole page is refused
    // rather than half of it being written.
    const before = ":::fields\nBroken: a } stray brace\n:::";

    expect(rewriteFieldsShortcodes(before)).toBeNull();
  });

  it("refuses a list whose two readings would differ", () => {
    // A row carrying the closing sequence itself would end the container in the
    // middle, so the rewrite would say something the original did not.
    const before = ":::fields\nBroken: ends with }]] here\n:::";

    expect(rewriteFieldsShortcodes(before)).toBeNull();
  });

  it("finds nothing to do on a page it has already rewritten", () => {
    const once = rewriteFieldsShortcodes(":::fields\nMethod: GET\n:::") ?? "";

    expect(rewriteFieldsShortcodes(once)).toBeNull();
  });
});
