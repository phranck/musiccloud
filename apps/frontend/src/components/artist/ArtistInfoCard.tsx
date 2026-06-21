/**
 * ArtistInfoCard -- displays artist profile, popular tracks, upcoming events, and similar artists.
 * Pure display component; data is fetched by the parent (ShareLayout).
 * Visually matches MediaCard: EmbossedCard with RecessedCard sections.
 */

import type { ArtistInfoResponse } from "@musiccloud/shared";
import { XIcon } from "@phosphor-icons/react";
import {
  type ArtistInfoStatus,
  EventsSkeleton,
  SimilarArtistsSkeleton,
  TracksSkeleton,
  useSkeletonAllowed,
} from "@/components/artist/ArtistCardParts";
import { ArtistProfileMobileCard } from "@/components/artist/ArtistProfileMobileCard";
import type { ArtistPanelTrackResolveHandler } from "@/components/artist/artistPanelTypes";
import { PopularTracksSection } from "@/components/artist/PopularTracksSection";
import { SimilarArtistsSection } from "@/components/artist/SimilarArtistsSection";
import { UpcomingEventsSection } from "@/components/artist/UpcomingEventsSection";
import { fullWidthEmbossedCardClassName, recessedControlInsetClassName } from "@/components/cards/cardGeometry";
import { EmbossedCard } from "@/components/cards/EmbossedCard";
import { RecessedCard } from "@/components/cards/RecessedCard";
import { CollapsibleSection } from "@/components/ui/CollapsibleSection";
import { SmoothSwap } from "@/components/ui/SmoothSwap";
import { useLocale, useT } from "@/i18n/localeContext";

interface ArtistInfoCardProps {
  data: ArtistInfoResponse | null;
  isLoading: boolean;
  status?: ArtistInfoStatus;
  userRegion: string;
  onClose?: () => void;
  onTrackResolve?: ArtistPanelTrackResolveHandler;
  onResolveStart?: () => void;
}

export function ArtistInfoCard({
  data,
  isLoading,
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
  const tracksSwapKey = data?.topTracks.map((track) => track.deezerUrl).join("|") ?? "tracks-empty";
  const eventsSwapKey =
    data?.events.map((event) => `${event.date}:${event.venueName}:${event.city}:${event.ticketUrl ?? ""}`).join("|") ??
    "events-empty";
  const similarSwapKey =
    data?.similarArtistTracks?.map((entry) => `${entry.artistName}:${entry.track?.deezerUrl ?? ""}`).join("|") ??
    "similar-empty";
  // All sections empty after load -> keep the card shell and explain the empty state.
  if (!isLoading && !showProfile && !showTracks && !showEvents && !showSimilar) {
    return <ArtistInfoNoticeCard onClose={onClose} message={t("artist.empty")} />;
  }

  return (
    <EmbossedCard className={fullWidthEmbossedCardClassName}>
      <div className="relative">
        {onClose && (
          <button
            type="button"
            onClick={onClose}
            className="absolute top-3 right-3 z-10 p-1.5 rounded-full text-text-secondary hover:text-text-primary hover:bg-white/[0.08] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/30"
            aria-label={t("artist.closeInfo")}
          >
            <XIcon size={16} weight="duotone" />
          </button>
        )}

        {/* 1. Artist Profile */}
        <ArtistProfileMobileCard
          visible={showProfile}
          profile={data?.profile}
          showInitialSkeleton={showInitialSkeleton}
          providedByLabel={!showInitialSkeleton && data?.profile ? t("artist.profileProvidedBy") : undefined}
        />

        {/* 2. Popular Tracks */}
        <CollapsibleSection visible={showTracks} sectionClass="p-[var(--mc-pad-card,0.75rem)]" disableMobileCollapse>
          <RecessedCard className={recessedControlInsetClassName}>
            <RecessedCard.Header>
              <RecessedCard.Header.Title>{t("artist.popularTracks")}</RecessedCard.Header.Title>
            </RecessedCard.Header>
            <RecessedCard.Body>
              {showInitialSkeleton ? (
                <TracksSkeleton />
              ) : data && data.topTracks.length > 0 ? (
                <SmoothSwap swapKey={tracksSwapKey}>
                  <PopularTracksSection
                    tracks={data.topTracks}
                    onTrackResolve={onTrackResolve}
                    onResolveStart={onResolveStart}
                  />
                </SmoothSwap>
              ) : null}
            </RecessedCard.Body>
          </RecessedCard>
        </CollapsibleSection>

        {/* 3. Upcoming Events */}
        <CollapsibleSection visible={showEvents} sectionClass="p-[var(--mc-pad-card,0.75rem)]" disableMobileCollapse>
          <RecessedCard className={recessedControlInsetClassName}>
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
        </CollapsibleSection>

        {/* 4. Similar Artists */}
        <CollapsibleSection visible={showSimilar} sectionClass="p-[var(--mc-pad-card,0.75rem)]" disableMobileCollapse>
          <RecessedCard className={recessedControlInsetClassName}>
            <RecessedCard.Header>
              <RecessedCard.Header.Title>{t("artist.similarArtists")}</RecessedCard.Header.Title>
            </RecessedCard.Header>
            <RecessedCard.Body>
              {showInitialSkeleton ? (
                <SimilarArtistsSkeleton />
              ) : data?.similarArtistTracks && data.similarArtistTracks.length > 0 ? (
                <SmoothSwap swapKey={similarSwapKey}>
                  <SimilarArtistsSection
                    similarArtistTracks={data.similarArtistTracks}
                    onTrackResolve={onTrackResolve}
                    onResolveStart={onResolveStart}
                  />
                </SmoothSwap>
              ) : null}
            </RecessedCard.Body>
          </RecessedCard>
        </CollapsibleSection>
      </div>
    </EmbossedCard>
  );
}

function ArtistInfoNoticeCard({ onClose, message }: { onClose?: () => void; message: string }) {
  const t = useT();
  return (
    <EmbossedCard className={fullWidthEmbossedCardClassName}>
      <div className="relative">
        {onClose && (
          <button
            type="button"
            onClick={onClose}
            className="absolute top-3 right-3 z-10 p-1.5 rounded-full text-text-secondary hover:text-text-primary hover:bg-white/[0.08] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/30"
            aria-label={t("artist.closeInfo")}
          >
            <XIcon size={16} weight="duotone" />
          </button>
        )}
        <div className="p-3">
          <RecessedCard className="p-4 min-h-[108px]">
            <RecessedCard.Body>
              <p className="text-sm text-text-secondary text-center">{message}</p>
            </RecessedCard.Body>
          </RecessedCard>
        </div>
      </div>
    </EmbossedCard>
  );
}
