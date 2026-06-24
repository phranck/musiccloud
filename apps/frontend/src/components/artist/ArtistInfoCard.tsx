/**
 * ArtistInfoCard -- displays artist profile, popular tracks, upcoming events, and similar artists.
 * Pure display component; data is fetched by the parent (ShareLayout).
 * Visually matches MediaCard: EmbossedCard with RecessedCard sections.
 */

import type { ArtistInfoResponse } from "@musiccloud/shared";
import { CircleNotchIcon } from "@phosphor-icons/react";
import { useMemo } from "react";
import { ArtistCardCloseButton } from "@/components/artist/ArtistCardCloseButton";
import { ArtistInfoNoticeCard } from "@/components/artist/ArtistInfoNoticeCard";
import { ArtistProfileMobileCard } from "@/components/artist/ArtistProfileMobileCard";
import { ArtistSectionWell } from "@/components/artist/ArtistSectionWell";
import { ArtistTrackContent } from "@/components/artist/ArtistTrackContent";
import type {
  ArtistCardLabels,
  ArtistInfoStatus,
  ArtistPanelTrackResolveHandler,
} from "@/components/artist/artistPanelTypes";
import { buildEventsSwapKey, buildSimilarSwapKey, buildTracksSwapKey } from "@/components/artist/artistSwapKeys";
import { toPopularTrackItems, toSimilarTrackItems } from "@/components/artist/artistTrackItems";
import { ArtistTrackViewKey } from "@/components/artist/artistTrackViewKeys";
import { EventsSkeleton } from "@/components/artist/EventsSkeleton";
import { SimilarArtistsSkeleton } from "@/components/artist/SimilarArtistsSkeleton";
import { TracksSkeleton } from "@/components/artist/TracksSkeleton";
import { TrackViewToggle } from "@/components/artist/TrackViewToggle";
import { UpcomingEventsSection } from "@/components/artist/UpcomingEventsSection";
import { fullWidthEmbossedCardClassName } from "@/components/cards/cardGeometry";
import { EmbossedCard } from "@/components/cards/EmbossedCard";
import { sectionCardFooterTextClassName } from "@/components/cards/sectionCardChromeStyles";
import { CollapsibleSection } from "@/components/ui/CollapsibleSection";
import { useSkeletonAllowed } from "@/hooks/useSkeletonAllowed";
import { useTrackListView } from "@/hooks/useTrackListView";
import { useLocale, useT } from "@/i18n/localeContext";
import { CardSignal } from "@/lib/analytics/umami";
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
 * and similar each carry a list/grid toggle in their well header (remembered per
 * section, shared with the desktop card); both views scroll within the well — no
 * pager.
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

  // View + pager state must be declared before any early return (Rules of Hooks).
  // The view is remembered per section and shares its key with the desktop card.
  const [popularView, setPopularView] = useTrackListView(ArtistTrackViewKey.Popular);
  const [similarView, setSimilarView] = useTrackListView(ArtistTrackViewKey.Similar);
  const popularItems = toPopularTrackItems(data);
  const similarItems = toSimilarTrackItems(data);
  // Memoized so the toggle element identity stays stable (jsx-no-jsx-as-prop);
  // only offered once a section has rows to switch between.
  const popularAddOn = useMemo(
    () => (popularItems.length > 0 ? <TrackViewToggle view={popularView} onChange={setPopularView} /> : undefined),
    [popularItems.length, popularView, setPopularView],
  );
  const similarAddOn = useMemo(
    () => (similarItems.length > 0 ? <TrackViewToggle view={similarView} onChange={setSimilarView} /> : undefined),
    [similarItems.length, similarView, setSimilarView],
  );

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
  const showTracks = showInitialSkeleton || popularItems.length > 0;
  const showEvents = showInitialSkeleton || (data?.events.length ?? 0) > 0;
  const showSimilar = showInitialSkeleton || similarItems.length > 0;
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
              headerAddOn={popularAddOn}
              showInitialSkeleton={showInitialSkeleton}
              Skeleton={TracksSkeleton}
              hasContent={popularItems.length > 0}
              swapKey={buildTracksSwapKey(data)}
            >
              <ArtistTrackContent
                view={popularView}
                items={popularItems}
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
              headerAddOn={similarAddOn}
              showInitialSkeleton={showInitialSkeleton}
              Skeleton={SimilarArtistsSkeleton}
              hasContent={similarItems.length > 0}
              swapKey={buildSimilarSwapKey(data)}
            >
              <ArtistTrackContent
                view={similarView}
                items={similarItems}
                cardSignal={CardSignal.SimilarArtist}
                onTrackResolve={onTrackResolve}
                onResolveStart={onResolveStart}
              />
            </ArtistSectionWell>
          </CollapsibleSection>
        </div>
      </div>
    </EmbossedCard>
  );
}
