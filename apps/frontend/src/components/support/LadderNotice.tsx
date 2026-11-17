/**
 * @file A notice of the support ladder, set into a card or standing as a surface of its own.
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
  /**
   * Whether the notice stands as a surface of its own rather than inside a card.
   * `true` gives it the radius and padding of a card of the ladder, such as the
   * transfer card. `false`, the default, gives it the control radius, because
   * it sits inside a card the way a control does.
   */
  inset?: boolean;
}

/**
 * A notice of the support ladder: something to read once before acting.
 *
 * A recessed well with an info mark before the text. Inside a card it stands
 * at the control level of the radius cascade. As a surface of its own, beside
 * the amounts of a tab that has no suggested ones, it takes the card level.
 *
 * @param props - See {@link LadderNoticeProps}.
 * @returns The notice.
 */
export function LadderNotice({ children, className, inset = false }: LadderNoticeProps) {
  return (
    <RecessedCard
      radius={inset ? undefined : raisedControlRadius}
      className={cn("flex gap-2 text-sm text-text-secondary", className)}
    >
      <InfoIcon weight="duotone" aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-[var(--color-accent)]" />
      <div className="min-w-0">{children}</div>
    </RecessedCard>
  );
}
