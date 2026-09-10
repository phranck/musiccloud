/**
 * @file Developer-portal auth error-code namespace + label mapping.
 *
 * The backend's developer-auth routes return a `{ error, message }` shape where
 * `error` is a stable machine code (`apps/backend/src/routes/developer-auth.ts`).
 * The portal forms branch on those codes to render a friendly inline message.
 * Modelling the codes as an `as const` namespace keeps the literals in one place
 * (no repeated inline strings scattered across the forms) and gives the forms a
 * typed value to compare against.
 *
 * Members are PascalCase (per the project domain-literals policy); their values
 * are the verbatim backend codes, so `data.error === AuthErrorCode.InvalidCredentials`
 * matches the wire payload exactly.
 */

/**
 * Machine error codes returned by the backend developer-auth endpoints.
 *
 * Keyed in PascalCase; each value is the exact string the backend sends in the
 * `error` field of a non-2xx response.
 */
export const AuthErrorCode = {
  /** 400: a required field was missing or failed validation. */
  InvalidRequest: "INVALID_REQUEST",
  /** 400: the address in the body cannot be an address at all. */
  InvalidEmail: "INVALID_EMAIL",
  /** 409: signup with an email that already has an account. */
  EmailTaken: "EMAIL_TAKEN",
  /** 401: login email/password did not match. */
  InvalidCredentials: "INVALID_CREDENTIALS",
  /** 403: login attempt on an account whose email is not yet verified. */
  EmailNotVerified: "EMAIL_NOT_VERIFIED",
  /** 400: a verification or password-reset token is unknown, expired, or used. */
  InvalidToken: "INVALID_TOKEN",
} as const;

/** A {@link AuthErrorCode} member value (the verbatim backend code string). */
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
  [AuthErrorCode.InvalidToken]: "This link is invalid or has expired.",
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
