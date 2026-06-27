/**
 * @file Button visual-variant domain namespace for the developer-portal auth UI.
 *
 * Kept out of the button component file so the component module exports only its
 * component (React Doctor's "non-component export" rule) and so the variant can
 * be referenced from forms without importing the button.
 */

/**
 * Visual variants for the auth submit button, modelled as a PascalCase
 * `as const` domain namespace so the variant value is never an inline
 * discriminant literal (per the project domain-literals policy).
 */
export const ButtonVariant = {
  /** Brand-blue fill with a white label — the primary call to action. */
  Primary: "Primary",
  /** Neutral glassy surface with a hairline border — secondary actions. */
  Secondary: "Secondary",
} as const;

/** A {@link ButtonVariant} member value. */
export type ButtonVariantValue = (typeof ButtonVariant)[keyof typeof ButtonVariant];
