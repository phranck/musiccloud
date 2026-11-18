/**
 * @file A route out of the page: PayPal.Me or GitHub Sponsors.
 */

import type { SupportLadderRoute } from "@musiccloud/shared";
import { ArrowSquareOutIcon } from "@phosphor-icons/react";

import { ContentCard } from "@/components/cards/ContentCard";
import { EmbossedButton } from "@/components/ui/EmbossedButton";
import { cn } from "@/lib/utils";

import { LadderCardHead } from "./LadderCardHead";
import { LadderNotice } from "./LadderNotice";
import { LadderRichText } from "./LadderRichText";
import { SUPPORT_BUTTON_SIZE_CLASS, SUPPORT_LABEL_CLASS, SUPPORT_TEXT_CLASS } from "./supportType";

/** Props of {@link RouteCard}. */
export interface RouteCardProps {
  /** The route, as the page describes it. Its address has passed the shared allowlist. */
  route: SupportLadderRoute;
}

/**
 * One way to give that leaves the site.
 *
 * The button opens the payment service in a new tab, so the reader keeps the
 * page with the transfer details beside it. The new tab gets neither an opener
 * nor a referrer, because the service has no business with either. The icon
 * after the button's text says that it leaves the site, and it is hidden from
 * assistive technology, which announces a new tab itself.
 *
 * @param props - See {@link RouteCardProps}.
 * @returns The card.
 */
export function RouteCard({ route }: RouteCardProps) {
  return (
    <ContentCard className="flex flex-col">
      <LadderCardHead title={route.title} icon={route.icon} />
      {/* The distances between the parts are lmaa.space's: the text close
          under the heading, the notice a step further, and the button the
          widest step from what it follows. */}
      <LadderRichText html={route.text} className={cn("mt-[var(--mc-support-step-1)]", SUPPORT_TEXT_CLASS)} />
      {route.hint && (
        <LadderNotice className="mt-[var(--mc-support-step-3)]">
          <LadderRichText html={route.hint} />
        </LadderNotice>
      )}
      {/* The button stands at the card's end on the right, as lmaa.space sets
          it. The type is set on the wrapper, because the ladder's reset makes
          the link inherit; see `.mc-support-ladder` in `global.css`. */}
      <div className={cn("mt-[var(--mc-support-step-6)] flex justify-end", SUPPORT_LABEL_CLASS)}>
        <EmbossedButton
          href={route.url}
          target="_blank"
          rel="noopener noreferrer"
          className={cn("inline-flex items-center gap-2", SUPPORT_BUTTON_SIZE_CLASS)}
        >
          {route.button}
          <ArrowSquareOutIcon weight="bold" aria-hidden="true" className="size-4" />
        </EmbossedButton>
      </div>
    </ContentCard>
  );
}
