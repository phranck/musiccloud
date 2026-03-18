import { Star as StarIcon } from "@phosphor-icons/react";
import { useState } from "react";

import { useI18n } from "@/context/I18nContext";
import { AdminDataTable, type AdminTableConfig } from "@/features/music/AdminDataTable";
import { api } from "@/lib/api";

interface AlbumListItem {
  id: string;
  title: string;
  artists: string[];
  releaseDate: string | null;
  totalTracks: number | null;
  artworkUrl: string | null;
  upc: string | null;
  sourceService: string | null;
  linkCount: number;
  createdAt: number;
  shortId: string | null;
  isFeatured: boolean;
}

const SHARE_BASE = import.meta.env.VITE_SHARE_BASE_URL ?? "https://music.cloud";

function releaseYear(date: string | null): string {
  if (!date) return "";
  return date.slice(0, 4);
}

function formatDate(ts: number): string {
  return new Date(ts).toLocaleDateString(undefined, { dateStyle: "medium" });
}

function FeaturedToggle({ album }: { album: AlbumListItem }) {
  const { messages } = useI18n();
  const m = messages.music.table;
  const [featured, setFeatured] = useState(album.isFeatured);
  const [busy, setBusy] = useState(false);

  if (!album.shortId) return null;

  async function toggle() {
    if (busy || !album.shortId) return;
    const next = !featured;
    setFeatured(next);
    setBusy(true);
    try {
      await api.patch(`/admin/albums/${album.shortId}/featured`, { featured: next });
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

function useAlbumsConfig(): AdminTableConfig<AlbumListItem> {
  const { messages } = useI18n();
  const ma = messages.music.albums;

  return {
    endpoint: "/admin/albums",
    deleteEndpoint: "/admin/albums",
    sseEventType: "album-added",
    sseToItem: (data) => data as unknown as AlbumListItem,
    searchPlaceholder: ma.searchPlaceholder,
    totalLabel: ma.total,
    emptyMessage: ma.noAlbums,
    columns: [
      {
        className: "w-8",
        render: (album) => <FeaturedToggle album={album} />,
      },
      {
        className: "w-10",
        render: (album) =>
          album.artworkUrl ? (
            <img
              src={album.artworkUrl}
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
        header: ma.colTitle,
        sortKey: "title",
        render: (album) => (
          <>
            {album.shortId ? (
              <a
                href={`${SHARE_BASE}/${album.shortId}`}
                target="_blank"
                rel="noopener noreferrer"
                className="font-medium leading-tight text-[var(--ds-text)] hover:underline"
              >
                {album.title}
              </a>
            ) : (
              <div className="font-medium leading-tight text-[var(--ds-text)]">{album.title}</div>
            )}
            {album.releaseDate && (
              <div className="text-xs text-[var(--ds-text-muted)]">{releaseYear(album.releaseDate)}</div>
            )}
          </>
        ),
      },
      {
        header: ma.colArtists,
        sortKey: "artists",
        render: (album) => <span className="text-sm">{album.artists.join(", ")}</span>,
      },
      {
        header: ma.colSource,
        sortKey: "source_service",
        render: (album) =>
          album.sourceService ? (
            <span className="inline-block px-2 py-0.5 rounded-full text-xs font-medium capitalize bg-[var(--ds-surface-raised)] text-[var(--ds-text-muted)] border border-[var(--ds-border)]">
              {album.sourceService}
            </span>
          ) : null,
      },
      {
        header: "UPC",
        sortKey: "upc",
        render: (album) => (
          <span className="font-mono text-xs text-[var(--ds-text-muted)]">{album.upc ?? ""}</span>
        ),
      },
      {
        header: ma.colTracks,
        sortKey: "total_tracks",
        className: "text-center",
        render: (album) => (
          <span className="text-sm text-[var(--ds-text-muted)]">{album.totalTracks ?? ""}</span>
        ),
      },
      {
        header: ma.colLinks,
        sortKey: "link_count",
        className: "text-center",
        render: (album) => (
          <span className="inline-block min-w-6 px-1.5 py-0.5 rounded text-xs font-medium text-center border border-[var(--ds-border)] text-[var(--ds-text)]">
            {album.linkCount}
          </span>
        ),
      },
      {
        header: ma.colAdded,
        sortKey: "created_at",
        render: (album) => (
          <span className="text-sm text-[var(--ds-text-muted)]">{formatDate(album.createdAt)}</span>
        ),
      },
    ],
  };
}

export function AlbumsPage() {
  const config = useAlbumsConfig();
  return <AdminDataTable config={config} />;
}
