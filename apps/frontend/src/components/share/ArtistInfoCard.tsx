/**
 * ArtistInfoCard -- displays artist profile, popular tracks, upcoming events, and similar artists.
 * Pure display component; data is fetched by the parent (ShareLayout).
 * Visually matches MediaCard: EmbossedCard with RecessedCard sections.
 */

import type { ArtistInfoResponse } from "@musiccloud/shared";
import { XIcon } from "@phosphor-icons/react";
import { useEffect, useState } from "react";
import { EmbossedCard } from "@/components/cards/EmbossedCard";
import { RecessedCard } from "@/components/cards/RecessedCard";
import { ArtistProfileSection } from "@/components/share/ArtistProfileSection";
import { PopularTracksSection } from "@/components/share/PopularTracksSection";
import { SimilarArtistsSection } from "@/components/share/SimilarArtistsSection";
import { UpcomingEventsSection } from "@/components/share/UpcomingEventsSection";
import { useLocale, useT } from "@/i18n/context";
import { cn } from "@/lib/utils";

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

  const showProfile = isLoading || !!data?.profile;
  const showTracks = isLoading || (data?.topTracks.length ?? 0) > 0;
  const showEvents = isLoading || (data?.events.length ?? 0) > 0;
  const showSimilar = isLoading || (data?.similarArtistTracks?.length ?? 0) > 0;

  // All sections empty after load -> nothing to render
  if (!isLoading && !showProfile && !showTracks && !showEvents && !showSimilar) return null;

  const hasLocalEvents =
    !isLoading && data && userRegion
      ? data.events.some((e) => e.country.toUpperCase() === userRegion.toUpperCase())
      : false;

  return (
    <EmbossedCard className="w-full rounded-3xl sm:rounded-[36px] p-0">
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
        <CollapsibleSection visible={showProfile} sectionClass="px-3 sm:px-5 pt-3 sm:pt-5 pb-3">
          {/* min-h = artwork (96) + 2 × 10 padding = 116 px. Guarantees the
              card never collapses below the artwork height when the profile
              has minimal text (no genres, no similar artists, no bio), so the
              bottom edge doesn't slide up against the artwork. */}
          <RecessedCard className="p-[10px] min-h-[116px]" radius={{ base: "0.75rem", sm: "1rem" }}>
            <CrossFade
              contentReady={contentReady}
              skeleton={<ProfileSkeleton />}
              content={data?.profile ? <ArtistProfileSection profile={data.profile} t={t} /> : null}
            />
          </RecessedCard>
          {contentReady && data?.profile && (
            <p className="mt-2 text-xs text-text-muted text-center px-2">{t("artist.profileProvidedBy")}</p>
          )}
        </CollapsibleSection>

        {/* 2. Popular Tracks */}
        <CollapsibleSection visible={showTracks} sectionClass="px-3 sm:px-5 py-3">
          <RecessedCard className="p-2" radius={{ base: "0.75rem", sm: "1rem" }}>
            <CrossFade
              contentReady={contentReady}
              skeleton={<TracksSkeleton />}
              content={
                data && data.topTracks.length > 0 ? <PopularTracksSection tracks={data.topTracks} t={t} /> : null
              }
            />
          </RecessedCard>
        </CollapsibleSection>

        {/* 3. Upcoming Events */}
        <CollapsibleSection visible={showEvents} sectionClass="px-3 sm:px-5 py-3">
          <RecessedCard className="p-2" radius={{ base: "0.75rem", sm: "1rem" }}>
            <CrossFade
              contentReady={contentReady}
              skeleton={<EventsSkeleton />}
              content={
                data && data.events.length > 0 ? (
                  <UpcomingEventsSection
                    events={data.events}
                    userRegion={userRegion}
                    hasLocalEvents={hasLocalEvents}
                    t={t}
                    locale={locale}
                  />
                ) : null
              }
            />
          </RecessedCard>
          {contentReady && data && data.events.length > 0 && (
            <p className="mt-2 text-xs text-text-muted text-center px-2">{t("artist.eventsProvidedBy")}</p>
          )}
        </CollapsibleSection>

        {/* 4. Similar Artists */}
        <CollapsibleSection visible={showSimilar} sectionClass="px-3 sm:px-5 pt-3 pb-3 sm:pb-5">
          <RecessedCard className="p-2" radius={{ base: "0.75rem", sm: "1rem" }}>
            <CrossFade
              contentReady={contentReady}
              skeleton={<SimilarArtistsSkeleton />}
              content={
                data?.similarArtistTracks && data.similarArtistTracks.length > 0 ? (
                  <SimilarArtistsSection similarArtistTracks={data.similarArtistTracks} t={t} />
                ) : null
              }
            />
          </RecessedCard>
        </CollapsibleSection>
      </div>
    </EmbossedCard>
  );
}

// --- Layout helpers ---

function CollapsibleSection({
  visible,
  sectionClass,
  children,
}: {
  visible: boolean;
  sectionClass?: string;
  children: React.ReactNode;
}) {
  return (
    <div
      className={cn(
        "grid transition-[grid-template-rows,opacity] duration-300 ease-in-out",
        visible ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0",
      )}
    >
      <div className="overflow-hidden">
        <div className={cn("px-5 py-3", sectionClass)}>{children}</div>
      </div>
    </div>
  );
}

function CrossFade({
  contentReady,
  skeleton,
  content,
}: {
  contentReady: boolean;
  skeleton: React.ReactNode;
  content: React.ReactNode | null;
}) {
  return (
    <div className="grid">
      <div
        aria-hidden="true"
        className={cn(
          "col-start-1 row-start-1 transition-all duration-300",
          contentReady ? "opacity-0 pointer-events-none h-0 overflow-hidden" : "opacity-100",
        )}
      >
        {skeleton}
      </div>
      {content && (
        <div
          className={cn(
            "col-start-1 row-start-1 transition-opacity duration-300",
            contentReady ? "opacity-100" : "opacity-0 pointer-events-none",
          )}
        >
          {content}
        </div>
      )}
    </div>
  );
}

// --- Skeletons ---

function ProfileSkeleton() {
  return (
    <div className="animate-pulse">
      <div className="flex gap-4">
        <div className="w-24 h-24 rounded-xl bg-white/[0.08] flex-none" />
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
    <div className="animate-pulse">
      <div className="h-3 bg-white/[0.08] rounded w-1/3 mb-4" />
      <div className="space-y-4">
        {(["sk-a", "sk-b", "sk-c"] as const).map((k) => (
          <div key={k} className="flex gap-3 items-center">
            <div className="w-12 h-12 rounded-lg bg-white/[0.08] flex-none" />
            <div className="flex-1 space-y-1.5">
              <div className="h-3 bg-white/[0.08] rounded w-4/5" />
              <div className="h-2.5 bg-white/[0.08] rounded w-3/5" />
            </div>
            <div className="h-7 w-16 rounded-lg bg-white/[0.08] flex-none" />
          </div>
        ))}
      </div>
    </div>
  );
}

function EventsSkeleton() {
  return (
    <div className="animate-pulse">
      <div className="h-3 bg-white/[0.08] rounded w-1/3 mb-4" />
      <div className="space-y-4">
        {(["sk-a", "sk-b"] as const).map((k) => (
          <div key={k} className="flex items-center gap-3">
            <div className="flex-1 space-y-1.5">
              <div className="h-3 bg-white/[0.08] rounded w-16" />
              <div className="h-4 bg-white/[0.08] rounded w-3/4" />
            </div>
            <div className="h-7 w-20 rounded-lg bg-white/[0.08] flex-none" />
          </div>
        ))}
      </div>
    </div>
  );
}

function SimilarArtistsSkeleton() {
  return (
    <div className="animate-pulse">
      <div className="h-3 bg-white/[0.08] rounded w-1/3 mb-4" />
      <div className="space-y-5">
        {(["sk-a", "sk-b", "sk-c"] as const).map((k) => (
          <div key={k}>
            <div className="h-3 bg-white/[0.08] rounded w-1/4 mb-2" />
            <div className="flex gap-3 items-center">
              <div className="w-12 h-12 rounded-lg bg-white/[0.08] flex-none" />
              <div className="flex-1 space-y-1.5">
                <div className="h-3 bg-white/[0.08] rounded w-4/5" />
                <div className="h-2.5 bg-white/[0.08] rounded w-3/5" />
              </div>
              <div className="h-7 w-16 rounded-lg bg-white/[0.08] flex-none" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
