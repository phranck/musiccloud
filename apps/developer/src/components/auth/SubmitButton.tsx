import type { ReactNode } from "react";
import { ButtonVariant, type ButtonVariantValue, buttonVariantClass } from "@/lib/buttonVariant";
import { RefreshIcon } from "@/lib/icons";

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
 * secondary variant is a neutral glassy surface; the danger variant is red,
 * for irreversible destructive actions (e.g. account deletion). While
 * `loading`, it renders a spinning icon and is disabled to prevent double
 * submits.
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
      className={`button w-full text-body ${buttonVariantClass(variant)}`}
    >
      {loading ? <RefreshIcon className="size-5 animate-spin" aria-hidden="true" /> : null}
      {children}
    </button>
  );
}
