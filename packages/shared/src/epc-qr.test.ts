import { describe, expect, it } from "vitest";
import { isValidCreditorReference } from "./creditor-reference.js";
import { buildEpcQrPayload, EPC_MAX_PAYLOAD_BYTES, EpcQrError, EpcQrErrorCode } from "./epc-qr.js";
import { ibanChecksumHolds } from "./sponsoring.js";

/** The worked example of ISO 11649 Annex A. */
const ISO_EXAMPLE_REFERENCE = "RF18539007547034";

/** A payee the format accepts. */
const PAYEE = { beneficiaryName: "Frank Gregor", iban: "AT61 1904 3002 3457 3201", bic: "bkau atww" };

/**
 * Builds a payload and returns the error code it was refused with.
 *
 * @param details - What to encode.
 * @returns The error's code, or `null` when nothing was refused.
 */
function refusal(details: Parameters<typeof buildEpcQrPayload>[0]): string | null {
  try {
    buildEpcQrPayload(details);
    return null;
  } catch (error) {
    return error instanceof EpcQrError ? error.code : "unexpected";
  }
}

describe("buildEpcQrPayload", () => {
  it("carries a remittance sentence in the last line, with the amount in the format's notation", () => {
    expect(buildEpcQrPayload({ ...PAYEE, amountEur: 12.5, remittance: "Donation: musiccloud.io" })).toBe(
      [
        "BCD",
        "002",
        "1",
        "SCT",
        "BKAUATWW",
        "Frank Gregor",
        "AT611904300234573201",
        "EUR12.50",
        "",
        "",
        "Donation: musiccloud.io",
      ].join("\n"),
    );
  });

  it("carries a creditor reference in its own line and drops the empty lines after it", () => {
    expect(buildEpcQrPayload({ ...PAYEE, amountEur: 40, creditorReference: "rf18 5390 0754 7034" })).toBe(
      [
        "BCD",
        "002",
        "1",
        "SCT",
        "BKAUATWW",
        "Frank Gregor",
        "AT611904300234573201",
        "EUR40.00",
        "",
        ISO_EXAMPLE_REFERENCE,
      ].join("\n"),
    );
  });

  it("leaves the amount for the payer when none is given, and the BIC empty when none is named", () => {
    const lines = buildEpcQrPayload({ beneficiaryName: "Frank Gregor", iban: PAYEE.iban, remittance: "x" }).split("\n");

    expect(lines[4]).toBe("");
    expect(lines[7]).toBe("");
  });

  it.each([
    ["an empty name", { ...PAYEE, beneficiaryName: " " }, EpcQrErrorCode.BeneficiaryNameMissing],
    ["a name over 70 characters", { ...PAYEE, beneficiaryName: "x".repeat(71) }, EpcQrErrorCode.BeneficiaryNameTooLong],
    ["a malformed IBAN", { ...PAYEE, iban: "AT6X" }, EpcQrErrorCode.IbanInvalid],
    ["a malformed BIC", { ...PAYEE, bic: "BKAU-ATWW" }, EpcQrErrorCode.BicInvalid],
    ["a zero amount", { ...PAYEE, amountEur: 0 }, EpcQrErrorCode.AmountOutOfRange],
    ["an amount above the format's largest", { ...PAYEE, amountEur: 1_000_000_000 }, EpcQrErrorCode.AmountOutOfRange],
    ["a remittance over 140 characters", { ...PAYEE, remittance: "x".repeat(141) }, EpcQrErrorCode.RemittanceTooLong],
    [
      "a damaged reference",
      { ...PAYEE, creditorReference: "RF19539007547034" },
      EpcQrErrorCode.CreditorReferenceInvalid,
    ],
    [
      "a reference and a remittance together",
      { ...PAYEE, creditorReference: ISO_EXAMPLE_REFERENCE, remittance: "Donation" },
      EpcQrErrorCode.RemittanceConflict,
    ],
  ] as const)("refuses %s", (_case, details, code) => {
    expect(refusal(details)).toBe(code);
  });

  it("refuses a payload a scanner need not read", () => {
    // The name and remittance stay inside their own limits; their bytes do not.
    const wide = "€".repeat(70);
    expect(refusal({ ...PAYEE, beneficiaryName: wide, remittance: "€".repeat(140) })).toBe(
      EpcQrErrorCode.PayloadTooLarge,
    );
    expect(new TextEncoder().encode(wide).length).toBeLessThan(EPC_MAX_PAYLOAD_BYTES);
  });
});

describe("check digits", () => {
  it("hold for the ISO 11649 example in either case and with spaces", () => {
    expect(isValidCreditorReference(ISO_EXAMPLE_REFERENCE)).toBe(true);
    expect(isValidCreditorReference("rf18 5390 0754 7034")).toBe(true);
    expect(isValidCreditorReference("RF18539007547035")).toBe(false);
    expect(isValidCreditorReference("XX18539007547034")).toBe(false);
  });

  it("still hold for an IBAN after the check moved to the shared module", () => {
    expect(ibanChecksumHolds("AT611904300234573201")).toBe(true);
    expect(ibanChecksumHolds("AT611904300234573202")).toBe(false);
  });
});
