import { describe, expect, it } from "vitest";
import { secretsMatch } from "../secret-compare.js";

describe("secretsMatch", () => {
  it("accepts an exact match", () => {
    expect(secretsMatch("mc-internal-key", "mc-internal-key")).toBe(true);
  });

  it("rejects a different value of the same length", () => {
    expect(secretsMatch("mc-internal-kez", "mc-internal-key")).toBe(false);
  });

  it("rejects a value differing only in its last byte", () => {
    // The case `===` would decide fastest, and the one a timing attack works
    // its way towards byte by byte.
    expect(secretsMatch("aaaaaaaab", "aaaaaaaaa")).toBe(false);
  });

  it("rejects a prefix of the secret", () => {
    expect(secretsMatch("mc-internal", "mc-internal-key")).toBe(false);
  });

  it("rejects a longer value that starts with the secret", () => {
    expect(secretsMatch("mc-internal-key-plus", "mc-internal-key")).toBe(false);
  });

  it("rejects a missing header", () => {
    expect(secretsMatch(undefined, "mc-internal-key")).toBe(false);
  });

  it("rejects a repeated header, which arrives as an array", () => {
    expect(secretsMatch(["mc-internal-key"], "mc-internal-key")).toBe(false);
  });

  it("never matches when the secret is unset", () => {
    // Otherwise an unconfigured deployment would accept an empty header.
    expect(secretsMatch("", undefined)).toBe(false);
    expect(secretsMatch("", "")).toBe(false);
    expect(secretsMatch("anything", "")).toBe(false);
  });

  it("compares by bytes, not by code units", () => {
    // Two strings of equal length in characters can differ in UTF-8 length,
    // and timingSafeEqual throws rather than returning false when the buffers
    // differ, so the length guard has to run on the encoded form.
    expect(secretsMatch("ä", "a")).toBe(false);
    expect(secretsMatch("schlüssel", "schlüssel")).toBe(true);
  });
});
