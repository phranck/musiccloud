import type { ArtistEvent } from "@musiccloud/shared";
import { Ticket } from "@phosphor-icons/react";
import { SectionHeading } from "@/components/share/SectionHeading";
import { EmbossedButton } from "@/components/ui/EmbossedButton";

interface UpcomingEventsSectionProps {
  events: ArtistEvent[];
  userRegion: string;
  hasLocalEvents: boolean;
  t: (key: string, vars?: Record<string, string>) => string;
  locale: string;
}

export function UpcomingEventsSection({ events, userRegion, hasLocalEvents, t, locale }: UpcomingEventsSectionProps) {
  return (
    <div>
      <SectionHeading info={hasLocalEvents ? t("artist.upcomingEventsInfo") : undefined}>
        {t("artist.upcomingEvents")}
      </SectionHeading>
      <div className="flex flex-col gap-2">
        {events.map((event) => {
          const isLocal = userRegion && event.country.toUpperCase() === userRegion.toUpperCase();
          const Wrapper = event.ticketUrl ? EmbossedButton : "div";
          const wrapperProps = event.ticketUrl
            ? { href: event.ticketUrl, target: "_blank", rel: "noopener noreferrer" }
            : {};
          return (
            <Wrapper
              key={`${event.date}-${event.venueName || event.city}`}
              className="flex items-center gap-3 w-full rounded-lg px-3 py-2 no-underline"
              {...wrapperProps}
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
              {event.ticketUrl && <Ticket size={24} weight="duotone" className="text-text-secondary flex-none" />}
            </Wrapper>
          );
        })}
      </div>
    </div>
  );
}

function formatEventDate(iso: string, locale: string): string {
  try {
    return new Intl.DateTimeFormat(locale || "en", { month: "short", day: "numeric" }).format(
      new Date(`${iso}T00:00:00`),
    );
  } catch {
    return iso;
  }
}
