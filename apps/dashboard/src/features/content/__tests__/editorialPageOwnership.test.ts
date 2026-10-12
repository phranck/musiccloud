import { describe, expect, it } from "vitest";

import { isSystemOwnedDocsPath } from "@/features/content/editorialPageOwnership";

describe("isSystemOwnedDocsPath", () => {
  // The backend normalizes each of these to a reserved path or an editorial
  // one, or refuses it. The dashboard warns about exactly the reserved ones.
  it.each([
    ["docs/api", true],
    ["//docs//x", true],
    ["/docs/", false],
    ["/docs", false],
    ["/docs/../x", false],
    ["/%64ocs/x", true],
    ["/docs\\x", false],
    ["/a?b", false],
    ["/pricing", false],
    ["/pricing/x", true],
  ])("treats %s as reserved: %s", (path, reserved) => {
    expect(isSystemOwnedDocsPath(path)).toBe(reserved);
  });
});
