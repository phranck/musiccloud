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
  /** Visual variant; defaults to {@link ButtonVariant.Content}. */
  variant?: ButtonVariantValue;
  /** Native button type; defaults to `submit` for use inside forms. */
  type?: "submit" | "button";
  /** Optional click handler (e.g. for `type="button"` actions like logout). */
  onClick?: () => void;
  /**
   * Extra classes for placement only, such as pushing a destructive action
   * away from the group it must not be confused with.
   */
  className?: string;
}

/**
 * Form submit button styled from the developer-portal tokens. It is as wide as
 * its label, everywhere: a button never spans its container, so a card footer
 * can align its actions to the right edge.
 *
 * The default is the accent outline, because nothing in this portal is filled:
 * a solid button takes an emphasis the surrounding cards never ask for. The
 * secondary variant is a neutral glassy surface, and the danger variant is a
 * red outline for irreversible actions such as deleting an account. While
 * `loading`, it renders a spinning icon and is disabled to prevent double
 * submits.
 *
 * @param props - See {@link SubmitButtonProps}.
 * @returns The button element.
 */
export function SubmitButton({
  children,
  loading = false,
  variant = ButtonVariant.Content,
  type = "submit",
  onClick,
  className = "",
}: SubmitButtonProps) {
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={loading}
      className={`button text-body ${buttonVariantClass(variant)} ${className}`}
    >
      {loading ? <RefreshIcon className="size-5 animate-spin" aria-hidden="true" /> : null}
      {children}
    </button>
  );
}
