import type { ColumnDef } from "@musiccloud/dashboard-ui";
import {
  DashboardActionButton,
  DashboardActionId,
  DashboardActionStatus,
  DashboardButton,
  DashboardButtonVariant,
} from "@musiccloud/dashboard-ui";
import { AdminEventType, ENDPOINTS } from "@musiccloud/shared";
import {
  Disc as DiscIcon,
  PencilSimple as PencilSimpleIcon,
  PencilSimpleSlash as PencilSimpleSlashIcon,
  Trash as TrashIcon,
} from "@phosphor-icons/react";
import { useMemo, useState } from "react";
import { ContentUnavailableView } from "@/components/ui/ContentUnavailableView";
import { PageHeader } from "@/components/ui/PageHeader";
import { PageBody, PageLayout } from "@/components/ui/PageLayout";
import { Toolbar } from "@/components/ui/Toolbar";
import { dashboardCopy } from "@/copy/dashboard";
import { AdminListSearchField } from "@/features/music/AdminListSearchField";
import { useInfiniteAdminTable } from "@/features/music/hooks/useInfiniteAdminTable";
import { InfiniteAdminTable } from "@/features/music/InfiniteAdminTable";
import { formatEnglishDate } from "@/lib/format";
import { SHARE_BASE } from "@/lib/shareBase";
import { Checkbox } from "@/shared/ui/Checkbox";
import { Dialog } from "@/shared/ui/Dialog";

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
}

function releaseYear(date: string | null): string {
  if (!date) return "";
  return date.slice(0, 4);
}

function formatDate(ts: number): string {
  return formatEnglishDate(ts, { dateStyle: "medium" });
}

type AlbumTable = ReturnType<typeof useInfiniteAdminTable<AlbumListItem>>;
type AlbumMessages = (typeof dashboardCopy)["music"]["albums"];
type MusicColumnMessages = (typeof dashboardCopy)["music"]["columns"];

function useAlbumColumns(table: AlbumTable, ma: AlbumMessages, mc: MusicColumnMessages): ColumnDef<AlbumListItem>[] {
  return useMemo<ColumnDef<AlbumListItem>[]>(
    () => [
      ...(table.editMode
        ? [
            {
              id: "select",
              className: "w-10",
              header: <Checkbox checked={table.allSelected} onChange={table.toggleAll} />,
              cell: (album: AlbumListItem) => (
                <Checkbox checked={table.selectedIds.has(album.id)} onChange={() => table.toggleRow(album.id)} />
              ),
            } satisfies ColumnDef<AlbumListItem>,
          ]
        : []),
      {
        id: "artwork",
        className: "w-16",
        cell: (album) =>
          album.artworkUrl ? (
            <img
              src={album.artworkUrl}
              alt=""
              width={48}
              height={48}
              className="rounded object-cover"
              onError={(e) => {
                e.currentTarget.style.display = "none";
              }}
            />
          ) : (
            <div className="h-12 w-12 rounded bg-[var(--ds-surface-raised)]" />
          ),
      },
      {
        id: "title",
        header: mc.title,
        serverSort: "title",
        cell: (album) => (
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
        id: "artists",
        header: mc.artists,
        cell: (album) => <span className="text-sm">{album.artists.join(", ")}</span>,
      },
      {
        id: "source",
        header: mc.source,
        className: "w-28",
        cell: (album) =>
          album.sourceService ? (
            <span className="inline-block px-2 py-0.5 rounded-full text-xs font-medium capitalize whitespace-nowrap bg-[var(--ds-surface-raised)] text-[var(--ds-text-muted)] border border-[var(--ds-border)]">
              {album.sourceService}
            </span>
          ) : null,
      },
      {
        id: "upc",
        header: "UPC",
        className: "w-32",
        cell: (album) => <span className="font-mono text-xs text-[var(--ds-text-muted)]">{album.upc ?? ""}</span>,
      },
      {
        id: "totalTracks",
        header: ma.colTracks,
        className: "w-24",
        headerClassName: "w-24 text-right",
        cellClassName: "w-24 text-right",
        cell: (album) => <span className="text-sm text-[var(--ds-text-muted)]">{album.totalTracks ?? ""}</span>,
      },
      {
        id: "links",
        header: mc.links,
        className: "w-24",
        headerClassName: "w-24 text-right",
        cellClassName: "w-24 text-right",
        cell: (album) => (
          <span className="inline-block min-w-6 px-1.5 py-0.5 rounded text-xs font-medium text-center border border-[var(--ds-border)] text-[var(--ds-text)]">
            {album.linkCount}
          </span>
        ),
      },
      {
        id: "createdAt",
        header: mc.added,
        className: "w-36",
        serverSort: "created_at",
        cell: (album) => (
          <span className="text-sm text-[var(--ds-text-muted)] whitespace-nowrap">{formatDate(album.createdAt)}</span>
        ),
      },
    ],
    [ma, mc, table.editMode, table.allSelected, table.selectedIds, table.toggleAll, table.toggleRow],
  );
}

export function AlbumsPage() {
  const messages = dashboardCopy;
  const ma = messages.music.albums;
  const m = messages.music.table;
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const table = useInfiniteAdminTable<AlbumListItem>({
    endpoint: ENDPOINTS.admin.albums.list,
    deleteEndpoint: ENDPOINTS.admin.albums.list,
    deletedEventType: AdminEventType.AlbumsDeleted,
  });

  const columns = useAlbumColumns(table, ma, messages.music.columns);

  async function handleConfirmDelete() {
    setDeleting(true);
    setDeleteError(null);
    try {
      await table.deleteSelected();
      setConfirmOpen(false);
    } catch (err) {
      setDeleteError(err instanceof Error ? err.message : "Delete failed");
    } finally {
      setDeleting(false);
    }
  }

  const toolbarContent = (
    <Toolbar>
      {table.total !== null && (
        <span className="text-sm text-[var(--ds-text-muted)]">
          {table.total} {ma.total}
        </span>
      )}
      <div className="ml-auto flex items-center gap-2">
        {table.editMode && table.selectedCount > 0 && (
          <DashboardActionButton
            action={DashboardActionId.Delete}
            icon={<TrashIcon weight="duotone" className="size-3.5" />}
            label={m.deleteButton.replace("{count}", String(table.selectedCount))}
            onClick={() => {
              setDeleteError(null);
              setConfirmOpen(true);
            }}
            size="action"
            type="button"
          />
        )}
        <DashboardButton
          type="button"
          onClick={table.toggleEditMode}
          leadingIcon={
            table.editMode ? (
              <PencilSimpleSlashIcon weight="duotone" className="size-3.5" />
            ) : (
              <PencilSimpleIcon weight="duotone" className="size-3.5" />
            )
          }
          size="action"
          variant={table.editMode ? DashboardButtonVariant.Primary : DashboardButtonVariant.Neutral}
        >
          {messages.common.edit}
        </DashboardButton>
      </div>
    </Toolbar>
  );

  return (
    <PageLayout>
      <PageHeader title={ma.title}>
        <AdminListSearchField
          value={table.searchInput}
          onChange={table.setSearchInput}
          placeholder={ma.searchPlaceholder}
        />
      </PageHeader>

      <PageBody>
        <InfiniteAdminTable table={table} columns={columns}>
          <InfiniteAdminTable.Empty>
            <ContentUnavailableView
              icon={<DiscIcon weight="duotone" aria-hidden />}
              title={ma.noAlbums}
              subtitle={table.searchInput ? ma.searchPlaceholder : undefined}
              className="flex-1 min-h-0"
            />
          </InfiniteAdminTable.Empty>
        </InfiniteAdminTable>
      </PageBody>

      {toolbarContent}

      <Dialog open={confirmOpen} title={m.deleteConfirmTitle} onClose={() => setConfirmOpen(false)}>
        <div className="px-6 py-4 space-y-3">
          <p className="text-sm text-[var(--ds-text)]">
            {m.deleteConfirmDescription.replace("{count}", String(table.selectedCount))}
          </p>
          {deleteError && <p className="text-sm text-[var(--ds-danger-text)]">{deleteError}</p>}
        </div>
        <Dialog.Footer>
          <DashboardActionButton
            action={DashboardActionId.Cancel}
            disabled={deleting}
            icon={false}
            label={messages.common.cancel}
            onClick={() => setConfirmOpen(false)}
            type="button"
            variant={DashboardButtonVariant.Neutral}
          />
          <DashboardActionButton
            action={DashboardActionId.Delete}
            busyLabel="\u2026"
            icon={false}
            label={messages.common.delete}
            onClick={handleConfirmDelete}
            status={deleting ? DashboardActionStatus.Busy : DashboardActionStatus.Idle}
            type="button"
          />
        </Dialog.Footer>
      </Dialog>
    </PageLayout>
  );
}
