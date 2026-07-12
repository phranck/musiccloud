import { describe, expect, it } from "vitest";
import { isDirectCommonJsEntrypoint } from "../server.js";

describe("backend CommonJS entrypoint", () => {
  it("starts only when the bundled module is Node's direct entrypoint", () => {
    const entrypoint = {} as NodeModule;

    expect(isDirectCommonJsEntrypoint(entrypoint, entrypoint)).toBe(true);
    expect(isDirectCommonJsEntrypoint(entrypoint, {} as NodeModule)).toBe(false);
    expect(isDirectCommonJsEntrypoint(entrypoint, undefined)).toBe(false);
  });
});
