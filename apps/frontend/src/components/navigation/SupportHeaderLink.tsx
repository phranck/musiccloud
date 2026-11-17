import { HandHeartIcon } from "@phosphor-icons/react";
import { recessedSurfaceRadius } from "@/components/cards/cardGeometry";
import { RecessedCard } from "@/components/cards/RecessedCard";
import {
  HEADER_CONTROL_RAISED_CLASS,
  HEADER_CONTROL_TRACK_CLASS,
  HEADER_RAISED_RADIUS_STYLE,
} from "@/components/navigation/headerControlStyle";
import { commonCopy } from "@/copy/common";
import { SupportSignal, sendMusicSignal } from "@/lib/analytics/umami";
import { cn } from "@/lib/utils";

/**
 * Where the support page lives: the content page with the slug `support-me`,
 * which `pages/[shortId].astro` serves.
 */
export const SUPPORT_PAGE_PATH = "/support-me";

/**
 * The header's link to the support page, drawn as one of the header's glass
 * controls with a hand-and-heart symbol.
 *
 * It reads "Support musiccloud" from the `sm` breakpoint on and "Support"
 * below it, where the header shares a phone's width with the menu and the
 * Day/Night switcher. Only the visible label is in the document's reading
 * order, so the link's accessible name is always the words a sighted reader
 * sees. A click sends the `Support: Header Button` event and then navigates as
 * an ordinary link, so opening it in a new tab keeps working.
 */
export function SupportHeaderLink() {
  return (
    <RecessedCard className={HEADER_CONTROL_TRACK_CLASS} radius={recessedSurfaceRadius}>
      <RecessedCard.Body className="contents">
        <a
          href={SUPPORT_PAGE_PATH}
          onClick={() => sendMusicSignal(SupportSignal.HeaderButton)}
          style={HEADER_RAISED_RADIUS_STYLE}
          className={cn(HEADER_CONTROL_RAISED_CLASS, "gap-1.5 whitespace-nowrap px-3 text-sm font-medium no-underline")}
        >
          <HandHeartIcon weight="duotone" className="size-[18px] shrink-0" aria-hidden="true" />
          <span className="hidden sm:inline">{commonCopy.support.headerLabel}</span>
          <span className="sm:hidden">{commonCopy.support.headerShortLabel}</span>
        </a>
      </RecessedCard.Body>
    </RecessedCard>
  );
}
