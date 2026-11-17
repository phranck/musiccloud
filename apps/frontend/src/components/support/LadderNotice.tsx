/**
 * @file A notice of the support ladder, set into a card or standing as a surface of its own.
 */

import { CheckCircleIcon, type Icon, InfoIcon } from "@phosphor-icons/react";
import type { CSSProperties, ReactNode } from "react";

import { raisedControlRadius } from "@/components/cards/cardGeometry";
import { RecessedCard } from "@/components/cards/RecessedCard";
import { cn } from "@/lib/utils";

import { LadderNoticeTone, type LadderNoticeToneValue } from "./ladderNoticeTone";

/**
 * How each tone draws itself.
 *
 * @property icon - The mark before the text.
 * @property iconClassName - The mark's color.
 * @property textClassName - The color of the text, which the notice's children inherit.
 * @property style - What the tone lays over the well's own ground; none where absent.
 */
interface ToneLook {
  icon: Icon;
  iconClassName: string;
  textClassName: string;
  style?: CSSProperties;
}

/** The ground the success tone lays over the well's material, in `--color-success-tint`. */
const SUCCESS_TINT_STYLE: CSSProperties = {
  backgroundImage: "linear-gradient(var(--color-success-tint), var(--color-success-tint))",
};

/**
 * The look of each tone, held as data so a further tone is one entry here.
 * Info is the accent mark on secondary text over the plain well. Success is the
 * check mark in the success color on primary text over a success tint.
 */
const TONES: Record<LadderNoticeToneValue, ToneLook> = {
  [LadderNoticeTone.Info]: {
    icon: InfoIcon,
    iconClassName: "text-[var(--color-accent)]",
    textClassName: "text-text-secondary",
  },
  [LadderNoticeTone.Success]: {
    icon: CheckCircleIcon,
    iconClassName: "text-success",
    textClassName: "text-text-primary",
    style: SUCCESS_TINT_STYLE,
  },
};

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
  /** What the notice tells the reader, one of {@link LadderNoticeTone}. Defaults to `Info`. */
  tone?: LadderNoticeToneValue;
}

/**
 * A notice of the support ladder: something to read once before acting, or
 * something that has already happened.
 *
 * A recessed well with a mark before the text, whose mark and colors come from
 * its tone. Inside a card it stands at the control level of the radius cascade.
 * As a surface of its own, beside the amounts of a tab that has no suggested
 * ones, it takes the card level.
 *
 * @param props - See {@link LadderNoticeProps}.
 * @returns The notice.
 */
export function LadderNotice({ children, className, inset = false, tone = LadderNoticeTone.Info }: LadderNoticeProps) {
  const { icon: Mark, iconClassName, textClassName, style } = TONES[tone];

  return (
    <RecessedCard
      radius={inset ? undefined : raisedControlRadius}
      className={cn("flex gap-2 text-sm", textClassName, className)}
      style={style}
    >
      <Mark weight="duotone" aria-hidden="true" className={cn("mt-0.5 size-4 shrink-0", iconClassName)} />
      <div className="min-w-0">{children}</div>
    </RecessedCard>
  );
}
