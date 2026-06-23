/**
 * ArtistInfoCard -- displays artist profile, popular tracks, upcoming events, and similar artists.
 * Pure display component; data is fetched by the parent (ShareLayout).
 * Visually matches MediaCard: EmbossedCard with RecessedCard sections.
 */

import type { ArtistInfoResponse } from "@musiccloud/shared";
import { CircleNotchIcon } from "@phosphor-icons/react";
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
import { hasResolvedTrack } from "@/components/artist/similarArtistTracks";
import { TracksSkeleton } from "@/components/artist/TracksSkeleton";
import { UpcomingEventsSection } from "@/components/artist/UpcomingEventsSection";
import { fullWidthEmbossedCardClassName } from "@/components/cards/cardGeometry";
import { EmbossedCard } from "@/components/cards/EmbossedCard";
import { sectionCardFooterTextClassName } from "@/components/cards/sectionCardChromeStyles";
import { CollapsibleSection } from "@/components/ui/CollapsibleSection";
import { PagedListFooter } from "@/components/ui/PagedListFooter";
import { usePagedList } from "@/hooks/usePagedList";
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
 * the markup matches the desktop cards without duplicating their body. Popular
 * and similar are capped at six per page, with the pager rendered beneath the
 * section's well (the mobile footer position).
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

  // Pager state must be declared before any early return (Rules of Hooks).
  const tracks = data?.topTracks ?? [];
  const tracksPager = usePagedList(tracks, { resetKey: tracks.map((track) => track.deezerUrl).join("|") });
  const withTrack = (data?.similarArtistTracks ?? []).filter(hasResolvedTrack);
  const similarPager = usePagedList(withTrack, { resetKey: withTrack.map((entry) => entry.track.deezerUrl).join("|") });

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
  // Re-fetch with the previous data still on screen (a track swap to a new
  // artist): blur the stacked sections + show one spinner so the panel reads as
  // "updating" instead of frozen. Mirrors the desktop cards' `isRefreshing`.
  const isRefreshing = isLoading && !!data;
  const showProfile = showInitialSkeleton || !!data?.profile;
  const showTracks = showInitialSkeleton || tracks.length > 0;
  const showEvents = showInitialSkeleton || (data?.events.length ?? 0) > 0;
  const showSimilar = showInitialSkeleton || withTrack.length > 0;
  // All sections empty after load -> keep the card shell and explain the empty state.
  if (!isLoading && !showProfile && !showTracks && !showEvents && !showSimilar) {
    return <ArtistInfoNoticeCard onClose={onClose} message={t("artist.empty")} />;
  }

  return (
    <EmbossedCard className={fullWidthEmbossedCardClassName}>
      <div className="relative">
        {onClose && <ArtistCardCloseButton onClose={onClose} />}
        {isRefreshing && (
          <span className="absolute right-3 top-3 z-10 text-text-secondary" aria-hidden="true">
            <CircleNotchIcon className="size-4 animate-spin" weight="bold" />
          </span>
        )}
        <div
          className={cn(
            "transition-[filter,opacity] duration-300",
            isRefreshing && "pointer-events-none select-none blur-[1.5px] opacity-55",
          )}
        >
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
              hasContent={tracks.length > 0}
              swapKey={buildTracksSwapKey(data)}
            >
              <PopularTracksSection
                tracks={tracksPager.page}
                onTrackResolve={onTrackResolve}
                onResolveStart={onResolveStart}
              />
            </ArtistSectionWell>
            {tracksPager.pageCount > 1 && (
              <div className="mt-3">
                <PagedListFooter
                  pageCount={tracksPager.pageCount}
                  canGoPrevious={tracksPager.canGoPrevious}
                  canGoNext={tracksPager.canGoNext}
                  onPrevious={tracksPager.goPrevious}
                  onNext={tracksPager.goNext}
                />
              </div>
            )}
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
              hasContent={withTrack.length > 0}
              swapKey={buildSimilarSwapKey(data)}
            >
              <SimilarArtistsSection
                withTrack={similarPager.page}
                onTrackResolve={onTrackResolve}
                onResolveStart={onResolveStart}
              />
            </ArtistSectionWell>
            {similarPager.pageCount > 1 && (
              <div className="mt-3">
                <PagedListFooter
                  pageCount={similarPager.pageCount}
                  canGoPrevious={similarPager.canGoPrevious}
                  canGoNext={similarPager.canGoNext}
                  onPrevious={similarPager.goPrevious}
                  onNext={similarPager.goNext}
                />
              </div>
            )}
          </CollapsibleSection>
        </div>
      </div>
    </EmbossedCard>
  );
}
