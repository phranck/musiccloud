import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { AdminDataTable, type AdminTableConfig } from "@/components/AdminDataTable";
import { apiPatch } from "@/lib/api";

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

const SHARE_BASE = import.meta.env.VITE_SHARE_BASE_URL ?? "https://musiccloud.io";

function releaseYear(date: string | null): string {
  if (!date) return "";
  return date.slice(0, 4);
}

function formatDate(ts: number): string {
  return new Date(ts).toLocaleDateString(undefined, { dateStyle: "medium" });
}

function FeaturedToggle({ album }: { album: AlbumListItem }) {
  const [featured, setFeatured] = useState(album.isFeatured);
  const [busy, setBusy] = useState(false);

  if (!album.shortId) return null;

  async function toggle() {
    if (busy || !album.shortId) return;
    const next = !featured;
    setFeatured(next);
    setBusy(true);
    try {
      await apiPatch(`/api/admin/albums/${album.shortId}/featured`, { featured: next });
    } catch {
      setFeatured(!next);
    } finally {
      setBusy(false);
    }
  }

  return (
    <button
      onClick={toggle}
      disabled={busy}
      title={featured ? "Featured entfernen" : "Als Featured markieren"}
      className="p-1 rounded transition-colors hover:bg-muted disabled:opacity-40"
      aria-label={featured ? "Featured entfernen" : "Als Featured markieren"}
    >
      <span className={featured ? "text-yellow-400" : "text-muted-foreground/40"}>
        {featured ? "★" : "☆"}
      </span>
    </button>
  );
}

const config: AdminTableConfig<AlbumListItem> = {
  endpoint: "/api/admin/albums",
  deleteEndpoint: "/api/admin/albums",
  sseEventType: "album-added",
  sseToItem: (data) => data as unknown as AlbumListItem,
  searchPlaceholderKey: "albums.search",
  totalLabelKey: "albums.total",
  emptyKey: "albums.empty",
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
          <div className="h-9 w-9 rounded bg-muted" />
        ),
    },
    {
      headerKey: "albums.title",
      sortKey: "title",
      render: (album) => (
        <>
          {album.shortId ? (
            <a
              href={`${SHARE_BASE}/${album.shortId}`}
              target="_blank"
              rel="noopener noreferrer"
              className="font-medium leading-tight hover:underline"
            >
              {album.title}
            </a>
          ) : (
            <div className="font-medium leading-tight">{album.title}</div>
          )}
          {album.releaseDate && (
            <div className="text-xs text-muted-foreground">
              {releaseYear(album.releaseDate)}
            </div>
          )}
        </>
      ),
    },
    {
      headerKey: "albums.artists",
      sortKey: "artists",
      render: (album) => (
        <span className="text-sm">{album.artists.join(", ")}</span>
      ),
    },
    {
      headerKey: "albums.source",
      sortKey: "source_service",
      render: (album) =>
        album.sourceService ? (
          <Badge variant="secondary" className="text-xs capitalize">
            {album.sourceService}
          </Badge>
        ) : null,
    },
    {
      headerLabel: "UPC",
      sortKey: "upc",
      render: (album) => (
        <span className="font-mono text-xs text-muted-foreground">
          {album.upc ?? ""}
        </span>
      ),
    },
    {
      headerKey: "albums.tracks",
      sortKey: "total_tracks",
      className: "text-center",
      render: (album) => (
        <span className="text-sm text-muted-foreground">
          {album.totalTracks ?? ""}
        </span>
      ),
    },
    {
      headerKey: "albums.links",
      sortKey: "link_count",
      className: "text-center",
      render: (album) => <Badge variant="outline">{album.linkCount}</Badge>,
    },
    {
      headerKey: "albums.added",
      sortKey: "created_at",
      render: (album) => (
        <span className="text-sm text-muted-foreground">
          {formatDate(album.createdAt)}
        </span>
      ),
    },
  ],
};

export function Albums() {
  return <AdminDataTable config={config} />;
}
