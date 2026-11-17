import { describe, expect, it } from "vitest";

import { normalizeAmountInput, readAmountInput } from "./amountInput";

describe("normalizeAmountInput", () => {
  it("reads a comma and a full stop alike as the decimal separator", () => {
    expect(normalizeAmountInput("12,50")).toBe("12.50");
    expect(normalizeAmountInput("12.50")).toBe("12.50");
  });

  it("reads a separator followed by three digits as grouping thousands", () => {
    expect(normalizeAmountInput("1,000")).toBe("1000");
    expect(normalizeAmountInput("1.000")).toBe("1000");
  });

  it("drops currency signs, spaces and letters", () => {
    expect(normalizeAmountInput("€ 20")).toBe("20");
    expect(normalizeAmountInput("20 EUR")).toBe("20");
  });

  it("keeps a trailing separator, because the cents are about to follow", () => {
    expect(normalizeAmountInput("33,")).toBe("33.");
  });

  it("cuts the cents to two digits and leading zeros to one", () => {
    expect(normalizeAmountInput("4.9999")).toBe("4.99");
    expect(normalizeAmountInput("4.9")).toBe("4.9");
    expect(normalizeAmountInput("007")).toBe("7");
    expect(normalizeAmountInput(",5")).toBe("0.5");
  });

  it("returns nothing for a field without a digit", () => {
    expect(normalizeAmountInput("abc")).toBe("");
  });
});

describe("readAmountInput", () => {
  it("reads a normalized amount", () => {
    expect(readAmountInput("12.50")).toBe(12.5);
  });

  it("reads nothing where no amount above zero stands", () => {
    expect(readAmountInput("")).toBeNull();
    expect(readAmountInput("0")).toBeNull();
    expect(readAmountInput("0.")).toBeNull();
  });
});
