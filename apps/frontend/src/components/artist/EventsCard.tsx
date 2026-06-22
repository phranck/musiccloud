import type { ArtistInfoResponse } from "@musiccloud/shared";
import { ArtistCardShell } from "@/components/artist/ArtistCardShell";
import { ArtistSectionWell } from "@/components/artist/ArtistSectionWell";
import { buildEventsSwapKey } from "@/components/artist/artistSwapKeys";
import { EventsSkeleton } from "@/components/artist/EventsSkeleton";
import { UpcomingEventsSection } from "@/components/artist/UpcomingEventsSection";
import { SectionCardFooterText } from "@/components/cards/SectionCardFooterText";
import { useSkeletonAllowed } from "@/hooks/useSkeletonAllowed";
import { useLocale, useT } from "@/i18n/localeContext";

interface EventsCardProps {
  /** Card title, supplied by the presentation owner (never hardcoded here). */
  title: string;
  data: ArtistInfoResponse | null;
  isLoading: boolean;
  userRegion: string;
}

/**
 * Desktop upcoming-events card. Self-hides once loading settles with no events.
 * Keeps `useT` for the "events provided by" footer credit, which is content —
 * not the card title.
 */
export function EventsCard({ title, data, isLoading, userRegion }: EventsCardProps) {
  const t = useT();
  const { locale } = useLocale();
  const skeletonAllowed = useSkeletonAllowed();
  const showInitialSkeleton = isLoading && !data;
  const showEvents = showInitialSkeleton || (data?.events.length ?? 0) > 0;

  if (isLoading && !data && !skeletonAllowed) {
    return (
      <ArtistCardShell title={title}>
        <div className="min-h-[140px]" aria-hidden="true" />
      </ArtistCardShell>
    );
  }
  if (!showEvents) return null;

  const footer =
    !showInitialSkeleton && data && data.events.length > 0 ? (
      <SectionCardFooterText>{t("artist.eventsProvidedBy")}</SectionCardFooterText>
    ) : undefined;

  return (
    <ArtistCardShell title={title} footer={footer}>
      <div className={footer ? "px-3 pt-0 pb-2" : "px-3 pt-0 pb-3"}>
        <ArtistSectionWell
          showInitialSkeleton={showInitialSkeleton}
          Skeleton={EventsSkeleton}
          hasContent={!!data && data.events.length > 0}
          swapKey={buildEventsSwapKey(data)}
        >
          <UpcomingEventsSection events={data?.events ?? []} userRegion={userRegion} locale={locale} />
        </ArtistSectionWell>
      </div>
    </ArtistCardShell>
  );
}
