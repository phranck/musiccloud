import type { ArtistEvent } from "@musiccloud/shared";
import { TicketIcon } from "@phosphor-icons/react";
import { useGroupedCorners } from "@/components/cards/useGroupedCorners";
import { EmbossedButton } from "@/components/ui/EmbossedButton";
import { CardSignal, sendMusicSignal } from "@/lib/analytics/umami";

interface UpcomingEventsSectionProps {
  events: ArtistEvent[];
  userRegion: string;
  locale: string;
}

export function UpcomingEventsSection({ events, userRegion, locale }: UpcomingEventsSectionProps) {
  const listRef = useGroupedCorners<HTMLDivElement>();
  return (
    <div ref={listRef} className="flex flex-col gap-0.5">
      {events.map((event) => {
        const isLocal = userRegion && event.country.toUpperCase() === userRegion.toUpperCase();
        const linkProps = event.ticketUrl
          ? ({ href: event.ticketUrl, target: "_blank", rel: "noopener noreferrer" } as const)
          : {};
        return (
          <EmbossedButton
            key={`${event.date}-${event.venueName || event.city}`}
            noScale
            className="flex items-center gap-3 w-full px-3 py-2 no-underline"
            onClick={event.ticketUrl ? () => sendMusicSignal(CardSignal.UpcomingEvent) : undefined}
            {...linkProps}
          >
            <div className="min-w-0 flex-1">
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
            </div>
            {event.ticketUrl && <TicketIcon size={24} weight="duotone" className="text-text-secondary flex-none" />}
          </EmbossedButton>
        );
      })}
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
