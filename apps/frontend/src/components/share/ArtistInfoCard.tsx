/**
 * ArtistInfoCard – displays popular tracks, artist profile, and tour dates.
 * Pure display component; data is fetched by the parent (ShareLayout).
 * Visually matches MediaCard: GlassCard elevated, same tokens, same dividers.
 */

import { useState, useRef, useEffect } from "react";
import { createPortal } from "react-dom";
import { FaCircleInfo } from "react-icons/fa6";
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

  if (isLoading) return <ArtistInfoSkeleton />;
  if (!data) return null;

  const hasContent =
    data.topTracks.length > 0 || data.profile !== null || data.events.length > 0;

  if (!hasContent) return null;

  const hasLocalEvents = userRegion
    ? data.events.some((e) => e.country.toUpperCase() === userRegion.toUpperCase())
    : false;

  return (
    <GlassCard elevated className="w-full rounded-2xl sm:rounded-[36px]">
      {/* relative wrapper needed for absolute close button */}
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
        {data.profile && (
          <div className="px-6 pt-6 pb-6">
            <ProfileSection profile={data.profile} t={t} />
            {data.profile.bioSummary && <BioSection bio={data.profile.bioSummary} />}
          </div>
        )}

        {/* 2. Popular Tracks */}
        {data.topTracks.length > 0 && (
          <div className="border-t border-white/[0.06] px-6 pt-5 pb-6">
            <TopTracksSection tracks={data.topTracks} t={t} />
          </div>
        )}

        {/* 3. Tour Dates */}
        {data.events.length > 0 && (
          <div className="border-t border-white/[0.06] px-6 pt-5 pb-6">
            <EventsSection events={data.events} userRegion={userRegion} hasLocalEvents={hasLocalEvents} t={t} locale={locale} />
          </div>
        )}

        {/* 4. Similar Artists */}
        {data.profile && data.profile.similarArtists.length > 0 && (
          <div className="border-t border-white/[0.06] px-6 pt-5 pb-6">
            <SimilarArtistsSection similarArtists={data.profile.similarArtists} t={t} />
          </div>
        )}
      </div>
    </GlassCard>
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
  return (
    <p className="text-base text-text-secondary leading-relaxed mt-3">{bio}</p>
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
      {/* Cover – small */}
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

      {/* Middle: title + duration in one row, album below */}
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline justify-between gap-2">
          <p className="text-sm font-medium truncate text-text-primary">{track.title}</p>
          {track.durationMs != null && (
            <span className="text-xs text-text-muted flex-none tabular-nums">{formatDuration(track.durationMs)}</span>
          )}
        </div>
        {showAlbum && (
          <p className="text-xs truncate text-text-secondary mt-0.5">{track.albumName}</p>
        )}
      </div>

      {/* Listen button – right side, always visible */}
      <a
        href={`/?url=${encodeURIComponent(track.deezerUrl)}`}
        className="flex-none text-xs px-2.5 py-1 rounded-lg bg-white/[0.06] border border-white/[0.10] text-text-secondary hover:text-text-primary hover:bg-white/[0.10] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/30"
      >
        {t("artist.listen")} →
      </a>
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
    </div>
  );
}

// ─── Similar Artists Section ──────────────────────────────────────────────────

function SimilarArtistsSection({ similarArtists, t }: { similarArtists: string[]; t: (key: string, vars?: Record<string, string>) => string }) {
  const first2 = similarArtists.slice(0, 2);
  return (
    <div>
      <SectionHeading>{t("artist.similarArtists")}</SectionHeading>
      <div className="space-y-5">
        {first2.map((name) => (
          <SimilarArtistTracks key={name} artistName={name} t={t} />
        ))}
      </div>
    </div>
  );
}

function SimilarArtistTracks({ artistName, t }: { artistName: string; t: (key: string, vars?: Record<string, string>) => string }) {
  const [{ isLoading, tracks }, setState] = useState<{ isLoading: boolean; tracks: ArtistTopTrack[] }>({
    isLoading: true,
    tracks: [],
  });

  useEffect(() => {
    let cancelled = false;
    const params = new URLSearchParams({ name: artistName });
    fetch(`/api/artist-info?${params.toString()}`)
      .then((res) => (res.ok ? (res.json() as Promise<ArtistInfoResponse>) : null))
      .then((data) => { if (!cancelled) setState({ isLoading: false, tracks: data?.topTracks ?? [] }); })
      .catch(() => { if (!cancelled) setState({ isLoading: false, tracks: [] }); });
    return () => { cancelled = true; };
  }, [artistName]);

  if (isLoading) {
    return (
      <div className="space-y-2 animate-pulse">
        <div className="h-3 w-1/3 rounded bg-white/[0.08]" />
        {(["a", "b", "c"] as const).map((k) => (
          <div key={k} className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-lg bg-white/[0.08] flex-none" />
            <div className="flex-1 space-y-1.5">
              <div className="h-3 bg-white/[0.08] rounded w-3/4" />
              <div className="h-2.5 bg-white/[0.08] rounded w-1/2" />
            </div>
          </div>
        ))}
      </div>
    );
  }

  if (tracks.length === 0) return null;

  return (
    <div>
      <p className="text-sm font-semibold text-text-primary mb-2">{artistName}</p>
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

// ─── Skeleton ─────────────────────────────────────────────────────────────────

function ArtistInfoSkeleton() {
  return (
    <GlassCard elevated className="w-full rounded-2xl sm:rounded-[36px]">
      <div className="px-6 pt-6 pb-5 animate-pulse">
        {/* Profile skeleton */}
        <div className="flex gap-4">
          <div className="w-14 h-14 rounded-xl bg-white/[0.08] flex-none" />
          <div className="flex-1 space-y-2 pt-1">
            <div className="flex gap-1">
              <div className="h-4 w-12 rounded-full bg-white/[0.08]" />
              <div className="h-4 w-16 rounded-full bg-white/[0.08]" />
            </div>
            <div className="h-1 bg-white/[0.08] rounded-full w-full" />
            <div className="h-3 bg-white/[0.08] rounded w-2/3" />
          </div>
        </div>
        {/* Tracks skeleton */}
        <div className="border-t border-white/[0.06] mt-5 pt-5 space-y-3">
          <div className="h-3 bg-white/[0.08] rounded w-1/3 mb-4" />
          {(["sk-a", "sk-b", "sk-c"] as const).map((k) => (
            <div key={k} className="flex gap-3 items-center">
              <div className="w-10 h-10 rounded-lg bg-white/[0.08] flex-none" />
              <div className="flex-1 space-y-1.5">
                <div className="h-3 bg-white/[0.08] rounded w-4/5" />
                <div className="h-2.5 bg-white/[0.08] rounded w-3/5" />
              </div>
            </div>
          ))}
        </div>
      </div>
    </GlassCard>
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
