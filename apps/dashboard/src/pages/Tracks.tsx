import { Badge } from "@/components/ui/badge";
import { AdminDataTable, type AdminTableConfig } from "@/components/AdminDataTable";

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
}

function formatDate(ts: number): string {
  return new Date(ts).toLocaleDateString(undefined, { dateStyle: "medium" });
}

const config: AdminTableConfig<TrackListItem> = {
  endpoint: "/api/admin/tracks",
  sseEventType: "track-added",
  sseToItem: (data) => data as unknown as TrackListItem,
  searchPlaceholderKey: "tracks.search",
  totalLabelKey: "tracks.total",
  emptyKey: "tracks.empty",
  columns: [
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
      render: (track) => (
        <>
          <div className="font-medium leading-tight">{track.title}</div>
          {track.albumName && (
            <div className="text-xs text-muted-foreground">{track.albumName}</div>
          )}
        </>
      ),
    },
    {
      headerKey: "tracks.artists",
      render: (track) => (
        <span className="text-sm">{track.artists.join(", ")}</span>
      ),
    },
    {
      headerKey: "tracks.source",
      render: (track) =>
        track.sourceService ? (
          <Badge variant="secondary" className="text-xs capitalize">
            {track.sourceService}
          </Badge>
        ) : null,
    },
    {
      headerLabel: "ISRC",
      render: (track) => (
        <span className="font-mono text-xs text-muted-foreground">
          {track.isrc ?? ""}
        </span>
      ),
    },
    {
      headerKey: "tracks.links",
      className: "text-center",
      render: (track) => <Badge variant="outline">{track.linkCount}</Badge>,
    },
    {
      headerKey: "tracks.added",
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
