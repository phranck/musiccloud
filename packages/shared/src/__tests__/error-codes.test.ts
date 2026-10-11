import { describe, expect, it } from "vitest";
import { getErrorEntry, isServiceNotFoundCode, serviceErrorDigits } from "../error-codes.js";

describe("serviceErrorDigits", () => {
  it("gives a one-digit prefix the status's three digits", () => {
    expect(serviceErrorDigits("3", "404")).toBe("3404");
    expect(serviceErrorDigits("1", "001")).toBe("1001");
  });

  it("gives a two-digit prefix a two-digit hint, so the code stays four digits wide", () => {
    expect(serviceErrorDigits("84", "404")).toBe("8404");
    expect(serviceErrorDigits("80", "404")).toBe("8004");
    expect(serviceErrorDigits("80", "429")).toBe("8029");
    expect(serviceErrorDigits("80", "001")).toBe("8001");
  });
});

describe("isServiceNotFoundCode", () => {
  it("recognises a not found under either prefix scheme", () => {
    expect(isServiceNotFoundCode("MC-API-3404")).toBe(true);
    expect(isServiceNotFoundCode("MC-API-8404")).toBe(true);
    expect(isServiceNotFoundCode("MC-API-8004")).toBe(true);
    // YouTube Music's two-digit prefix sits inside YouTube's one-digit group.
    expect(isServiceNotFoundCode("MC-API-6504")).toBe(true);
    expect(isServiceNotFoundCode("MC-API-6404")).toBe(true);
  });

  it("leaves other per-service codes and the cross-cutting group alone", () => {
    expect(isServiceNotFoundCode("MC-API-3429")).toBe(false);
    expect(isServiceNotFoundCode("MC-API-8029")).toBe(false);
    expect(isServiceNotFoundCode("MC-API-8001")).toBe(false);
    expect(isServiceNotFoundCode("MC-AUTH-3401")).toBe(false);
    expect(isServiceNotFoundCode("MC-API-0004")).toBe(false);
  });
});

describe("getErrorEntry for per-service codes", () => {
  it("answers 404 for a not found that has no entry of its own", () => {
    expect(getErrorEntry("MC-API-8404").httpStatus).toBe(404);
    expect(getErrorEntry("MC-API-8004").httpStatus).toBe(404);
  });

  it("keeps an entry the registry writes out", () => {
    expect(getErrorEntry("MC-API-1404").userMessage).toContain("Apple Music");
  });

  it("keeps 503 for a service's other failures", () => {
    expect(getErrorEntry("MC-API-8401").httpStatus).toBe(503);
    expect(getErrorEntry("MC-API-3001").httpStatus).toBe(503);
  });
});
