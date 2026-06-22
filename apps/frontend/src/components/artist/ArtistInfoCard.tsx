/**
 * ArtistInfoCard -- displays artist profile, popular tracks, upcoming events, and similar artists.
 * Pure display component; data is fetched by the parent (ShareLayout).
 * Visually matches MediaCard: EmbossedCard with RecessedCard sections.
 */

import type { ArtistInfoResponse } from "@musiccloud/shared";
import { ArtistCardCloseButton } from "@/components/artist/ArtistCardCloseButton";
import { ArtistInfoNoticeCard } from "@/components/artist/ArtistInfoNoticeCard";
import { ArtistProfileMobileCard } from "@/components/artist/ArtistProfileMobileCard";
import { ArtistSectionWell } from "@/components/artist/ArtistSectionWell";
import type {
  ArtistCardLabels,
  ArtistInfoStatus,
  ArtistPanelTrackResolveHandler,
} from "@/components/artist/artistPanelTypes";
import { buildEventsSwapKey, buildSimilarSwapKey, buildTracksSwapKey } from "@/components/artist/artistSwapKeys";
import { EventsSkeleton } from "@/components/artist/EventsSkeleton";
import { PopularTracksSection } from "@/components/artist/PopularTracksSection";
import { SimilarArtistsSection } from "@/components/artist/SimilarArtistsSection";
import { SimilarArtistsSkeleton } from "@/components/artist/SimilarArtistsSkeleton";
import { TracksSkeleton } from "@/components/artist/TracksSkeleton";
import { UpcomingEventsSection } from "@/components/artist/UpcomingEventsSection";
import { fullWidthEmbossedCardClassName } from "@/components/cards/cardGeometry";
import { EmbossedCard } from "@/components/cards/EmbossedCard";
import { sectionCardFooterTextClassName } from "@/components/cards/sectionCardChromeStyles";
import { CollapsibleSection } from "@/components/ui/CollapsibleSection";
import { useSkeletonAllowed } from "@/hooks/useSkeletonAllowed";
import { useLocale, useT } from "@/i18n/localeContext";
import { cn } from "@/lib/utils";

interface ArtistInfoCardProps {
  data: ArtistInfoResponse | null;
  isLoading: boolean;
  /** The four artist-column section titles, supplied by the presentation owner. */
  labels: ArtistCardLabels;
  status?: ArtistInfoStatus;
  userRegion: string;
  onClose?: () => void;
  onTrackResolve?: ArtistPanelTrackResolveHandler;
  onResolveStart?: () => void;
}

/**
 * Mobile artist panel: profile, popular tracks, upcoming events, and similar
 * tracks stacked in one card, rendered inside the bottom sheet. Each list
 * section reuses the shared {@link ArtistSectionWell} (skeleton → content
 * tri-state) with its title supplied via {@link ArtistInfoCardProps.labels}, so
 * the markup matches the desktop cards without duplicating their body.
 */
export function ArtistInfoCard({
  data,
  isLoading,
  labels,
  status,
  userRegion,
  onClose,
  onTrackResolve,
  onResolveStart,
}: ArtistInfoCardProps) {
  const t = useT();
  const { locale } = useLocale();

  const skeletonAllowed = useSkeletonAllowed();

  const effectiveStatus: ArtistInfoStatus = status ?? (isLoading ? "loading" : data ? "ready" : "empty");

  // Keep a visible card shell when the API returned nothing useful. The VFD
  // carries the machine-readable status; this inline message explains why the
  // artist panel has no sections instead of silently disappearing.
  if (!isLoading && !data) {
    return (
      <ArtistInfoNoticeCard
        onClose={onClose}
        message={effectiveStatus === "error" ? t("artist.error") : t("artist.empty")}
      />
    );
  }
  // Keep the card surface mounted during the initial grace window. The
  // skeleton content itself is still delayed, but the desktop slot no longer
  // pops from empty space into a full card after hydration/fetch startup.
  if (isLoading && !data && !skeletonAllowed) {
    return (
      <EmbossedCard className={fullWidthEmbossedCardClassName}>
        <div className="min-h-[560px]" aria-hidden="true" />
      </EmbossedCard>
    );
  }

  const showInitialSkeleton = isLoading && !data;
  const showProfile = showInitialSkeleton || !!data?.profile;
  const showTracks = showInitialSkeleton || (data?.topTracks.length ?? 0) > 0;
  const showEvents = showInitialSkeleton || (data?.events.length ?? 0) > 0;
  const showSimilar = showInitialSkeleton || (data?.similarArtistTracks?.length ?? 0) > 0;
  // All sections empty after load -> keep the card shell and explain the empty state.
  if (!isLoading && !showProfile && !showTracks && !showEvents && !showSimilar) {
    return <ArtistInfoNoticeCard onClose={onClose} message={t("artist.empty")} />;
  }

  return (
    <EmbossedCard className={fullWidthEmbossedCardClassName}>
      <div className="relative">
        {onClose && <ArtistCardCloseButton onClose={onClose} />}

        {/* 1. Artist Profile */}
        <ArtistProfileMobileCard
          visible={showProfile}
          profile={data?.profile}
          showInitialSkeleton={showInitialSkeleton}
          providedByLabel={!showInitialSkeleton && data?.profile ? labels.profileProvidedBy : undefined}
        />

        {/* 2. Popular Tracks */}
        <CollapsibleSection visible={showTracks} sectionClass="p-[var(--mc-pad-card,0.75rem)]" disableMobileCollapse>
          <ArtistSectionWell
            innerTitle={labels.popularTracks}
            showInitialSkeleton={showInitialSkeleton}
            Skeleton={TracksSkeleton}
            hasContent={!!data && data.topTracks.length > 0}
            swapKey={buildTracksSwapKey(data)}
          >
            <PopularTracksSection
              tracks={data?.topTracks ?? []}
              onTrackResolve={onTrackResolve}
              onResolveStart={onResolveStart}
            />
          </ArtistSectionWell>
        </CollapsibleSection>

        {/* 3. Upcoming Events */}
        <CollapsibleSection visible={showEvents} sectionClass="p-[var(--mc-pad-card,0.75rem)]" disableMobileCollapse>
          <ArtistSectionWell
            innerTitle={labels.events}
            showInitialSkeleton={showInitialSkeleton}
            Skeleton={EventsSkeleton}
            hasContent={!!data && data.events.length > 0}
            swapKey={buildEventsSwapKey(data)}
          >
            <UpcomingEventsSection events={data?.events ?? []} userRegion={userRegion} locale={locale} />
          </ArtistSectionWell>
          {!showInitialSkeleton && data && data.events.length > 0 && (
            <p className={cn(sectionCardFooterTextClassName, "mt-2 px-2")}>{t("artist.eventsProvidedBy")}</p>
          )}
        </CollapsibleSection>

        {/* 4. Similar Artists */}
        <CollapsibleSection visible={showSimilar} sectionClass="p-[var(--mc-pad-card,0.75rem)]" disableMobileCollapse>
          <ArtistSectionWell
            innerTitle={labels.similar}
            showInitialSkeleton={showInitialSkeleton}
            Skeleton={SimilarArtistsSkeleton}
            hasContent={!!data?.similarArtistTracks && data.similarArtistTracks.length > 0}
            swapKey={buildSimilarSwapKey(data)}
          >
            <SimilarArtistsSection
              similarArtistTracks={data?.similarArtistTracks ?? []}
              onTrackResolve={onTrackResolve}
              onResolveStart={onResolveStart}
            />
          </ArtistSectionWell>
        </CollapsibleSection>
      </div>
    </EmbossedCard>
  );
}
