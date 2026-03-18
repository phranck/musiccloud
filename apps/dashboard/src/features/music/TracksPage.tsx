import { Star as StarIcon } from "@phosphor-icons/react";
import { useState } from "react";

import { useI18n } from "@/context/I18nContext";
import { AdminDataTable, type AdminTableConfig } from "@/features/music/AdminDataTable";
import { api } from "@/lib/api";

interface TrackListItem {
  id: string;
  title: string;
  artists: string[];
  albumName: string | null;
  isrc: string | null;
  artworkUrl: string | null;
  sourceService: string | null;
  linkCount: number;
  createdAt: number;
  shortId: string | null;
  isFeatured: boolean;
}

const SHARE_BASE = import.meta.env.VITE_SHARE_BASE_URL ?? "https://music.cloud";

function formatDate(ts: number): string {
  return new Date(ts).toLocaleDateString(undefined, { dateStyle: "medium" });
}

function FeaturedToggle({ track }: { track: TrackListItem }) {
  const { messages } = useI18n();
  const m = messages.music.table;
  const [featured, setFeatured] = useState(track.isFeatured);
  const [busy, setBusy] = useState(false);

  if (!track.shortId) return null;

  async function toggle() {
    if (busy || !track.shortId) return;
    const next = !featured;
    setFeatured(next);
    setBusy(true);
    try {
      await api.patch(`/admin/tracks/${track.shortId}/featured`, { featured: next });
    } catch {
      setFeatured(!next);
    } finally {
      setBusy(false);
    }
  }

  return (
    <button
      type="button"
      onClick={toggle}
      disabled={busy}
      title={featured ? m.featuredRemove : m.featuredAdd}
      className="p-1 rounded transition-colors hover:bg-[var(--ds-surface-raised)] disabled:opacity-40"
      aria-label={featured ? m.featuredRemove : m.featuredAdd}
    >
      <StarIcon
        weight={featured ? "fill" : "regular"}
        className={`w-4 h-4 ${featured ? "text-amber-400" : "text-[var(--ds-text-muted)] opacity-40"}`}
      />
    </button>
  );
}

function useTracksConfig(): AdminTableConfig<TrackListItem> {
  const { messages } = useI18n();
  const mt = messages.music.tracks;

  return {
    endpoint: "/admin/tracks",
    deleteEndpoint: "/admin/tracks",
    sseEventType: "track-added",
    sseToItem: (data) => data as unknown as TrackListItem,
    searchPlaceholder: mt.searchPlaceholder,
    totalLabel: mt.total,
    emptyMessage: mt.noTracks,
    columns: [
      {
        className: "w-8",
        render: (track) => <FeaturedToggle track={track} />,
      },
      {
        className: "w-10",
        render: (track) =>
          track.artworkUrl ? (
            <img
              src={track.artworkUrl}
              alt=""
              width={36}
              height={36}
              className="rounded object-cover"
              onError={(e) => {
                e.currentTarget.style.display = "none";
              }}
            />
          ) : (
            <div className="h-9 w-9 rounded bg-[var(--ds-surface-raised)]" />
          ),
      },
      {
        header: mt.colTitle,
        sortKey: "title",
        render: (track) => (
          <>
            {track.shortId ? (
              <a
                href={`${SHARE_BASE}/${track.shortId}`}
                target="_blank"
                rel="noopener noreferrer"
                className="font-medium leading-tight text-[var(--ds-text)] hover:underline"
              >
                {track.title}
              </a>
            ) : (
              <div className="font-medium leading-tight text-[var(--ds-text)]">{track.title}</div>
            )}
            {track.albumName && (
              <div className="text-xs text-[var(--ds-text-muted)]">{track.albumName}</div>
            )}
          </>
        ),
      },
      {
        header: mt.colArtists,
        sortKey: "artists",
        render: (track) => <span className="text-sm">{track.artists.join(", ")}</span>,
      },
      {
        header: mt.colSource,
        sortKey: "source_service",
        render: (track) =>
          track.sourceService ? (
            <span className="inline-block px-2 py-0.5 rounded-full text-xs font-medium capitalize bg-[var(--ds-surface-raised)] text-[var(--ds-text-muted)] border border-[var(--ds-border)]">
              {track.sourceService}
            </span>
          ) : null,
      },
      {
        header: "ISRC",
        sortKey: "isrc",
        render: (track) => (
          <span className="font-mono text-xs text-[var(--ds-text-muted)]">{track.isrc ?? ""}</span>
        ),
      },
      {
        header: mt.colLinks,
        sortKey: "link_count",
        className: "text-center",
        render: (track) => (
          <span className="inline-block min-w-6 px-1.5 py-0.5 rounded text-xs font-medium text-center border border-[var(--ds-border)] text-[var(--ds-text)]">
            {track.linkCount}
          </span>
        ),
      },
      {
        header: mt.colAdded,
        sortKey: "created_at",
        render: (track) => (
          <span className="text-sm text-[var(--ds-text-muted)]">{formatDate(track.createdAt)}</span>
        ),
      },
    ],
  };
}

export function TracksPage() {
  const config = useTracksConfig();
  return <AdminDataTable config={config} />;
}
