import { describe, expect, it } from "vitest";
import { shortUrlFor } from "./short-url.js";

describe("shortUrlFor", () => {
  it("joins the origin and the share id with one slash", () => {
    expect(shortUrlFor("https://musiccloud.io", "abc123")).toBe("https://musiccloud.io/abc123");
  });
});
