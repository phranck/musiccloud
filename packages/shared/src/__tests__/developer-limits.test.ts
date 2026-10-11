import { describe, expect, it } from "vitest";
import { PASSWORD_MAX_LENGTH, PASSWORD_MIN_LENGTH, validatePasswordLength } from "../developer-limits.js";

const REFUSAL = `password must be between ${PASSWORD_MIN_LENGTH} and ${PASSWORD_MAX_LENGTH} characters.`;

describe("validatePasswordLength", () => {
  it("accepts a password at either bound", () => {
    expect(validatePasswordLength("a".repeat(PASSWORD_MIN_LENGTH))).toBeNull();
    expect(validatePasswordLength("a".repeat(PASSWORD_MAX_LENGTH))).toBeNull();
  });

  it("refuses a password just outside either bound", () => {
    expect(validatePasswordLength("")).toBe(REFUSAL);
    expect(validatePasswordLength("a".repeat(PASSWORD_MIN_LENGTH - 1))).toBe(REFUSAL);
    expect(validatePasswordLength("a".repeat(PASSWORD_MAX_LENGTH + 1))).toBe(REFUSAL);
  });

  it("refuses a value that is not a string, as a request body can carry one", () => {
    expect(validatePasswordLength(12345678)).toBe(REFUSAL);
    expect(validatePasswordLength(undefined)).toBe(REFUSAL);
    expect(validatePasswordLength(null)).toBe(REFUSAL);
    expect(validatePasswordLength({ length: PASSWORD_MIN_LENGTH })).toBe(REFUSAL);
  });
});
