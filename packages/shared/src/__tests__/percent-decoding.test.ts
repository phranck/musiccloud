import { describe, expect, it } from "vitest";
import { tryDecodeURIComponent } from "../percent-decoding.js";

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
