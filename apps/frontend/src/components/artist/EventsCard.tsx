import type { ArtistInfoResponse } from "@musiccloud/shared";
import { ArtistCardShell, EventsSkeleton, useSkeletonAllowed } from "@/components/artist/ArtistCardParts";
import { UpcomingEventsSection } from "@/components/artist/UpcomingEventsSection";
import { RecessedCard } from "@/components/cards/RecessedCard";
import { SmoothSwap } from "@/components/ui/SmoothSwap";
import { useLocale, useT } from "@/i18n/context";

interface EventsCardProps {
  data: ArtistInfoResponse | null;
  isLoading: boolean;
  userRegion: string;
}

export function EventsCard({ data, isLoading, userRegion }: EventsCardProps) {
  const t = useT();
  const { locale } = useLocale();
  const skeletonAllowed = useSkeletonAllowed();
  const showInitialSkeleton = isLoading && !data;
  const showEvents = showInitialSkeleton || (data?.events.length ?? 0) > 0;
  const eventsSwapKey =
    data?.events.map((event) => `${event.date}:${event.venueName}:${event.city}:${event.ticketUrl ?? ""}`).join("|") ??
    "events-empty";

  if (isLoading && !data && !skeletonAllowed) {
    return (
      <ArtistCardShell>
        <div className="min-h-[140px]" aria-hidden="true" />
      </ArtistCardShell>
    );
  }
  if (!showEvents) return null;

  return (
    <ArtistCardShell>
      <div className="p-3">
        <RecessedCard className="p-[0.1875rem]" radius={{ base: "0.625rem", sm: "0.875rem" }}>
          <RecessedCard.Header>
            <RecessedCard.Header.Title>{t("artist.upcomingEvents")}</RecessedCard.Header.Title>
          </RecessedCard.Header>
          <RecessedCard.Body>
            {showInitialSkeleton ? (
              <EventsSkeleton />
            ) : data && data.events.length > 0 ? (
              <SmoothSwap swapKey={eventsSwapKey}>
                <UpcomingEventsSection events={data.events} userRegion={userRegion} locale={locale} />
              </SmoothSwap>
            ) : null}
          </RecessedCard.Body>
        </RecessedCard>
        {!showInitialSkeleton && data && data.events.length > 0 && (
          <p className="mt-2 text-xs text-text-muted text-center px-2">{t("artist.eventsProvidedBy")}</p>
        )}
      </div>
    </ArtistCardShell>
  );
}
