import { describe, expect, it } from "vitest";
import { pickLargestImage } from "../images.js";

/** An image variant in the shape KKBOX sends. */
interface Variant {
  url: string;
  width?: number;
}

/**
 * Picks from KKBOX-shaped variants.
 *
 * @param images - The variants, or `undefined` for none.
 * @returns The address the shared picker chooses.
 */
function pick(images: Variant[] | undefined): string | undefined {
  return pickLargestImage(
    images,
    (image) => image.width,
    (image) => image.url,
  );
}

describe("pickLargestImage", () => {
  it("answers nothing for an absent or empty list", () => {
    expect(pick(undefined)).toBeUndefined();
    expect(pick([])).toBeUndefined();
  });

  it("answers the widest variant", () => {
    expect(
      pick([
        { url: "small", width: 160 },
        { url: "large", width: 1000 },
        { url: "medium", width: 500 },
      ]),
    ).toBe("large");
  });

  it("keeps provider order between variants of the same width", () => {
    expect(
      pick([
        { url: "first", width: 500 },
        { url: "second", width: 500 },
      ]),
    ).toBe("first");
  });

  it("ranks a variant without a width last", () => {
    expect(pick([{ url: "unsized" }, { url: "sized", width: 1 }])).toBe("sized");
    expect(pick([{ url: "only" }])).toBe("only");
  });

  it("leaves the provider's list in its order", () => {
    const images = [
      { url: "small", width: 160 },
      { url: "large", width: 1000 },
    ];
    pick(images);
    expect(images.map((image) => image.url)).toEqual(["small", "large"]);
  });
});
