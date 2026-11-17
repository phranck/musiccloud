/**
 * @file The payload of an EPC QR code, which German and Austrian banking apps
 * call a GiroCode. Scanning one fills in a SEPA credit transfer, so the payer
 * never types an IBAN.
 *
 * The format is EPC069-12 of the European Payments Council, version 3.1 of
 * 19 March 2024. Two of its properties decide how it may be used, and both are
 * enforced here rather than left to the caller.
 *
 * The payload carries exactly one credit transfer. It has no field for an
 * interval or a standing order, so a GiroCode cannot express a recurring
 * payment.
 *
 * The whole payload is limited to {@link EPC_MAX_PAYLOAD_BYTES}. A scanner need
 * not read anything longer, so {@link buildEpcQrPayload} refuses rather than
 * producing a code that fails in the payer's hand.
 */

import { isValidCreditorReference } from "./creditor-reference.js";
import { SPONSORING_LIMITS } from "./sponsoring.js";

/** The largest payload a scanner must read, in bytes: 331. */
export const EPC_MAX_PAYLOAD_BYTES = 331;

/** The longest IBAN the format carries: 34 characters. */
const MAX_IBAN = 34;

/** The longest BIC the format carries: 11 characters. */
const MAX_BIC = 11;

/** The smallest amount the format carries: 0.01 euros. */
const MIN_AMOUNT_EUR = 0.01;

/** The largest amount the format carries: 999,999,999.99 euros. */
const MAX_AMOUNT_EUR = 999_999_999.99;

/** Decimals an amount is written with: 2. */
const AMOUNT_DECIMALS = 2;

/** An IBAN in the shape the format accepts, after spaces are removed. */
const IBAN_SHAPE = /^[A-Z]{2}[0-9]{2}[A-Z0-9]{1,30}$/;

/** A BIC in the shape the format accepts, after spaces are removed. */
const BIC_SHAPE = /^[A-Z0-9]+$/;

/**
 * The header lines every payload opens with.
 *
 * - `BCD`: the service tag a banking app matches on.
 * - `002`: the version that makes the BIC optional inside the EEA.
 * - `1`: the character set, UTF-8.
 * - `SCT`: SEPA credit transfer, the only identification the format defines.
 */
const PAYLOAD_HEADER = ["BCD", "002", "1", "SCT"] as const;

/**
 * The details a GiroCode encodes.
 *
 * @property beneficiaryName - The account holder as the bank holds it, 1 to
 *   {@link SPONSORING_LIMITS.payeeNameMaxLength} characters.
 * @property iban - The account, with or without spaces.
 * @property bic - The bank. Optional inside the EEA; empty or absent leaves it out.
 * @property amountEur - The amount in euros. Absent lets the payer decide in
 *   their banking app.
 * @property remittance - The sentence the payer's statement shows, at most
 *   {@link SPONSORING_LIMITS.purposeMaxLength} characters.
 * @property creditorReference - A structured ISO 11649 reference instead of
 *   that sentence. The format permits one of the two, never both.
 */
export interface EpcQrDetails {
  beneficiaryName: string;
  iban: string;
  bic?: string;
  amountEur?: number;
  remittance?: string;
  creditorReference?: string;
}

/**
 * Why a payload could not be built.
 *
 * - `BeneficiaryNameMissing` / `BeneficiaryNameTooLong`: the name is empty or too long.
 * - `IbanInvalid` / `BicInvalid`: the account or the bank is not in a shape the format accepts.
 * - `AmountOutOfRange`: the amount is not between 0.01 and 999,999,999.99 euros.
 * - `RemittanceTooLong`: the sentence is too long.
 * - `CreditorReferenceInvalid`: the reference fails its shape or its check digits.
 * - `RemittanceConflict`: both a sentence and a reference were given.
 * - `PayloadTooLarge`: the finished payload exceeds {@link EPC_MAX_PAYLOAD_BYTES}.
 */
export const EpcQrErrorCode = {
  BeneficiaryNameMissing: "beneficiary-name-missing",
  BeneficiaryNameTooLong: "beneficiary-name-too-long",
  IbanInvalid: "iban-invalid",
  BicInvalid: "bic-invalid",
  AmountOutOfRange: "amount-out-of-range",
  RemittanceTooLong: "remittance-too-long",
  CreditorReferenceInvalid: "creditor-reference-invalid",
  RemittanceConflict: "remittance-conflict",
  PayloadTooLarge: "payload-too-large",
} as const;

/** An {@link EpcQrErrorCode} member value. */
export type EpcQrErrorCodeValue = (typeof EpcQrErrorCode)[keyof typeof EpcQrErrorCode];

/** Raised when the details cannot produce a payload a scanner accepts. */
export class EpcQrError extends Error {
  /** Which rule failed, so a caller can branch without reading the message. */
  readonly code: EpcQrErrorCodeValue;

  /**
   * @param code - Which rule failed.
   * @param message - What failed, in a sentence.
   */
  constructor(code: EpcQrErrorCodeValue, message: string) {
    super(message);
    this.name = "EpcQrError";
    this.code = code;
  }
}

/**
 * Removes spaces and upper-cases an account or bank code.
 *
 * @param value - The code as typed.
 * @returns The code as the format carries it.
 */
function compactCode(value: string): string {
  return value.replace(/\s+/g, "").toUpperCase();
}

/**
 * Writes an amount the way the format requires: `EUR`, then the value with a
 * full stop and two decimals and no grouping. A locale format must not be used,
 * because a German locale writes a comma and the code would be refused.
 *
 * @param amountEur - The amount in euros.
 * @returns The amount line, such as `EUR12.50`.
 */
function formatAmount(amountEur: number): string {
  return `EUR${amountEur.toFixed(AMOUNT_DECIMALS)}`;
}

/**
 * Builds the payload of an EPC QR code.
 *
 * The result goes straight to a QR encoder. It is not a URL and must not be
 * encoded or wrapped, because a banking app matches on the leading service tag.
 *
 * @param details - Who is paid, how much, and what for.
 * @returns The payload, its lines separated by line feeds, without a trailing
 *   empty line.
 * @throws {EpcQrError} When a field is missing, malformed or out of range, or
 *   the payload exceeds {@link EPC_MAX_PAYLOAD_BYTES}.
 */
export function buildEpcQrPayload(details: EpcQrDetails): string {
  const beneficiaryName = details.beneficiaryName.trim();
  if (!beneficiaryName) {
    throw new EpcQrError(EpcQrErrorCode.BeneficiaryNameMissing, "A beneficiary name is required.");
  }
  if (beneficiaryName.length > SPONSORING_LIMITS.payeeNameMaxLength) {
    throw new EpcQrError(
      EpcQrErrorCode.BeneficiaryNameTooLong,
      `The beneficiary name holds at most ${SPONSORING_LIMITS.payeeNameMaxLength} characters.`,
    );
  }

  const iban = compactCode(details.iban);
  if (!IBAN_SHAPE.test(iban) || iban.length > MAX_IBAN) {
    throw new EpcQrError(EpcQrErrorCode.IbanInvalid, "The IBAN is not in a shape the format accepts.");
  }

  const bic = compactCode(details.bic ?? "");
  if (bic && (!BIC_SHAPE.test(bic) || bic.length > MAX_BIC)) {
    throw new EpcQrError(EpcQrErrorCode.BicInvalid, "The BIC is not in a shape the format accepts.");
  }

  const { amountEur } = details;
  if (
    amountEur !== undefined &&
    !(Number.isFinite(amountEur) && amountEur >= MIN_AMOUNT_EUR && amountEur <= MAX_AMOUNT_EUR)
  ) {
    throw new EpcQrError(
      EpcQrErrorCode.AmountOutOfRange,
      `The amount lies between ${MIN_AMOUNT_EUR} and ${MAX_AMOUNT_EUR} euros.`,
    );
  }

  const remittance = details.remittance?.trim() ?? "";
  if (remittance.length > SPONSORING_LIMITS.purposeMaxLength) {
    throw new EpcQrError(
      EpcQrErrorCode.RemittanceTooLong,
      `The remittance holds at most ${SPONSORING_LIMITS.purposeMaxLength} characters.`,
    );
  }

  const creditorReference = compactCode(details.creditorReference ?? "");
  if (creditorReference && !isValidCreditorReference(creditorReference)) {
    throw new EpcQrError(
      EpcQrErrorCode.CreditorReferenceInvalid,
      "The creditor reference is not a sound ISO 11649 reference.",
    );
  }
  // Two ways of saying one thing, and the format permits one. Refusing both is
  // better than choosing for the caller, because the dropped one would vanish
  // without a word.
  if (creditorReference && remittance) {
    throw new EpcQrError(
      EpcQrErrorCode.RemittanceConflict,
      "A payload carries a creditor reference or a remittance, not both.",
    );
  }

  const lines = [
    ...PAYLOAD_HEADER,
    bic,
    beneficiaryName,
    iban,
    amountEur === undefined ? "" : formatAmount(amountEur),
    // The purpose code, which this payload does not use.
    "",
    creditorReference,
    remittance,
  ];

  // The format forbids a separator after the last element that holds a value.
  while (lines.length > 0 && lines[lines.length - 1] === "") lines.pop();

  const payload = lines.join("\n");
  const byteLength = new TextEncoder().encode(payload).length;
  if (byteLength > EPC_MAX_PAYLOAD_BYTES) {
    throw new EpcQrError(
      EpcQrErrorCode.PayloadTooLarge,
      `The payload is ${byteLength} bytes and may not exceed ${EPC_MAX_PAYLOAD_BYTES}.`,
    );
  }
  return payload;
}
