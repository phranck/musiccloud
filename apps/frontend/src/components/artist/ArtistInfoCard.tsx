/**
 * ArtistInfoCard -- displays artist profile, popular tracks, upcoming events, and similar artists.
 * Pure display component; data is fetched by the parent (ShareLayout).
 * Visually matches MediaCard: EmbossedCard with RecessedCard sections.
 */

import type { ArtistInfoResponse, ArtistTopTrack } from "@musiccloud/shared";
import { XIcon } from "@phosphor-icons/react";
import { useEffect, useReducer } from "react";
import { ArtistProfileSection } from "@/components/artist/ArtistProfileSection";
import { PopularTracksSection } from "@/components/artist/PopularTracksSection";
import { SimilarArtistsSection } from "@/components/artist/SimilarArtistsSection";
import { UpcomingEventsSection } from "@/components/artist/UpcomingEventsSection";
import { EmbossedCard } from "@/components/cards/EmbossedCard";
import { RecessedCard } from "@/components/cards/RecessedCard";
import { CollapsibleSection } from "@/components/ui/CollapsibleSection";
import { SmoothSwap } from "@/components/ui/SmoothSwap";
import { useLocale, useT } from "@/i18n/context";
import { solidEmbossedCardStyle } from "@/styles/neumorphic";

type ArtistInfoStatus = "loading" | "ready" | "empty" | "error";

interface ArtistInfoCardProps {
  data: ArtistInfoResponse | null;
  isLoading: boolean;
  status?: ArtistInfoStatus;
  userRegion: string;
  onClose?: () => void;
  onTrackResolve?: (track: ArtistTopTrack) => Promise<void>;
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

  // Skeleton render gate. Suppresses the loading skeleton for the first
  // 300 ms of mount, so a fast/null fetch (cache hit, 5xx) never produces
  // the "empty card flashes in then disappears" effect. If the fetch is
  // still pending after the threshold, the skeleton appears as before.
  const SKELETON_DELAY_MS = 300;
  const [skeletonAllowed, allowSkeleton] = useReducer(() => true, false);
  useEffect(() => {
    const timer = setTimeout(allowSkeleton, SKELETON_DELAY_MS);
    return () => clearTimeout(timer);
  }, []);

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
      <EmbossedCard className="w-full rounded-[1.375rem] sm:rounded-[1.625rem] p-0" style={solidEmbossedCardStyle}>
        <div className="min-h-[560px]" aria-hidden="true" />
      </EmbossedCard>
    );
  }

  const showInitialSkeleton = isLoading && !data;
  const showProfile = showInitialSkeleton || !!data?.profile;
  const showTracks = showInitialSkeleton || (data?.topTracks.length ?? 0) > 0;
  const showEvents = showInitialSkeleton || (data?.events.length ?? 0) > 0;
  const showSimilar = showInitialSkeleton || (data?.similarArtistTracks?.length ?? 0) > 0;
  const profileSwapKey = data?.profile
    ? [data.profile.imageUrl, data.profile.genres.join("|"), data.profile.bioSummary ?? ""].join("::")
    : "profile-empty";
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
    <EmbossedCard className="w-full rounded-[1.375rem] sm:rounded-[1.625rem] p-0" style={solidEmbossedCardStyle}>
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
        <CollapsibleSection visible={showProfile} sectionClass="p-3">
          {/* min-h = artwork (96) + 2 × 6 padding = 108 px. Guarantees the
              card never collapses below the artwork height when the profile
              has minimal text (no genres, no similar artists, no bio), so the
              bottom edge doesn't slide up against the artwork. */}
          <RecessedCard className="p-1.5 min-h-[108px]" radius={{ base: "0.625rem", sm: "0.875rem" }}>
            <RecessedCard.Body>
              {showInitialSkeleton ? (
                <ProfileSkeleton />
              ) : data?.profile ? (
                <SmoothSwap swapKey={profileSwapKey}>
                  <ArtistProfileSection profile={data.profile} t={t} />
                </SmoothSwap>
              ) : null}
            </RecessedCard.Body>
          </RecessedCard>
          {!showInitialSkeleton && data?.profile && (
            <p className="mt-2 text-xs text-text-muted text-center px-2">{t("artist.profileProvidedBy")}</p>
          )}
        </CollapsibleSection>

        {/* 2. Popular Tracks */}
        <CollapsibleSection visible={showTracks} sectionClass="p-3">
          <RecessedCard className="p-[0.1875rem]" radius={{ base: "0.625rem", sm: "0.875rem" }}>
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
        <CollapsibleSection visible={showEvents} sectionClass="p-3">
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
        </CollapsibleSection>

        {/* 4. Similar Artists */}
        <CollapsibleSection visible={showSimilar} sectionClass="p-3">
          <RecessedCard className="p-[0.1875rem]" radius={{ base: "0.625rem", sm: "0.875rem" }}>
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
    <EmbossedCard className="w-full rounded-[1.375rem] sm:rounded-[1.625rem] p-0" style={solidEmbossedCardStyle}>
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
          <RecessedCard className="p-4 min-h-[108px]" radius={{ base: "0.625rem", sm: "0.875rem" }}>
            <RecessedCard.Body>
              <p className="text-sm text-text-secondary text-center">{message}</p>
            </RecessedCard.Body>
          </RecessedCard>
        </div>
      </div>
    </EmbossedCard>
  );
}

// --- Skeletons ---

function ProfileSkeleton() {
  return (
    <div className="animate-pulse">
      <div className="flex gap-4">
        <div className="size-24 rounded-[4px] sm:rounded-lg bg-white/[0.08] flex-none" />
        <div className="flex-1 space-y-2 pt-1">
          <div className="flex gap-1.5 flex-wrap">
            <div className="h-5 w-14 rounded-full bg-white/[0.08]" />
            <div className="h-5 w-10 rounded-full bg-white/[0.08]" />
          </div>
          <div className="h-3 bg-white/[0.08] rounded w-3/4" />
          <div className="h-3 bg-white/[0.08] rounded w-1/2" />
        </div>
      </div>
      <div className="mt-3 space-y-1.5">
        <div className="h-3 bg-white/[0.08] rounded w-full" />
        <div className="h-3 bg-white/[0.08] rounded w-[90%]" />
        <div className="h-3 bg-white/[0.08] rounded w-4/5" />
      </div>
    </div>
  );
}

function TracksSkeleton() {
  return (
    <div className="animate-pulse space-y-4">
      {(["sk-a", "sk-b", "sk-c"] as const).map((k) => (
        <div key={k} className="flex gap-3 items-center">
          <div className="size-12 rounded-[4px] sm:rounded-lg bg-white/[0.08] flex-none" />
          <div className="flex-1 space-y-1.5">
            <div className="h-3 bg-white/[0.08] rounded w-4/5" />
            <div className="h-2.5 bg-white/[0.08] rounded w-3/5" />
          </div>
          <div className="h-7 w-16 rounded-[4px] sm:rounded-lg bg-white/[0.08] flex-none" />
        </div>
      ))}
    </div>
  );
}

function EventsSkeleton() {
  return (
    <div className="animate-pulse space-y-4">
      {(["sk-a", "sk-b"] as const).map((k) => (
        <div key={k} className="flex items-center gap-3">
          <div className="flex-1 space-y-1.5">
            <div className="h-3 bg-white/[0.08] rounded w-16" />
            <div className="h-4 bg-white/[0.08] rounded w-3/4" />
          </div>
          <div className="h-7 w-20 rounded-[4px] sm:rounded-lg bg-white/[0.08] flex-none" />
        </div>
      ))}
    </div>
  );
}

function SimilarArtistsSkeleton() {
  return (
    <div className="animate-pulse space-y-5">
      {(["sk-a", "sk-b", "sk-c"] as const).map((k) => (
        <div key={k}>
          <div className="h-3 bg-white/[0.08] rounded w-1/4 mb-2" />
          <div className="flex gap-3 items-center">
            <div className="size-12 rounded-[4px] sm:rounded-lg bg-white/[0.08] flex-none" />
            <div className="flex-1 space-y-1.5">
              <div className="h-3 bg-white/[0.08] rounded w-4/5" />
              <div className="h-2.5 bg-white/[0.08] rounded w-3/5" />
            </div>
            <div className="h-7 w-16 rounded-[4px] sm:rounded-lg bg-white/[0.08] flex-none" />
          </div>
        </div>
      ))}
    </div>
  );
}
