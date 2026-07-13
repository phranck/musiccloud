import type { ArtistEvent } from "@musiccloud/shared";
import { TicketIcon } from "@phosphor-icons/react";
import { ArtistPanelList } from "@/components/artist/ArtistPanelList";
import { ArtistPanelRow } from "@/components/artist/ArtistPanelRow";
import { ArtistPanelRowText } from "@/components/artist/ArtistPanelRowText";
import { useRowCappedViewport } from "@/components/artist/useRowCappedViewport";
import { raisedControlRadius } from "@/components/cards/cardGeometry";
import { CardSignal, sendMusicSignal } from "@/lib/analytics/umami";

interface UpcomingEventsSectionProps {
  events: ArtistEvent[];
  userRegion: string;
  locale: string;
}

export function UpcomingEventsSection({ events, userRegion, locale }: UpcomingEventsSectionProps) {
  const cappedRef = useRowCappedViewport<HTMLDivElement>(4.5);

  return (
    <div ref={cappedRef} className="overflow-y-auto overscroll-contain" style={{ borderRadius: raisedControlRadius }}>
      <ArtistPanelList>
        {events.map((event) => {
          const isLocal = userRegion && event.country.toUpperCase() === userRegion.toUpperCase();
          const linkProps = event.ticketUrl
            ? ({ href: event.ticketUrl, target: "_blank", rel: "noopener noreferrer" } as const)
            : {};
          return (
            <ArtistPanelRow
              key={`${event.date}-${event.venueName || event.city}`}
              className="no-underline px-[var(--mc-pad-event-x,0.75rem)] py-[var(--mc-pad-event-y,0.25rem)]"
              onClick={event.ticketUrl ? () => sendMusicSignal(CardSignal.UpcomingEvent) : undefined}
              {...linkProps}
            >
              <ArtistPanelRowText>
                <p className={`text-sm font-medium tabular-nums ${isLocal ? "text-accent" : "text-text-secondary"}`}>
                  {formatEventDate(event.date, locale)}
                  {isLocal && " \u2605"}
                </p>
                <p className="text-sm text-text-primary break-words">
                  {event.venueName}
                  <span className="text-text-secondary">
                    {" \u00B7 "}
                    {event.city}, {event.country}
                  </span>
                </p>
              </ArtistPanelRowText>
              {event.ticketUrl && <TicketIcon size={24} weight="duotone" className="text-text-secondary flex-none" />}
            </ArtistPanelRow>
          );
        })}
      </ArtistPanelList>
    </div>
  );
}

function formatEventDate(iso: string, locale: string): string {
  try {
    return new Date(`${iso}T00:00:00`).toLocaleDateString(locale || "en", { month: "short", day: "numeric" });
  } catch {
    return iso;
  }
}
