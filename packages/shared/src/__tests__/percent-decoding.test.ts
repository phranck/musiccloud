import { describe, expect, it } from "vitest";
import { decodeFormPathSegment, encodeFormPathSegment, tryDecodeURIComponent } from "../percent-decoding.js";

describe("tryDecodeURIComponent", () => {
  it("decodes valid percent encoding, reserved characters included", () => {
    expect(tryDecodeURIComponent("drum%20%26%20bass")).toBe("drum & bass");
    expect(tryDecodeURIComponent("%E0%A4%A8")).toBe("न");
  });

  it("leaves text without escapes as it is", () => {
    expect(tryDecodeURIComponent("hip hop")).toBe("hip hop");
  });

  it.each(["100%", "%E0%A4%A", "%zz"])("answers null for the broken encoding in %s", (value) => {
    expect(tryDecodeURIComponent(value)).toBeNull();
  });
});

describe("form path segments", () => {
  it.each([
    ["drum & bass", "drum+%26+bass"],
    ["drum + bass", "drum+%2B+bass"],
    ["c++", "c%2B%2B"],
    ["hip hop", "hip+hop"],
  ])("writes %s as %s", (text, segment) => {
    expect(encodeFormPathSegment(text)).toBe(segment);
  });

  it.each([
    "drum & bass",
    "drum + bass",
    "c++",
    "hip hop",
    "r&b",
    "post-punk/new wave",
  ])("reads the segment of %s back as the same text", (text) => {
    expect(decodeFormPathSegment(encodeFormPathSegment(text))).toBe(text);
  });

  it("reads a Last.fm segment, where a space is a plus sign", () => {
    expect(decodeFormPathSegment("Daft+Punk")).toBe("Daft Punk");
  });

  it("answers null for a segment with a broken escape", () => {
    expect(decodeFormPathSegment("100%")).toBeNull();
  });
});
