/**
 * ArtistInfoCard – displays popular tracks, artist profile, and tour dates.
 * Pure display component; data is fetched by the parent (ShareLayout).
 * Visually matches MediaCard: EmbossedCard with RecessedCard sections.
 */

import type {
  ArtistEvent,
  ArtistInfoResponse,
  ArtistProfile,
  ArtistTopTrack,
  SimilarArtistTrack,
} from "@musiccloud/shared";
import { Info, Ticket, X } from "@phosphor-icons/react";
import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { EmbossedCard } from "@/components/cards/EmbossedCard";
import { RecessedCard } from "@/components/cards/RecessedCard";
import { EmbossedButton } from "@/components/ui/EmbossedButton";
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
  //   Frame 1: React renders with contentReady=false → content enters DOM at opacity-0
  //   Frame 2: setContentReady(true) → skeleton fades to 0, content fades to 1 (simultaneously)
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

  // All sections empty after load → nothing to render
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
            <X size={16} weight="duotone" />
          </button>
        )}

        {/* 1. Artist Profile */}
        <CollapsibleSection visible={showProfile} sectionClass="px-3 sm:px-5 pt-3 sm:pt-5 pb-3">
          <RecessedCard className="rounded-xl sm:rounded-2xl p-4">
            <CrossFade
              contentReady={contentReady}
              skeleton={<ProfileSkeleton />}
              content={
                data?.profile ? (
                  <>
                    <ProfileSection profile={data.profile} t={t} />
                    {data.profile.bioSummary && <BioSection bio={data.profile.bioSummary} />}
                  </>
                ) : null
              }
            />
          </RecessedCard>
          {contentReady && data?.profile && (
            <p className="mt-2 text-xs text-text-muted text-center px-2">{t("artist.profileProvidedBy")}</p>
          )}
        </CollapsibleSection>

        {/* 2. Popular Tracks */}
        <CollapsibleSection visible={showTracks} sectionClass="px-3 sm:px-5 py-3">
          <RecessedCard className="rounded-xl sm:rounded-2xl p-2">
            <CrossFade
              contentReady={contentReady}
              skeleton={<TracksSkeleton />}
              content={data && data.topTracks.length > 0 ? <TopTracksSection tracks={data.topTracks} t={t} /> : null}
            />
          </RecessedCard>
        </CollapsibleSection>

        {/* 3. Tour Dates */}
        <CollapsibleSection visible={showEvents} sectionClass="px-3 sm:px-5 py-3">
          <RecessedCard className="rounded-xl sm:rounded-2xl p-2">
            <CrossFade
              contentReady={contentReady}
              skeleton={<EventsSkeleton />}
              content={
                data && data.events.length > 0 ? (
                  <EventsSection
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
          <RecessedCard className="rounded-xl sm:rounded-2xl p-2">
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

// ─── Layout helpers ────────────────────────────────────────────────────────────

/**
 * Animates both height (via grid-template-rows) and opacity.
 * All at 300ms so height-collapse and fade never fight each other.
 */
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

/**
 * CrossFade: skeleton and content live in the same grid cell (CSS overlay).
 * When contentReady flips to true, both transitions fire in the same render:
 *   skeleton: opacity 1→0 (fade out)
 *   content:  opacity 0→1 (fade in)
 * → true simultaneous crossfade, no blank gap.
 */
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
      {/* Skeleton layer — fades out, then collapses so it doesn't inflate height */}
      <div
        aria-hidden="true"
        className={cn(
          "col-start-1 row-start-1 transition-all duration-300",
          contentReady ? "opacity-0 pointer-events-none h-0 overflow-hidden" : "opacity-100",
        )}
      >
        {skeleton}
      </div>

      {/* Content layer — fades in when content is ready */}
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

// ─── Skeletons ─────────────────────────────────────────────────────────────────

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
      {/* Bio placeholder */}
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

// ─── Profile Section ──────────────────────────────────────────────────────────

function ProfileSection({ profile, t }: { profile: ArtistProfile; t: (key: string) => string }) {
  return (
    <div className="flex gap-4">
      {profile.imageUrl && (
        <img
          src={profile.imageUrl}
          alt=""
          width={96}
          height={96}
          className="w-24 h-24 rounded-xl object-cover flex-none"
          onError={(e) => {
            (e.currentTarget as HTMLImageElement).style.display = "none";
          }}
        />
      )}
      <div className="min-w-0 flex-1 pt-1">
        {profile.genres.length > 0 && (
          <div className="flex flex-wrap gap-1.5 mb-2">
            {profile.genres.map((g) => (
              <span
                key={g}
                className="text-xs px-2 py-0.5 rounded-full bg-white/[0.06] border border-white/[0.08] text-text-secondary capitalize"
              >
                {g}
              </span>
            ))}
          </div>
        )}
        <p className="text-sm text-text-secondary">
          {formatCount(profile.followers)} {t("artist.spotifyFollowers")}
          {profile.scrobbles != null && ` · ${formatCount(profile.scrobbles)} ${t("artist.lastfmPlays")}`}
        </p>
        {profile.similarArtists.length > 0 && (
          <p className="text-sm text-text-secondary mt-1">
            {t("artist.similar")}: {profile.similarArtists.join(" · ")}
          </p>
        )}
      </div>
    </div>
  );
}

function BioSection({ bio }: { bio: string }) {
  return <p className="text-base text-text-secondary leading-relaxed mt-3">{bio}</p>;
}

// ─── Top Tracks Section ───────────────────────────────────────────────────────

function TopTracksSection({
  tracks,
  t,
}: {
  tracks: ArtistTopTrack[];
  t: (key: string, vars?: Record<string, string>) => string;
}) {
  return (
    <div>
      <SectionHeading info={t("artist.popularTracksInfo")}>{t("artist.popularTracks")}</SectionHeading>
      <div className="flex flex-col gap-2">
        {tracks.map((track) => (
          <PopularTrack key={track.deezerUrl} track={track} t={t} />
        ))}
      </div>
    </div>
  );
}

// ─── Popular Track ─────────────────────────────────────────────────────────────

function PopularTrack({
  track,
  t,
  artistLabel,
}: {
  track: ArtistTopTrack;
  t: (key: string, vars?: Record<string, string>) => string;
  artistLabel?: string;
}) {
  const showAlbum = !artistLabel && track.albumName && track.albumName !== track.title;
  const [resolving, setResolving] = useState(false);

  const handleListen = useCallback(() => {
    if (track.shortId) {
      window.location.href = `/${track.shortId}`;
      return;
    }
    setResolving(true);
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15000);
    fetch("/api/resolve", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ query: track.deezerUrl }),
      signal: controller.signal,
    })
      .then((res) => {
        clearTimeout(timeout);
        if (!res.ok) throw new Error("resolve failed");
        return res.json() as Promise<{ shortUrl?: string }>;
      })
      .then((data) => {
        if (data.shortUrl) {
          const path = new URL(data.shortUrl).pathname;
          window.location.href = path;
        } else {
          setResolving(false);
        }
      })
      .catch(() => {
        clearTimeout(timeout);
        setResolving(false);
      });
  }, [track.shortId, track.deezerUrl]);

  return (
    <EmbossedButton
      as="button"
      type="button"
      onClick={handleListen}
      className="flex items-center gap-3 w-full rounded-lg px-3 py-2"
    >
      <div className="w-10 h-10 flex-none">
        {resolving ? (
          <SpinningCD size={40} />
        ) : track.artworkUrl ? (
          <img
            src={track.artworkUrl}
            alt=""
            width={40}
            height={40}
            className="w-full h-full rounded-lg object-cover"
            onError={(e) => {
              (e.currentTarget as HTMLImageElement).style.display = "none";
            }}
          />
        ) : (
          <div className="w-full h-full rounded-lg bg-white/[0.06]" />
        )}
      </div>
      <div className="min-w-0 flex-1 text-left">
        <p className="text-sm font-medium text-text-primary truncate">{track.title}</p>
        {artistLabel && <p className="text-xs text-text-secondary mt-0.5 truncate">{artistLabel}</p>}
        {showAlbum && <p className="text-xs text-text-secondary mt-0.5 truncate">{track.albumName}</p>}
      </div>
      {track.durationMs != null && (
        <span className="text-xs text-text-secondary tabular-nums flex-none">{formatDuration(track.durationMs)}</span>
      )}
    </EmbossedButton>
  );
}

function SpinningCD({ size = 28 }: { size?: number }) {
  return (
    <div className="relative animate-vinyl-spin" style={{ width: size, height: size }}>
      <div
        className="absolute inset-0 rounded-full"
        style={{
          background: "radial-gradient(circle at 50% 50%, #e8e8f0 0%, #a0a0b0 40%, #c8c8d0 70%, #b0b0b8 100%)",
        }}
      />
      <div
        className="absolute inset-0 rounded-full animate-cd-shimmer"
        style={{
          background:
            "conic-gradient(from 30deg, #a060ff 0%, #40b0ff 20%, #40ffc0 35%, #ffe040 50%, #ff6090 65%, #a060ff 80%, transparent 95%)",
          opacity: 0.45,
        }}
      />
      <div
        className="absolute inset-0 rounded-full"
        style={{ background: "radial-gradient(circle at 35% 30%, rgba(255,255,255,0.7) 0%, transparent 40%)" }}
      />
      <div
        className="absolute rounded-full bg-[#0a0a0c]"
        style={{ top: "38%", left: "38%", width: "24%", height: "24%" }}
      />
    </div>
  );
}

// ─── Events Section ───────────────────────────────────────────────────────────

function EventsSection({
  events,
  userRegion,
  hasLocalEvents,
  t,
  locale,
}: {
  events: ArtistEvent[];
  userRegion: string;
  hasLocalEvents: boolean;
  t: (key: string, vars?: Record<string, string>) => string;
  locale: string;
}) {
  return (
    <div>
      <SectionHeading info={hasLocalEvents ? t("artist.upcomingShowsInfo") : undefined}>
        {t("artist.upcomingShows")}
      </SectionHeading>
      <div className="flex flex-col gap-2">
        {events.map((event) => {
          const isLocal = userRegion && event.country.toUpperCase() === userRegion.toUpperCase();
          const Wrapper = event.ticketUrl ? EmbossedButton : "div";
          const wrapperProps = event.ticketUrl
            ? { href: event.ticketUrl, target: "_blank", rel: "noopener noreferrer" }
            : {};
          return (
            <Wrapper
              key={`${event.date}-${event.venueName || event.city}`}
              className="flex items-center gap-3 w-full rounded-lg px-3 py-2 no-underline"
              {...wrapperProps}
            >
              <div className="min-w-0 flex-1">
                <p className={`text-sm font-medium tabular-nums ${isLocal ? "text-accent" : "text-text-secondary"}`}>
                  {formatEventDate(event.date, locale)}
                  {isLocal && " \u2605"}
                </p>
                <p className="text-sm text-text-primary break-words">
                  {event.venueName}
                  <span className="text-text-secondary">
                    {" \u00B7 "}
                    {event.city}, {event.country}
                  </span>
                </p>
              </div>
              {event.ticketUrl && <Ticket size={24} weight="duotone" className="text-text-secondary flex-none" />}
            </Wrapper>
          );
        })}
      </div>
    </div>
  );
}

// ─── Similar Artists Section ──────────────────────────────────────────────────

function SimilarArtistsSection({
  similarArtistTracks,
  t,
}: {
  similarArtistTracks: SimilarArtistTrack[];
  t: (key: string, vars?: Record<string, string>) => string;
}) {
  return (
    <div>
      <SectionHeading>{t("artist.similarArtists")}</SectionHeading>
      <div className="flex flex-col gap-2">
        {similarArtistTracks.map(({ artistName, track }) =>
          track ? (
            <PopularTrack key={artistName} track={track} t={t} artistLabel={artistName} />
          ) : (
            <p key={artistName} className="text-sm text-text-primary px-2">
              {artistName}
            </p>
          ),
        )}
      </div>
    </div>
  );
}

// ─── Shared UI ────────────────────────────────────────────────────────────────

function SectionHeading({ children, info }: { children: React.ReactNode; info?: string }) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState({ top: 0, left: 0 });
  const buttonRef = useRef<HTMLButtonElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (buttonRef.current?.contains(e.target as Node) || popoverRef.current?.contains(e.target as Node)) return;
      setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  function handleToggle() {
    if (!open && buttonRef.current) {
      const r = buttonRef.current.getBoundingClientRect();
      setPos({ top: r.top, left: r.left + r.width / 2 });
    }
    setOpen((o) => !o);
  }

  return (
    <div className="flex items-center justify-between mb-3 px-2">
      <p
        className="text-sm uppercase tracking-widest text-text-secondary font-bold"
        style={{ fontFamily: "var(--font-condensed)" }}
      >
        {children}
      </p>
      {info && (
        <>
          <button
            ref={buttonRef}
            type="button"
            onClick={handleToggle}
            className="p-1 text-white/30 hover:text-white/60 transition-colors rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/30"
            aria-label="Info"
          >
            <Info size={20} weight="duotone" />
          </button>
          {open &&
            createPortal(
              <div
                ref={popoverRef}
                className="fixed w-60 p-3 rounded-xl bg-surface-elevated border border-white/[0.10] shadow-xl z-[200] text-sm text-text-secondary leading-relaxed"
                style={{
                  top: pos.top,
                  left: pos.left,
                  transform: "translate(-50%, calc(-100% - 8px))",
                }}
              >
                {info}
              </div>,
              document.body,
            )}
        </>
      )}
    </div>
  );
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatCount(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}

function formatDuration(ms: number): string {
  const s = Math.round(ms / 1000);
  const m = Math.floor(s / 60);
  const sec = s % 60;
  return `${m}:${sec.toString().padStart(2, "0")}`;
}

function formatEventDate(iso: string, locale: string): string {
  try {
    return new Intl.DateTimeFormat(locale || "en", { month: "short", day: "numeric" }).format(
      new Date(`${iso}T00:00:00`),
    );
  } catch {
    return iso;
  }
}
