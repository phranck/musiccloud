import { describe, expect, it } from "vitest";
import { rewriteCards, rewriteFields } from "./rewrite-fields-and-cards.js";

describe("turning a fields list's rows into fields", () => {
  it("makes one field of each row", () => {
    const before = "[[fields {\nMethod: `GET`\nPath: /v1/resolve\n}]]";
    const after = rewriteFields(before)?.after ?? "";

    expect(after).toContain('[[field label="Method" {');
    expect(after).toContain("`GET`");
    expect(after).toContain('[[field label="Path" {');
    expect(after).not.toMatch(/^Method:/m);
  });

  it("keeps the list's indentation and steps its children in from it", () => {
    const before = "  [[fields {\n  Method: `GET`\n  }]]";
    const after = rewriteFields(before)?.after ?? "";

    expect(after).toContain('  [[fields {\n    [[field label="Method" {\n      `GET`\n    }]]\n  }]]');
  });

  it("renames the width to what the list now calls it", () => {
    const after = rewriteFields('[[fields labelWidth="8rem" {\nA: b\n}]]')?.after ?? "";

    expect(after).toContain('width="8rem"');
    expect(after).not.toContain("labelWidth");
  });

  it("keeps every other attribute the list carried", () => {
    const after = rewriteFields('[[fields layout="stacked" gap="2rem" {\nA: b\n}]]')?.after ?? "";

    expect(after).toContain('layout="stacked"');
    expect(after).toContain('gap="2rem"');
  });

  it("leaves a list already written with fields exactly as it stands", () => {
    const before = '[[fields {\n[[field label="Method" {\n`GET`\n}]]\n}]]';

    expect(rewriteFields(before)?.changed).toBe(false);
  });

  it("refuses a list holding a line that was never a row", () => {
    // The old renderer dropped such a line. Rewriting the rest would leave a
    // page that reads differently, so the whole page is left alone instead.
    expect(rewriteFields("[[fields {\nMethod: `GET`\nnot a row at all\n}]]")).toBeNull();
  });

  it("leaves a page carrying no list alone", () => {
    expect(rewriteFields("# A page\n\nNothing here.")?.changed).toBe(false);
  });

  it("rewrites every list on a page, not only the first", () => {
    const before = "[[fields {\nA: b\n}]]\n\nBetween.\n\n[[fields {\nC: d\n}]]";
    const after = rewriteFields(before)?.after ?? "";

    expect(after.match(/\[\[field label=/g)).toHaveLength(2);
    expect(after).toContain("Between.");
  });

  it("finds nothing to do on a page it has already rewritten", () => {
    const once = rewriteFields("[[fields {\nA: b\n}]]")?.after ?? "";

    expect(rewriteFields(once)?.changed).toBe(false);
  });
});

describe("turning a card's attributes into children", () => {
  it("moves the header and the footer inside", () => {
    const before = '[[card header="## What you get" footer="Every plan includes it." {\nOne call.\n}]]';
    const after = rewriteCards(before).after;

    expect(after).toContain('[[header text="## What you get"]]');
    expect(after).toContain("[[footer {");
    expect(after).toContain("Every plan includes it.");
    expect(after).not.toContain("header=\"##");
  });

  it("moves one of them where the card carried only one", () => {
    const after = rewriteCards('[[card header="## Only this" {\nOne call.\n}]]').after;

    expect(after).toContain("[[header text=");
    expect(after).not.toContain("[[footer");
  });

  it("leaves a card carrying neither exactly as it stands", () => {
    expect(rewriteCards("[[card {\nOne call.\n}]]").changed).toBe(false);
  });

  it("keeps the card's content and its closing", () => {
    const after = rewriteCards('[[card header="## A" {\nThe content.\n}]]').after;

    expect(after).toContain("The content.");
    expect(after.trimEnd().endsWith("}]]")).toBe(true);
  });

  it("finds nothing to do on a card it has already rewritten", () => {
    const once = rewriteCards('[[card header="## A" {\nb\n}]]').after;

    expect(rewriteCards(once).changed).toBe(false);
  });
});
