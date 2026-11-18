/**
 * @file The heading of a support ladder card, with its brand mark.
 *
 * The transfer card and the route cards share it, so the two kinds of card
 * cannot drift apart in how they present themselves.
 */

import type { SupportBrandIconValue } from "@musiccloud/shared";

import { brandLockupUrl, brandLockupWidth } from "./brandLockups";
import { SUPPORT_CARD_TITLE_CLASS } from "./supportType";

/** Props of {@link LadderCardHead}. */
interface LadderCardHeadProps {
  /** The card's heading. */
  title: string;
  /** The brand mark beside it, if any. */
  icon?: SupportBrandIconValue;
}

/**
 * A card's heading with its brand mark on the right.
 *
 * The mark is decoration, because the heading already names the route, so it is
 * hidden from assistive technology.
 *
 * @param props - See {@link LadderCardHeadProps}.
 * @returns The heading row.
 */
export function LadderCardHead({ title, icon }: LadderCardHeadProps) {
  return (
    <div className="flex items-start justify-between gap-[var(--mc-support-step-4)]">
      {/* The type is set on the wrapper, because the ladder's prose reset makes
          its headings inherit; see `.mc-support-ladder` in `global.css`. */}
      <div className={SUPPORT_CARD_TITLE_CLASS}>
        <h3>{title}</h3>
      </div>
      {icon && (
        <img
          src={brandLockupUrl(icon)}
          alt=""
          aria-hidden="true"
          className="shrink-0"
          style={{ width: brandLockupWidth(icon), height: "auto" }}
        />
      )}
    </div>
  );
}
