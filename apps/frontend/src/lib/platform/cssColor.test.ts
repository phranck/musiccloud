import { describe, expect, it } from "vitest";
import { isSafeCssColor, safeCssColor } from "@/lib/platform/cssColor";

describe("isSafeCssColor", () => {
  it("accepts hex colors (#rgb, #rrggbb, #rrggbbaa)", () => {
    expect(isSafeCssColor("#fff")).toBe(true);
    expect(isSafeCssColor("#a1b2c3")).toBe(true);
    expect(isSafeCssColor("#a1b2c3ff")).toBe(true);
  });

  it("accepts rgb()/rgba()", () => {
    expect(isSafeCssColor("rgb(255, 0, 0)")).toBe(true);
    expect(isSafeCssColor("rgba(0, 0, 0, 0.5)")).toBe(true);
  });

  it("accepts hsl()/hsla()", () => {
    expect(isSafeCssColor("hsl(210, 50%, 40%)")).toBe(true);
    expect(isSafeCssColor("hsla(210, 50%, 40%, 0.8)")).toBe(true);
  });

  it("accepts oklch() and oklab()", () => {
    expect(isSafeCssColor("oklch(0.7 0.15 250)")).toBe(true);
    expect(isSafeCssColor("oklab(0.7 -0.1 0.2)")).toBe(true);
  });

  it("rejects url()/expression() injection attempts", () => {
    expect(isSafeCssColor("url(http://evil.test/x.png)")).toBe(false);
    expect(isSafeCssColor("expression(alert(1))")).toBe(false);
    expect(isSafeCssColor("rgb(0,0,0); background: url(evil)")).toBe(false);
  });

  it("rejects empty, whitespace-only, and bare-word inputs", () => {
    expect(isSafeCssColor("")).toBe(false);
    expect(isSafeCssColor("   ")).toBe(false);
    expect(isSafeCssColor("red")).toBe(false);
  });
});

describe("safeCssColor", () => {
  it("returns the trimmed color when it is safe", () => {
    expect(safeCssColor("  #abc  ")).toBe("#abc");
    expect(safeCssColor("rgb(1, 2, 3)")).toBe("rgb(1, 2, 3)");
  });

  it("fails closed: returns undefined for missing or unsafe input", () => {
    expect(safeCssColor(undefined)).toBeUndefined();
    expect(safeCssColor("")).toBeUndefined();
    expect(safeCssColor("url(evil)")).toBeUndefined();
    expect(safeCssColor("javascript:alert(1)")).toBeUndefined();
  });
});
