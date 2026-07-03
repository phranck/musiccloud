import { describe, expect, it } from "vitest";
import { isHexColor } from "../color.js";

describe("isHexColor", () => {
  it("accepts 6-digit hex colors", () => {
    expect(isHexColor("#0076d5")).toBe(true);
    expect(isHexColor("#69D1FD")).toBe(true);
    expect(isHexColor("#000000")).toBe(true);
    expect(isHexColor("#ffffff")).toBe(true);
  });

  it("accepts 3-digit shorthand hex colors", () => {
    expect(isHexColor("#fff")).toBe(true);
    expect(isHexColor("#0A5")).toBe(true);
  });

  it("rejects colors without a leading hash", () => {
    expect(isHexColor("0076d5")).toBe(false);
    expect(isHexColor("fff")).toBe(false);
  });

  it("rejects wrong-length hex strings", () => {
    expect(isHexColor("#")).toBe(false);
    expect(isHexColor("#12")).toBe(false);
    expect(isHexColor("#1234")).toBe(false);
    expect(isHexColor("#12345")).toBe(false);
    expect(isHexColor("#1234567")).toBe(false);
  });

  it("rejects non-hex characters", () => {
    expect(isHexColor("#gggggg")).toBe(false);
    expect(isHexColor("#00 76d5")).toBe(false);
    expect(isHexColor("#zzz")).toBe(false);
  });

  it("rejects CSS keyword and functional colors (only literal hex is allowed)", () => {
    expect(isHexColor("red")).toBe(false);
    expect(isHexColor("rgb(0,0,0)")).toBe(false);
    expect(isHexColor("transparent")).toBe(false);
  });

  it("rejects HTML/CSS-injection payloads that merely start with a valid hex", () => {
    // These are the payloads the validator exists to stop: a gradient colour
    // is interpolated straight into an inline `style="..."` and a `<style>`
    // block on the send path, so anything past the hex must be rejected
    // wholesale, not sanitized.
    expect(isHexColor("#fff;}</style><script>alert(1)</script>")).toBe(false);
    expect(isHexColor("#fff;background:url(javascript:alert(1))")).toBe(false);
    expect(isHexColor("#000000 !important")).toBe(false);
    expect(isHexColor("#000000\n")).toBe(false);
  });

  it("rejects non-string inputs", () => {
    expect(isHexColor(null)).toBe(false);
    expect(isHexColor(undefined)).toBe(false);
    expect(isHexColor(123)).toBe(false);
    expect(isHexColor({})).toBe(false);
  });
});
