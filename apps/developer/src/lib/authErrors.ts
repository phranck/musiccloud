/**
 * @file Developer-portal auth error-code namespace + label mapping.
 *
 * The backend returns a `{ error, message }` shape where `error` is a stable
 * machine code. The portal forms branch on those codes to render a friendly
 * inline message. Modelling the codes as an `as const` namespace keeps the
 * literals in one place (no repeated inline strings scattered across the forms)
 * and gives the forms a typed value to compare against.
 *
 * The value to compare against is what reaches the browser, which is not always
 * what the route handler wrote. `registerApiErrorHandling` in the backend
 * replaces any code outside the `MC-` scheme with the one that matches the
 * status, so `MC-REQ-0006` is what a rejected address arrives as, and a code a
 * handler invents for itself never survives the trip.
 *
 * Members are PascalCase, per the project domain-literals policy.
 */

/**
 * The codes a developer-auth failure arrives as, named for what they mean on a
 * form.
 *
 * Keyed in PascalCase; each value is the string that reaches the browser in the
 * `error` field of a non-2xx response. A generic status code such as the `400`
 * a short password arrives as has no member here, because a form cannot tell
 * from it what went wrong.
 */
export const AuthErrorCode = {
  /** 400: the address in the body cannot be an address at all. */
  InvalidEmail: "MC-REQ-0006",
  /** 409: signup with an email that already has an account. */
  EmailTaken: "MC-REQ-0007",
  /** 401: no valid credential, which on a login form means the pair did not match. */
  InvalidCredentials: "MC-AUTH-0001",
  /** 403: on a login form, an account whose email is not yet verified. */
  EmailNotVerified: "MC-AUTH-0002",
} as const;

/** A {@link AuthErrorCode} member value, as it arrives on the wire. */
export type AuthErrorCodeValue = (typeof AuthErrorCode)[keyof typeof AuthErrorCode];

/**
 * Human-readable fallbacks, keyed by {@link AuthErrorCode} value via computed
 * keys. Used when a form prefers its own copy over the backend's raw `message`.
 * Kept separate from the code namespace so config text and domain literals do
 * not mix.
 */
const ERROR_LABEL: Partial<Record<AuthErrorCodeValue, string>> = {
  [AuthErrorCode.InvalidCredentials]: "Invalid email or password.",
  [AuthErrorCode.InvalidEmail]: "Enter a valid email address.",
  [AuthErrorCode.EmailTaken]: "An account with this email already exists.",
  [AuthErrorCode.EmailNotVerified]: "Please verify your email address before signing in.",
};

/**
 * Whether a failure is about the address the developer typed.
 *
 * A form that cannot tell will attach every message to whichever field it
 * blames by default, so a rejected address is explained under the password.
 * Both refusals a form can get about an address are listed here, so the two
 * cannot be handled differently by accident.
 *
 * @param code - The `error` code from the response body, if any.
 * @returns `true` when the message belongs on the email field.
 */
export function isEmailFieldError(code: string | undefined): boolean {
  return code === AuthErrorCode.InvalidEmail || code === AuthErrorCode.EmailTaken;
}

/**
 * Resolve a friendly label for an auth error response.
 *
 * Prefers the curated {@link ERROR_LABEL} text for a known code, then falls back
 * to the backend's own `message`, then a generic catch-all. Never throws.
 *
 * @param code - The `error` code from the response body, if any.
 * @param backendMessage - The backend's `message` field, if any.
 * @returns A non-empty string suitable for inline display.
 */
export function authErrorLabel(code: string | undefined, backendMessage: string | undefined): string {
  if (code && code in ERROR_LABEL) {
    const label = ERROR_LABEL[code as AuthErrorCodeValue];
    if (label) return label;
  }
  if (backendMessage) return backendMessage;
  return "Something went wrong. Please try again.";
}
