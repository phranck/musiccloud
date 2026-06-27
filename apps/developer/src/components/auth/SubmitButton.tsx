import { CircleNotchIcon } from "@phosphor-icons/react";
import type { ReactNode } from "react";
import { ButtonVariant, type ButtonVariantValue } from "@/lib/buttonVariant";

/**
 * Per-variant Tailwind classes, keyed by the {@link ButtonVariant} members via
 * computed keys. Kept as a plain lookup (not a domain namespace) so styling and
 * the literal namespace stay separate.
 */
const VARIANT_CLASS: Record<ButtonVariantValue, string> = {
  [ButtonVariant.Primary]: "bg-accent text-on-accent hover:bg-accent-hover",
  [ButtonVariant.Secondary]: "bg-surface text-fg border border-border-strong hover:border-fg-subtle",
};

/**
 * Props for {@link SubmitButton}.
 */
export interface SubmitButtonProps {
  /** Button label / content. */
  children: ReactNode;
  /**
   * When `true`, shows a spinner and disables the button so a submission cannot
   * be triggered twice.
   */
  loading?: boolean;
  /** Visual variant; defaults to {@link ButtonVariant.Primary}. */
  variant?: ButtonVariantValue;
  /** Native button type; defaults to `submit` for use inside forms. */
  type?: "submit" | "button";
  /** Optional click handler (e.g. for `type="button"` actions like logout). */
  onClick?: () => void;
}

/**
 * Full-width form submit button styled from the developer-portal tokens. The
 * primary variant is brand-blue with a white label (`--color-on-accent`); the
 * secondary variant is a neutral glassy surface. While `loading`, it renders a
 * Phosphor spinner and is disabled to prevent double submits.
 *
 * @param props - See {@link SubmitButtonProps}.
 * @returns The button element.
 */
export function SubmitButton({
  children,
  loading = false,
  variant = ButtonVariant.Primary,
  type = "submit",
  onClick,
}: SubmitButtonProps) {
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={loading}
      className={`inline-flex w-full items-center justify-center gap-2 rounded-button px-4 py-2.5 text-body font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-60 ${VARIANT_CLASS[variant]}`}
    >
      {loading ? <CircleNotchIcon weight="bold" className="size-5 animate-spin" aria-hidden="true" /> : null}
      {children}
    </button>
  );
}
