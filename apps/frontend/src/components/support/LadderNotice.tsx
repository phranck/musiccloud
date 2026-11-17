/**
 * @file A notice set into a support ladder card.
 */

import { InfoIcon } from "@phosphor-icons/react";
import type { ReactNode } from "react";

import { raisedControlRadius } from "@/components/cards/cardGeometry";
import { RecessedCard } from "@/components/cards/RecessedCard";
import { cn } from "@/lib/utils";

/** Props of {@link LadderNotice}. */
interface LadderNoticeProps {
  /** What the notice says. */
  children: ReactNode;
  /** Classes of the notice. */
  className?: string;
}

/**
 * A notice set into a card: something to read once before acting.
 *
 * A recessed well at the control level of the radius cascade, because it sits
 * inside a card the way a control does.
 *
 * @param props - See {@link LadderNoticeProps}.
 * @returns The notice.
 */
export function LadderNotice({ children, className }: LadderNoticeProps) {
  return (
    <RecessedCard radius={raisedControlRadius} className={cn("flex gap-2 text-sm text-text-secondary", className)}>
      <InfoIcon weight="duotone" aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-[var(--color-accent)]" />
      <div className="min-w-0">{children}</div>
    </RecessedCard>
  );
}
