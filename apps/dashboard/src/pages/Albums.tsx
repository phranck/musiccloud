import { Badge } from "@/components/ui/badge";
import { AdminDataTable, type AdminTableConfig } from "@/components/AdminDataTable";

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
}

function releaseYear(date: string | null): string {
  if (!date) return "";
  return date.slice(0, 4);
}

function formatDate(ts: number): string {
  return new Date(ts).toLocaleDateString(undefined, { dateStyle: "medium" });
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
      render: (album) => (
        <>
          <div className="font-medium leading-tight">{album.title}</div>
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
      render: (album) => (
        <span className="text-sm">{album.artists.join(", ")}</span>
      ),
    },
    {
      headerKey: "albums.source",
      render: (album) =>
        album.sourceService ? (
          <Badge variant="secondary" className="text-xs capitalize">
            {album.sourceService}
          </Badge>
        ) : null,
    },
    {
      headerLabel: "UPC",
      render: (album) => (
        <span className="font-mono text-xs text-muted-foreground">
          {album.upc ?? ""}
        </span>
      ),
    },
    {
      headerKey: "albums.tracks",
      className: "text-center",
      render: (album) => (
        <span className="text-sm text-muted-foreground">
          {album.totalTracks ?? ""}
        </span>
      ),
    },
    {
      headerKey: "albums.links",
      className: "text-center",
      render: (album) => <Badge variant="outline">{album.linkCount}</Badge>,
    },
    {
      headerKey: "albums.added",
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
