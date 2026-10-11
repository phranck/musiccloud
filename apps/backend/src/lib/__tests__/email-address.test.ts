import { describe, expect, it } from "vitest";
import { MAX_EMAIL_LENGTH, normalizeEmailAddress } from "../email-address.js";

describe("normalizeEmailAddress", () => {
  it("lowercases an address, because the stored form is compared exactly", () => {
    expect(normalizeEmailAddress("Jane@Example.com")).toBe("jane@example.com");
  });

  it("trims surrounding whitespace", () => {
    expect(normalizeEmailAddress("  jane@example.com\n")).toBe("jane@example.com");
  });

  it.each([
    ["no @", "jane.example.com"],
    ["two @", "jane@doe@example.com"],
    ["an empty string", ""],
    ["only whitespace", "   "],
    ["a domain without a dot", "jane@localhost"],
    ["whitespace inside", "jane doe@example.com"],
  ])("refuses %s", (_label, value) => {
    expect(normalizeEmailAddress(value)).toBeNull();
  });

  it("accepts the longest address SMTP carries and refuses one character more", () => {
    const domain = "@example.com";
    const longest = `${"a".repeat(MAX_EMAIL_LENGTH - domain.length)}${domain}`;

    expect(normalizeEmailAddress(longest)).toBe(longest);
    expect(normalizeEmailAddress(`a${longest}`)).toBeNull();
  });

  it.each([
    ["a number", 42],
    ["null", null],
    ["undefined", undefined],
    ["an object", { email: "jane@example.com" }],
  ])("refuses %s, as a request body can carry one", (_label, value) => {
    expect(normalizeEmailAddress(value)).toBeNull();
  });
});
