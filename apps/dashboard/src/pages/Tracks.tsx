import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { AdminDataTable, type AdminTableConfig } from "@/components/AdminDataTable";
import { apiPatch } from "@/lib/api";

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

const SHARE_BASE = import.meta.env.VITE_SHARE_BASE_URL ?? "https://musiccloud.io";

function formatDate(ts: number): string {
  return new Date(ts).toLocaleDateString(undefined, { dateStyle: "medium" });
}

function FeaturedToggle({ track }: { track: TrackListItem }) {
  const [featured, setFeatured] = useState(track.isFeatured);
  const [busy, setBusy] = useState(false);

  if (!track.shortId) return null;

  async function toggle() {
    if (busy || !track.shortId) return;
    setBusy(true);
    try {
      await apiPatch(`/api/admin/tracks/${track.shortId}/featured`, { featured: !featured });
      setFeatured((v) => !v);
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

const config: AdminTableConfig<TrackListItem> = {
  endpoint: "/api/admin/tracks",
  deleteEndpoint: "/api/admin/tracks",
  sseEventType: "track-added",
  sseToItem: (data) => data as unknown as TrackListItem,
  searchPlaceholderKey: "tracks.search",
  totalLabelKey: "tracks.total",
  emptyKey: "tracks.empty",
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
          <div className="h-9 w-9 rounded bg-muted" />
        ),
    },
    {
      headerKey: "tracks.title",
      sortKey: "title",
      render: (track) => (
        <>
          {track.shortId ? (
            <a
              href={`${SHARE_BASE}/${track.shortId}`}
              target="_blank"
              rel="noopener noreferrer"
              className="font-medium leading-tight hover:underline"
            >
              {track.title}
            </a>
          ) : (
            <div className="font-medium leading-tight">{track.title}</div>
          )}
          {track.albumName && (
            <div className="text-xs text-muted-foreground">{track.albumName}</div>
          )}
        </>
      ),
    },
    {
      headerKey: "tracks.artists",
      sortKey: "artists",
      render: (track) => (
        <span className="text-sm">{track.artists.join(", ")}</span>
      ),
    },
    {
      headerKey: "tracks.source",
      sortKey: "source_service",
      render: (track) =>
        track.sourceService ? (
          <Badge variant="secondary" className="text-xs capitalize">
            {track.sourceService}
          </Badge>
        ) : null,
    },
    {
      headerLabel: "ISRC",
      sortKey: "isrc",
      render: (track) => (
        <span className="font-mono text-xs text-muted-foreground">
          {track.isrc ?? ""}
        </span>
      ),
    },
    {
      headerKey: "tracks.links",
      sortKey: "link_count",
      className: "text-center",
      render: (track) => <Badge variant="outline">{track.linkCount}</Badge>,
    },
    {
      headerKey: "tracks.added",
      sortKey: "created_at",
      render: (track) => (
        <span className="text-sm text-muted-foreground">
          {formatDate(track.createdAt)}
        </span>
      ),
    },
  ],
};

export function Tracks() {
  return <AdminDataTable config={config} />;
}
