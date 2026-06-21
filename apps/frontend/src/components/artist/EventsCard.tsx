import type { ArtistInfoResponse } from "@musiccloud/shared";
import { ArtistCardShell } from "@/components/artist/ArtistCardShell";
import { EventsSkeleton } from "@/components/artist/EventsSkeleton";
import { UpcomingEventsSection } from "@/components/artist/UpcomingEventsSection";
import { recessedControlInsetClassName } from "@/components/cards/cardGeometry";
import { RecessedCard } from "@/components/cards/RecessedCard";
import { SmoothSwap } from "@/components/ui/SmoothSwap";
import { useSkeletonAllowed } from "@/hooks/useSkeletonAllowed";
import { useLocale, useT } from "@/i18n/localeContext";

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
      <ArtistCardShell title={t("artist.upcomingEvents")}>
        <div className="min-h-[140px]" aria-hidden="true" />
      </ArtistCardShell>
    );
  }
  if (!showEvents) return null;

  const footer = !showInitialSkeleton && data && data.events.length > 0 ? t("artist.eventsProvidedBy") : undefined;

  return (
    <ArtistCardShell title={t("artist.upcomingEvents")} footer={footer}>
      <div className={footer ? "px-3 pt-0 pb-2" : "px-3 pt-0 pb-3"}>
        <RecessedCard className={recessedControlInsetClassName}>
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
      </div>
    </ArtistCardShell>
  );
}
