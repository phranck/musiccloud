import { describe, it, expect } from "vitest";
import { isValidServiceId } from "../services/types";

describe("isValidServiceId", () => {
  it("should accept 'spotify'", () => {
    expect(isValidServiceId("spotify")).toBe(true);
  });

  it("should accept 'apple-music'", () => {
    expect(isValidServiceId("apple-music")).toBe(true);
  });

  it("should accept 'youtube'", () => {
    expect(isValidServiceId("youtube")).toBe(true);
  });

  it("should accept 'soundcloud'", () => {
    expect(isValidServiceId("soundcloud")).toBe(true);
  });

  it("should accept 'tidal'", () => {
    expect(isValidServiceId("tidal")).toBe(true);
  });

  it("should accept 'deezer'", () => {
    expect(isValidServiceId("deezer")).toBe(true);
  });

  it("should reject empty string", () => {
    expect(isValidServiceId("")).toBe(false);
  });

  it("should reject number", () => {
    expect(isValidServiceId(42)).toBe(false);
  });

  it("should reject null", () => {
    expect(isValidServiceId(null)).toBe(false);
  });

  it("should reject undefined", () => {
    expect(isValidServiceId(undefined)).toBe(false);
  });
});
