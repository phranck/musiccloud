/**
 * @file The failure every part of the bank connection throws.
 */

import { type BankErrorCodeValue, getErrorEntry } from "@musiccloud/shared";

/**
 * Raised when an operation of the bank connection did not succeed.
 *
 * It carries the `MC-BANK-*` code the route answers with, so the mapping from
 * a failure to what the operator is told lives at the throw rather than being
 * worked out again by every caller, as `CreemProductError` does for Creem. The
 * message is that code's registry text, so the log and the operator read the
 * same words, and it never contains a token, a code, a state or a session.
 */
export class BankConnectionError extends Error {
  /** The stable `MC-BANK-*` code for this failure. */
  readonly code: BankErrorCodeValue;

  /**
   * @param code - The code the route answers with.
   * @param options - Standard error options, used to carry the cause.
   */
  constructor(code: BankErrorCodeValue, options?: ErrorOptions) {
    super(getErrorEntry(code).userMessage, options);
    this.name = "BankConnectionError";
    this.code = code;
  }
}
