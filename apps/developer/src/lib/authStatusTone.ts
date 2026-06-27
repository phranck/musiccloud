/**
 * @file Visual-tone domain namespace for the auth status panel.
 *
 * Kept out of the {@link AuthStatus} component file so that module exports only
 * its component (React Doctor's "non-component export" rule) and the tone can be
 * referenced from forms without importing the panel.
 */

/**
 * Visual tones for an auth status panel, modelled as a PascalCase `as const`
 * domain namespace (per the project domain-literals policy).
 */
export const AuthStatusTone = {
  /** A completed action (e.g. "Email verified"). */
  Success: "Success",
  /** A neutral informational outcome (e.g. "Check your email"). */
  Info: "Info",
  /** A recoverable failure (e.g. an expired token). */
  Error: "Error",
} as const;

/** An {@link AuthStatusTone} member value. */
export type AuthStatusToneValue = (typeof AuthStatusTone)[keyof typeof AuthStatusTone];
