import type { ArtistEvent } from "@musiccloud/shared";
import { TicketIcon } from "@phosphor-icons/react";
import { ArtistPanelList } from "@/components/artist/ArtistPanelList";
import { ArtistPanelRow } from "@/components/artist/ArtistPanelRow";
import { ArtistPanelRowText } from "@/components/artist/ArtistPanelRowText";
import { CardSignal, sendMusicSignal } from "@/lib/analytics/umami";

interface UpcomingEventsSectionProps {
  events: ArtistEvent[];
  userRegion: string;
  locale: string;
}

export function UpcomingEventsSection({ events, userRegion, locale }: UpcomingEventsSectionProps) {
  return (
    <ArtistPanelList>
      {events.map((event) => {
        const isLocal = userRegion && event.country.toUpperCase() === userRegion.toUpperCase();
        const linkProps = event.ticketUrl
          ? ({ href: event.ticketUrl, target: "_blank", rel: "noopener noreferrer" } as const)
          : {};
        return (
          <ArtistPanelRow
            key={`${event.date}-${event.venueName || event.city}`}
            className="no-underline"
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
  );
}

function formatEventDate(iso: string, locale: string): string {
  try {
    return new Date(`${iso}T00:00:00`).toLocaleDateString(locale || "en", { month: "short", day: "numeric" });
  } catch {
    return iso;
  }
}
