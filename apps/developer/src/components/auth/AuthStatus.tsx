import { CheckCircleIcon, EnvelopeSimpleIcon, WarningCircleIcon } from "@phosphor-icons/react";
import type { ReactNode } from "react";
import { AuthStatusTone, type AuthStatusToneValue } from "@/lib/authStatusTone";

/**
 * Icon + accent classes per {@link AuthStatusTone}, keyed via computed keys so
 * the visual lookup stays separate from the tone literal namespace.
 */
const TONE_STYLE = {
  [AuthStatusTone.Success]: { Icon: CheckCircleIcon, iconClass: "text-accent" },
  [AuthStatusTone.Info]: { Icon: EnvelopeSimpleIcon, iconClass: "text-accent" },
  [AuthStatusTone.Error]: { Icon: WarningCircleIcon, iconClass: "text-red-400" },
} as const;

/**
 * Props for {@link AuthStatus}.
 */
export interface AuthStatusProps {
  /** Visual tone, selecting the icon and accent colour. */
  tone: AuthStatusToneValue;
  /** Short heading summarising the outcome. */
  title: string;
  /** Optional supporting copy below the heading. */
  children?: ReactNode;
}

/**
 * A centred status panel shown after an auth form resolves — the shared shape
 * for "check your email", "email verified", "password updated", and recoverable
 * error notices. Token-driven: a glassy icon chip over the surface, the tone's
 * accent for the icon, muted body copy.
 *
 * @param props - See {@link AuthStatusProps}.
 * @returns The status panel markup.
 */
export function AuthStatus({ tone, title, children }: AuthStatusProps) {
  const { Icon, iconClass } = TONE_STYLE[tone];
  return (
    <div className="flex flex-col items-center text-center gap-3 py-2">
      <span className="inline-flex items-center justify-center size-12 rounded-full border border-border bg-surface">
        <Icon weight="duotone" className={`size-7 ${iconClass}`} aria-hidden="true" />
      </span>
      <h2 className="text-card-title font-medium text-fg">{title}</h2>
      {children ? <p className="text-body text-fg-muted max-w-xs">{children}</p> : null}
    </div>
  );
}
