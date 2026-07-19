import { describe, expect, it } from "vitest";

import { MC_ERROR_CODE_PATTERN, PUBLIC_ERROR_CODE_CATALOG } from "./public-error-catalog.js";

describe("public error catalog", () => {
  it("projects the registry to stable SDK-safe fields", () => {
    expect(PUBLIC_ERROR_CODE_CATALOG.length).toBeGreaterThan(0);
    expect(PUBLIC_ERROR_CODE_CATALOG).toEqual(
      [...PUBLIC_ERROR_CODE_CATALOG].sort((left, right) => left.code.localeCompare(right.code)),
    );

    for (const entry of PUBLIC_ERROR_CODE_CATALOG) {
      expect(Object.keys(entry).sort()).toEqual(["code", "httpStatus", "message"]);
      expect(entry.code).toMatch(MC_ERROR_CODE_PATTERN);
      expect(entry.httpStatus).toBeGreaterThanOrEqual(400);
      expect(entry.httpStatus).toBeLessThan(600);
      expect(entry.message).not.toHaveLength(0);
      expect(entry).not.toHaveProperty("internalNote");
      expect(entry).not.toHaveProperty("source");
    }
  });

  it("accepts future well-formed codes without weakening the shape", () => {
    expect(MC_ERROR_CODE_PATTERN.test("MC-API-3999")).toBe(true);
    expect(MC_ERROR_CODE_PATTERN.test("MC-UNKNOWN-3999")).toBe(false);
    expect(MC_ERROR_CODE_PATTERN.test("MC-API-secret")).toBe(false);
  });
});
