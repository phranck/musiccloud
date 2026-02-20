/**
 * ArtistInfoCard – displays popular tracks, artist profile, and tour dates.
 * Pure display component; data is fetched by the parent (ShareLayout).
 * Visually matches MediaCard: GlassCard elevated, same tokens, same dividers.
 */

import { useState, useRef, useEffect } from "react";
import { createPortal } from "react-dom";
import { FaCircleInfo } from "react-icons/fa6";
import { cn } from "@/lib/utils";
import { GlassCard } from "@/components/cards/GlassCard";
import { useT, useLocale } from "@/i18n/context";
import type { ArtistInfoResponse, ArtistTopTrack, ArtistProfile, ArtistEvent } from "@musiccloud/shared";

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
      return () => { cancelAnimationFrame(id1); cancelAnimationFrame(id2); };
    }
    setContentReady(false);
  }, [isLoading]);

  // Never render when the API returned nothing useful
  if (!isLoading && !data) return null;

  const showProfile = isLoading || !!data?.profile;
  const showTracks  = isLoading || (data?.topTracks.length ?? 0) > 0;
  const showEvents  = isLoading || (data?.events.length ?? 0) > 0;
  const showSimilar = isLoading || (data?.profile?.similarArtists.length ?? 0) > 0;

  // All sections empty after load → nothing to render
  if (!isLoading && !showProfile && !showTracks && !showEvents && !showSimilar) return null;

  const hasLocalEvents =
    !isLoading && data && userRegion
      ? data.events.some((e) => e.country.toUpperCase() === userRegion.toUpperCase())
      : false;

  return (
    <GlassCard elevated className="w-full rounded-2xl sm:rounded-[36px] overflow-hidden">
      <div className="relative">
        {onClose && (
          <button
            onClick={onClose}
            className="absolute top-3 right-3 z-10 p-1.5 rounded-full text-text-secondary hover:text-text-primary hover:bg-white/[0.08] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/30"
            aria-label={t("artist.closeInfo")}
          >
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
              <path d="M12 4 4 12M4 4l8 8" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
            </svg>
          </button>
        )}

        {/* 1. Artist Profile */}
        <CollapsibleSection visible={showProfile} innerClass="px-6 pt-6 pb-6">
          <CrossFade
            contentReady={contentReady}
            skeleton={<ProfileSkeleton />}
            content={data?.profile ? (
              <>
                <ProfileSection profile={data.profile} t={t} />
                {data.profile.bioSummary && <BioSection bio={data.profile.bioSummary} t={t} />}
              </>
            ) : null}
          />
        </CollapsibleSection>

        {/* 2. Popular Tracks */}
        <CollapsibleSection visible={showTracks} withBorder>
          <CrossFade
            contentReady={contentReady}
            skeleton={<TracksSkeleton />}
            content={data && data.topTracks.length > 0
              ? <TopTracksSection tracks={data.topTracks} t={t} />
              : null}
          />
        </CollapsibleSection>

        {/* 3. Tour Dates */}
        <CollapsibleSection visible={showEvents} withBorder>
          <CrossFade
            contentReady={contentReady}
            skeleton={<EventsSkeleton />}
            content={data && data.events.length > 0
              ? <EventsSection events={data.events} userRegion={userRegion} hasLocalEvents={hasLocalEvents} t={t} locale={locale} />
              : null}
          />
        </CollapsibleSection>

        {/* 4. Similar Artists */}
        <CollapsibleSection visible={showSimilar} withBorder>
          <CrossFade
            contentReady={contentReady}
            skeleton={<SimilarArtistsSkeleton />}
            content={data?.profile && data.profile.similarArtists.length > 0
              ? <SimilarArtistsSection similarArtists={data.profile.similarArtists} t={t} />
              : null}
          />
        </CollapsibleSection>
      </div>
    </GlassCard>
  );
}

// ─── Layout helpers ────────────────────────────────────────────────────────────

/**
 * Animates both height (via grid-template-rows) and opacity.
 * All at 300ms so height-collapse and fade never fight each other.
 */
function CollapsibleSection({
  visible,
  withBorder = false,
  innerClass,
  children,
}: {
  visible: boolean;
  withBorder?: boolean;
  innerClass?: string;
  children: React.ReactNode;
}) {
  return (
    <div
      className={cn(
        "grid transition-[grid-template-rows,opacity] duration-300 ease-in-out",
        visible ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0",
      )}
    >
      {/* overflow-hidden is required for the grid-rows collapse to clip content */}
      <div className="overflow-hidden">
        <div
          className={cn(
            withBorder && "border-t border-white/[0.12]",
            "px-6 pt-5 pb-6",
            innerClass,
          )}
        >
          {children}
        </div>
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
      {/* Skeleton layer — fades out when content is ready */}
      <div
        aria-hidden="true"
        className={cn(
          "col-start-1 row-start-1 transition-opacity duration-300",
          contentReady ? "opacity-0 pointer-events-none" : "opacity-100",
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

function BioSection({ bio, t }: { bio: string; t: (key: string) => string }) {
  const [expanded, setExpanded] = useState(false);
  const [isClamped, setIsClamped] = useState(false);
  const [fullHeight, setFullHeight] = useState(0);
  const ref = useRef<HTMLParagraphElement>(null);

  // 3 lines × leading-relaxed (1.625) × text-base (1rem) = 4.875rem
  const COLLAPSED = "4.875rem";

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    setIsClamped(el.scrollHeight > el.clientHeight + 1);
    setFullHeight(el.scrollHeight);
  }, [bio]);

  return (
    <div className="mt-3">
      <div className="relative">
        <p
          ref={ref}
          className="text-base text-text-secondary leading-relaxed overflow-hidden transition-[max-height] duration-500 ease-in-out"
          style={{ maxHeight: expanded && fullHeight > 0 ? `${fullHeight}px` : COLLAPSED }}
        >
          {bio}
        </p>

        {/* Horizontal fade into "read more" — sits on the last visible line */}
        {isClamped && !expanded && (
          <div className="absolute bottom-0 right-0 flex items-center h-[1.625rem]">
            <div className="w-16 h-full bg-gradient-to-r from-transparent to-[#1C1C1E]" aria-hidden="true" />
            <button
              onClick={() => setExpanded(true)}
              className="bg-[#1C1C1E] pl-0.5 text-sm text-accent hover:text-accent/70 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/30 rounded"
            >
              {t("bio.readMore")}
            </button>
          </div>
        )}
      </div>

      {/* "Read less" sits below the expanded text */}
      {isClamped && expanded && (
        <div className="flex justify-end">
          <button
            onClick={() => setExpanded(false)}
            className="mt-1.5 text-sm text-accent hover:text-accent/70 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/30 rounded"
          >
            {t("bio.readLess")}
          </button>
        </div>
      )}
    </div>
  );
}

// ─── Top Tracks Section ───────────────────────────────────────────────────────

function TopTracksSection({ tracks, t }: { tracks: ArtistTopTrack[]; t: (key: string, vars?: Record<string, string>) => string }) {
  return (
    <div>
      <SectionHeading info={t("artist.popularTracksInfo")}>{t("artist.popularTracks")}</SectionHeading>
      <ul className="divide-y divide-white/[0.06]">
        {tracks.map((track) => (
          <li key={track.deezerUrl} className="py-3 first:pt-0 last:pb-0">
            <PopularTrack track={track} t={t} />
          </li>
        ))}
      </ul>
    </div>
  );
}

// ─── Popular Track ─────────────────────────────────────────────────────────────

function PopularTrack({ track, t }: { track: ArtistTopTrack; t: (key: string, vars?: Record<string, string>) => string }) {
  const showAlbum = track.albumName && track.albumName !== track.title;
  return (
    <div className="flex items-center gap-3">
      <div className="w-12 h-12 flex-none">
        {track.artworkUrl ? (
          <img
            src={track.artworkUrl}
            alt=""
            width={48}
            height={48}
            className="w-full h-full rounded-lg object-cover"
            onError={(e) => {
              (e.currentTarget as HTMLImageElement).style.display = "none";
            }}
          />
        ) : (
          <div className="w-full h-full rounded-lg bg-white/[0.06]" />
        )}
      </div>

      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium truncate text-text-primary">{track.title}</p>
        {showAlbum && (
          <p className="text-xs truncate text-text-secondary mt-0.5">{track.albumName}</p>
        )}
      </div>

      <div className="flex items-center gap-2 flex-none">
        {track.durationMs != null && (
          <span className="text-xs text-text-muted tabular-nums">{formatDuration(track.durationMs)}</span>
        )}
        <a
          href={`/?url=${encodeURIComponent(track.deezerUrl)}`}
          className="text-xs px-2.5 py-1 rounded-lg bg-white/[0.06] border border-white/[0.10] text-text-secondary hover:text-text-primary hover:bg-white/[0.10] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/30"
        >
          {t("artist.listen")} →
        </a>
      </div>
    </div>
  );
}

// ─── Events Section ───────────────────────────────────────────────────────────

function EventsSection({ events, userRegion, hasLocalEvents, t, locale }: { events: ArtistEvent[]; userRegion: string; hasLocalEvents: boolean; t: (key: string, vars?: Record<string, string>) => string; locale: string }) {
  return (
    <div>
      <SectionHeading info={hasLocalEvents ? t("artist.upcomingShowsInfo") : undefined}>
        {t("artist.upcomingShows")}
      </SectionHeading>
      <ul className="space-y-3">
        {events.map((event) => {
          const isLocal = userRegion && event.country.toUpperCase() === userRegion.toUpperCase();
          return (
            <li key={`${event.date}-${event.venueName || event.city}`} className="flex items-center gap-3">
              <div className="min-w-0 flex-1">
                <p className={`text-sm font-medium tabular-nums ${isLocal ? "text-accent" : "text-text-secondary"}`}>
                  {formatEventDate(event.date, locale)}
                  {isLocal && " ★"}
                </p>
                <p className="text-base text-text-primary truncate">
                  {event.venueName}
                  <span className="text-text-secondary">
                    {" · "}
                    {event.city}, {event.country}
                  </span>
                </p>
              </div>
              {event.ticketUrl && (
                <a
                  href={event.ticketUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex-none text-xs px-2.5 py-1 rounded-lg bg-white/[0.06] border border-white/[0.10] text-text-secondary hover:text-text-primary hover:bg-white/[0.10] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/30"
                >
                  {t("artist.tickets")} →
                </a>
              )}
            </li>
          );
        })}
      </ul>
      <p className="mt-4 text-xs text-text-muted text-center">{t("artist.eventsProvidedBy")}</p>
    </div>
  );
}

// ─── Similar Artists Section ──────────────────────────────────────────────────

function SimilarArtistsSection({ similarArtists, t }: { similarArtists: string[]; t: (key: string, vars?: Record<string, string>) => string }) {
  const first3 = similarArtists.slice(0, 3);
  return (
    <div>
      <SectionHeading>{t("artist.similarArtists")}</SectionHeading>
      <ul className="divide-y divide-white/[0.06]">
        {first3.map((name) => (
          <li key={name} className="py-3 first:pt-0 last:pb-0">
            <SimilarArtistTopTrack artistName={name} t={t} />
          </li>
        ))}
      </ul>
    </div>
  );
}

function SimilarArtistTopTrack({ artistName, t }: { artistName: string; t: (key: string, vars?: Record<string, string>) => string }) {
  const [{ isLoading, track }, setState] = useState<{ isLoading: boolean; track: ArtistTopTrack | null }>({
    isLoading: true,
    track: null,
  });

  useEffect(() => {
    let cancelled = false;
    const params = new URLSearchParams({ name: artistName });
    fetch(`/api/artist-info?${params.toString()}`)
      .then((res) => (res.ok ? (res.json() as Promise<ArtistInfoResponse>) : null))
      .then((data) => { if (!cancelled) setState({ isLoading: false, track: data?.topTracks[0] ?? null }); })
      .catch(() => { if (!cancelled) setState({ isLoading: false, track: null }); });
    return () => { cancelled = true; };
  }, [artistName]);

  if (isLoading) {
    return (
      <div className="animate-pulse">
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
    );
  }

  if (!track) return null;

  return (
    <div>
      <p className="text-sm text-text-primary mb-1.5">{artistName}</p>
      <PopularTrack track={track} t={t} />
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
      if (
        buttonRef.current?.contains(e.target as Node) ||
        popoverRef.current?.contains(e.target as Node)
      ) return;
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
    <div className="flex items-center justify-between mb-3">
      <p className="text-sm uppercase tracking-widest text-text-secondary">{children}</p>
      {info && (
        <>
          <button
            ref={buttonRef}
            onClick={handleToggle}
            className="p-1 text-white/30 hover:text-white/60 transition-colors rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/30"
            aria-label="Info"
          >
            <FaCircleInfo className="w-3.5 h-3.5" />
          </button>
          {open && createPortal(
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
    return new Intl.DateTimeFormat(locale || "en", { month: "short", day: "numeric" }).format(new Date(iso + "T00:00:00"));
  } catch {
    return iso;
  }
}
