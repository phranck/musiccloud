import { describe, expect, it } from "vitest";
import { BankErrorCode } from "../bank-connection.js";
import { ERROR_CODE_REGISTRY, getErrorEntry, MC_ERROR_CODE_PATTERN } from "../error-codes.js";

describe("the bank connection's error codes", () => {
  it.each(Object.values(BankErrorCode))("finds %s written out in the registry", (code) => {
    // A code only the constant names would be answered with the area's generic
    // message and status, which is not what the dashboard tells apart.
    expect(Object.hasOwn(ERROR_CODE_REGISTRY, code)).toBe(true);
    expect(getErrorEntry(code).code).toBe(code);
    expect(MC_ERROR_CODE_PATTERN.test(code)).toBe(true);
  });
});
