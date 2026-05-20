import type { ArtistInfoResponse } from "@musiccloud/shared";
import { ArtistCardShell, EventsSkeleton, useSkeletonAllowed } from "@/components/artist/ArtistCardParts";
import { UpcomingEventsSection } from "@/components/artist/UpcomingEventsSection";
import { recessedControlInsetClassName } from "@/components/cards/cardGeometry";
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
      <ArtistCardShell title={t("artist.upcomingEvents")}>
        <div className="min-h-[140px]" aria-hidden="true" />
      </ArtistCardShell>
    );
  }
  if (!showEvents) return null;

  const footer = !showInitialSkeleton && data && data.events.length > 0 ? t("artist.eventsProvidedBy") : undefined;

  return (
    <ArtistCardShell title={t("artist.upcomingEvents")} footer={footer}>
      <div className={footer ? "px-3 pt-3 pb-2" : "p-3"}>
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
