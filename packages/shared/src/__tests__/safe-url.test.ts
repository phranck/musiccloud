import { describe, expect, it } from "vitest";
import { isSafeConfiguredUrl, isSafeContentTarget, isSafeNavigationUrl, isSameSiteRelativePath } from "../safe-url.js";

/**
 * Browsers read `\` like `/` in an http or https URL, so `/\host` on this site
 * opens `https://host/`. Every row that starts with `/\` is therefore another
 * host, however much it looks like a path.
 */
describe("isSameSiteRelativePath", () => {
  it.each([
    ["/", true],
    ["/docs", true],
    ["/docs/api", true],
    ["//evil.example", false],
    ["/\\evil.example", false],
    ["/\\\\evil.example", false],
    ["https://musiccloud.io", false],
    ["docs", false],
    ["", false],
  ])("%s → %s", (value, expected) => {
    expect(isSameSiteRelativePath(value)).toBe(expected);
  });

  it("matches where browsers actually go", () => {
    expect(new URL("/\\evil.example", "https://musiccloud.io").host).toBe("evil.example");
    expect(new URL("/docs", "https://musiccloud.io").host).toBe("musiccloud.io");
  });
});

describe("isSafeConfiguredUrl", () => {
  it.each([
    ["/", true],
    ["/a", true],
    ["//evil.example", false],
    ["/\\evil.example", false],
    ["/\\\\evil.example", false],
    ["https://evil.example", true],
    ["http://localhost:3000", true],
    ["http://evil.example", false],
    ["mailto:team@musiccloud.io", false],
    ["tel:+43123", false],
    ["javascript:alert(1)", false],
  ])("with relative paths allowed, %s → %s", (value, expected) => {
    expect(isSafeConfiguredUrl(value, { allowRelative: true })).toBe(expected);
  });

  it("refuses a path when relative paths are not allowed", () => {
    expect(isSafeConfiguredUrl("/docs")).toBe(false);
  });
});

describe("isSafeNavigationUrl", () => {
  it.each([
    ["/docs", true],
    ["https://musiccloud.io", true],
    ["mailto:team@musiccloud.io", true],
    ["tel:+43123", false],
    ["http://evil.example", false],
    ["//evil.example", false],
    ["/\\evil.example", false],
  ])("%s → %s", (value, expected) => {
    expect(isSafeNavigationUrl(value)).toBe(expected);
  });
});

describe("isSafeContentTarget", () => {
  it.each([
    ["/", true],
    ["/signup", true],
    ["https://musiccloud.io/a.png", true],
    ["http://musiccloud.io/a.png", false],
    ["//evil.example/a.png", false],
    ["/\\evil.example/a.png", false],
    ["javascript:alert(1)", false],
  ])("%s → %s", (value, expected) => {
    expect(isSafeContentTarget(value)).toBe(expected);
  });
});
