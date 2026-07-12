/**
 * @file Shared button visual-variant domain for the Developer Portal.
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
  /** Brand-blue fill with a white label: the primary call to action. */
  Primary: "Primary",
  /** Neutral glassy surface with a hairline border: secondary actions. */
  Secondary: "Secondary",
  /** Accent outline with no solid fill for commands inside content. */
  Content: "Content",
  /** Quiet transparent command with standard button geometry. */
  Subtle: "Subtle",
  /** Neutral square control for icon-only commands. */
  Icon: "Icon",
  /** Semantic danger outline for irreversible actions. */
  Danger: "Danger",
} as const;

/** A {@link ButtonVariant} member value. */
export type ButtonVariantValue = (typeof ButtonVariant)[keyof typeof ButtonVariant];

/** Shared CSS modifier selected by each domain variant. */
const BUTTON_VARIANT_CLASS: Record<ButtonVariantValue, string> = {
  [ButtonVariant.Primary]: "button--primary",
  [ButtonVariant.Secondary]: "button--secondary",
  [ButtonVariant.Content]: "button--content",
  [ButtonVariant.Subtle]: "button--subtle",
  [ButtonVariant.Icon]: "button--icon",
  [ButtonVariant.Danger]: "button--danger",
};

/** Resolves a domain variant to the corresponding shared CSS recipe. */
export function buttonVariantClass(variant: ButtonVariantValue): string {
  return BUTTON_VARIANT_CLASS[variant];
}
