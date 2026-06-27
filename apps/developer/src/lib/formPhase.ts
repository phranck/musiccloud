/**
 * @file Form submission-phase domain namespace for the auth islands.
 *
 * Each auth form is a tiny finite state machine: idle until the user submits,
 * submitting while the request is in flight, then either success or error.
 * Modelling the phase as an `as const` namespace (PascalCase members per the
 * project domain-literals policy) keeps the form code free of inline `"idle"` /
 * `"error"` discriminant literals and gives the views a typed value to switch on.
 */

/**
 * Lifecycle phases of an auth form submission.
 *
 * `Idle` → `Submitting` → (`Success` | `Error`). Error is recoverable: a form
 * returns to `Idle`/`Submitting` on the next attempt.
 */
export const FormPhase = {
  /** No request in flight; awaiting user input. */
  Idle: "Idle",
  /** A request is in flight; controls disabled, spinner shown. */
  Submitting: "Submitting",
  /** The request succeeded; the success panel is shown. */
  Success: "Success",
  /** The request failed; an inline error is shown, retry allowed. */
  Error: "Error",
} as const;

/** A {@link FormPhase} member value. */
export type FormPhaseValue = (typeof FormPhase)[keyof typeof FormPhase];
