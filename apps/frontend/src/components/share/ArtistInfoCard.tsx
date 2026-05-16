/**
 * ArtistInfoCard -- displays artist profile, popular tracks, upcoming events, and similar artists.
 * Pure display component; data is fetched by the parent (ShareLayout).
 * Visually matches MediaCard: EmbossedCard with RecessedCard sections.
 */

import type { ArtistInfoResponse } from "@musiccloud/shared";
import { XIcon } from "@phosphor-icons/react";
import { useEffect, useReducer, useState } from "react";
import { EmbossedCard } from "@/components/cards/EmbossedCard";
import { RecessedCard } from "@/components/cards/RecessedCard";
import { ArtistProfileSection } from "@/components/share/ArtistProfileSection";
import { PopularTracksSection } from "@/components/share/PopularTracksSection";
import { SimilarArtistsSection } from "@/components/share/SimilarArtistsSection";
import { UpcomingEventsSection } from "@/components/share/UpcomingEventsSection";
import { CollapsibleSection } from "@/components/ui/CollapsibleSection";
import { CrossFade } from "@/components/ui/CrossFade";
import { useLocale, useT } from "@/i18n/context";

interface ArtistInfoCardProps {
  data: ArtistInfoResponse | null;
  isLoading: boolean;
  userRegion: string;
  onClose?: () => void;
}

export function ArtistInfoCard({ data, isLoading, userRegion, onClose }: ArtistInfoCardProps) {
  const t = useT();
  const { locale } = useLocale();

  // contentReady triggers the crossfade. Double-rAF ensures:
  //   Frame 1: React renders with contentReady=false -> content enters DOM at opacity-0
  //   Frame 2: setContentReady(true) -> skeleton fades to 0, content fades to 1 (simultaneously)
  const [contentReady, setContentReady] = useState(false);

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

  useEffect(() => {
    if (!isLoading) {
      let id1: number, id2: number;
      id1 = requestAnimationFrame(() => {
        id2 = requestAnimationFrame(() => setContentReady(true));
      });
      return () => {
        cancelAnimationFrame(id1);
        cancelAnimationFrame(id2);
      };
    }
    setContentReady(false);
  }, [isLoading]);

  // Never render when the API returned nothing useful
  if (!isLoading && !data) return null;
  // Suppress the loading skeleton while we are still inside the grace
  // window — avoids a brief flash for fast/null fetches.
  if (isLoading && !skeletonAllowed) return null;

  const showProfile = isLoading || !!data?.profile;
  const showTracks = isLoading || (data?.topTracks.length ?? 0) > 0;
  const showEvents = isLoading || (data?.events.length ?? 0) > 0;
  const showSimilar = isLoading || (data?.similarArtistTracks?.length ?? 0) > 0;

  // All sections empty after load -> nothing to render
  if (!isLoading && !showProfile && !showTracks && !showEvents && !showSimilar) return null;

  return (
    <EmbossedCard className="w-full rounded-[1.375rem] sm:rounded-[1.625rem] p-0">
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
              <CrossFade
                contentReady={contentReady}
                skeleton={<ProfileSkeleton />}
                content={data?.profile ? <ArtistProfileSection profile={data.profile} t={t} /> : null}
              />
            </RecessedCard.Body>
          </RecessedCard>
          {contentReady && data?.profile && (
            <p className="mt-2 text-xs text-text-muted text-center px-2">{t("artist.profileProvidedBy")}</p>
          )}
        </CollapsibleSection>

        {/* 2. Popular Tracks */}
        <CollapsibleSection visible={showTracks} sectionClass="p-3">
          <RecessedCard className="p-1.5" radius={{ base: "0.625rem", sm: "0.875rem" }}>
            <RecessedCard.Header>
              <RecessedCard.Header.Title>{t("artist.popularTracks")}</RecessedCard.Header.Title>
            </RecessedCard.Header>
            <RecessedCard.Body>
              <CrossFade
                contentReady={contentReady}
                skeleton={<TracksSkeleton />}
                content={data && data.topTracks.length > 0 ? <PopularTracksSection tracks={data.topTracks} /> : null}
              />
            </RecessedCard.Body>
          </RecessedCard>
        </CollapsibleSection>

        {/* 3. Upcoming Events */}
        <CollapsibleSection visible={showEvents} sectionClass="p-3">
          <RecessedCard className="p-1.5" radius={{ base: "0.625rem", sm: "0.875rem" }}>
            <RecessedCard.Header>
              <RecessedCard.Header.Title>{t("artist.upcomingEvents")}</RecessedCard.Header.Title>
            </RecessedCard.Header>
            <RecessedCard.Body>
              <CrossFade
                contentReady={contentReady}
                skeleton={<EventsSkeleton />}
                content={
                  data && data.events.length > 0 ? (
                    <UpcomingEventsSection events={data.events} userRegion={userRegion} locale={locale} />
                  ) : null
                }
              />
            </RecessedCard.Body>
          </RecessedCard>
          {contentReady && data && data.events.length > 0 && (
            <p className="mt-2 text-xs text-text-muted text-center px-2">{t("artist.eventsProvidedBy")}</p>
          )}
        </CollapsibleSection>

        {/* 4. Similar Artists */}
        <CollapsibleSection visible={showSimilar} sectionClass="p-3">
          <RecessedCard className="p-1.5" radius={{ base: "0.625rem", sm: "0.875rem" }}>
            <RecessedCard.Header>
              <RecessedCard.Header.Title>{t("artist.similarArtists")}</RecessedCard.Header.Title>
            </RecessedCard.Header>
            <RecessedCard.Body>
              <CrossFade
                contentReady={contentReady}
                skeleton={<SimilarArtistsSkeleton />}
                content={
                  data?.similarArtistTracks && data.similarArtistTracks.length > 0 ? (
                    <SimilarArtistsSection similarArtistTracks={data.similarArtistTracks} />
                  ) : null
                }
              />
            </RecessedCard.Body>
          </RecessedCard>
        </CollapsibleSection>
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
