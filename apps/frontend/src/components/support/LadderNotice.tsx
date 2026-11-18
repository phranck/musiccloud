/**
 * @file A notice of the support ladder: a recessed well holding something to read before acting.
 */

import { CheckCircleIcon, type Icon, InfoIcon } from "@phosphor-icons/react";
import type { CSSProperties, ReactNode } from "react";

import { RecessedCard } from "@/components/cards/RecessedCard";
import { cn } from "@/lib/utils";

import { LadderNoticeTone, type LadderNoticeToneValue } from "./ladderNoticeTone";
import { SUPPORT_TEXT_SIZE_CLASS } from "./supportType";

/** A notice's padding on all four sides: lmaa.space's 13.5px, from the ladder's spacing scale in `global.css`. */
const NOTICE_PADDING = "var(--mc-support-step-3)";

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
 * The ground and edge the info tone lays over the well's material, in
 * `--color-accent-tint` and `--color-accent-edge`, as lmaa.space draws its info
 * notice.
 */
const INFO_TINT_STYLE: CSSProperties = {
  backgroundImage: "linear-gradient(var(--color-accent-tint), var(--color-accent-tint))",
  border: "1px solid var(--color-accent-edge)",
};

/**
 * The look of each tone, held as data so a further tone is one entry here.
 * Info is the mark and the text in `--color-accent-text` over an accent tint
 * with an accent edge, as lmaa.space draws it. Success is the check mark in the
 * success color on primary text over a success tint.
 */
const TONES: Record<LadderNoticeToneValue, ToneLook> = {
  [LadderNoticeTone.Info]: {
    icon: InfoIcon,
    iconClassName: "text-accent-text",
    textClassName: "text-accent-text",
    style: INFO_TINT_STYLE,
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
  /** What the notice tells the reader, one of {@link LadderNoticeTone}. Defaults to `Info`. */
  tone?: LadderNoticeToneValue;
}

/**
 * A notice of the support ladder: something to read once before acting, or
 * something that has already happened.
 *
 * A recessed well with a mark before the text, whose mark and colors come from
 * its tone. It takes the radius the card around it derives for its wells, and
 * lmaa.space's notice padding, 13.5px (`--mc-support-step-3`), so its text does
 * not touch its curve. Standing on the page beside the amounts, with no card
 * around it, it takes the well radius of the radius cascade.
 *
 * @param props - See {@link LadderNoticeProps}.
 * @returns The notice.
 */
export function LadderNotice({ children, className, tone = LadderNoticeTone.Info }: LadderNoticeProps) {
  const { icon: Mark, iconClassName, textClassName, style } = TONES[tone];

  return (
    <RecessedCard
      padding={NOTICE_PADDING}
      className={cn("flex gap-2", SUPPORT_TEXT_SIZE_CLASS, textClassName, className)}
      style={style}
    >
      <Mark weight="duotone" aria-hidden="true" className={cn("mt-1 size-5 shrink-0", iconClassName)} />
      <div className="min-w-0">{children}</div>
    </RecessedCard>
  );
}
