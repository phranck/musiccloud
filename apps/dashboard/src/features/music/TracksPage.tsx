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
  MusicNotes as MusicNotesIcon,
  PencilSimple as PencilSimpleIcon,
  PencilSimpleSlash as PencilSimpleSlashIcon,
  Trash as TrashIcon,
} from "@phosphor-icons/react";
import { useMemo, useState } from "react";
import { useNavigate } from "react-router";
import { ContentUnavailableView } from "@/components/ui/ContentUnavailableView";
import { PageHeader } from "@/components/ui/PageHeader";
import { PageBody, PageLayout } from "@/components/ui/PageLayout";
import { TableActionButton } from "@/components/ui/TableActionButton";
import { Toolbar } from "@/components/ui/Toolbar";
import { dashboardCopy } from "@/copy/dashboard";
import { AdminListSearchField } from "@/features/music/AdminListSearchField";
import { useInfiniteAdminTable } from "@/features/music/hooks/useInfiniteAdminTable";
import { InfiniteAdminTable } from "@/features/music/InfiniteAdminTable";
import { linkCountColumn } from "@/features/music/linkCountColumn";
import { formatEnglishDate } from "@/lib/format";
import { SHARE_BASE } from "@/lib/shareBase";
import { Checkbox } from "@/shared/ui/Checkbox";
import { Dialog } from "@/shared/ui/Dialog";

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
}

function formatDate(ts: number): string {
  return formatEnglishDate(ts, { dateStyle: "medium" });
}

type TrackTable = ReturnType<typeof useInfiniteAdminTable<TrackListItem>>;
type MusicColumnMessages = (typeof dashboardCopy)["music"]["columns"];
type CommonMessages = (typeof dashboardCopy)["common"];

function useTrackColumns(
  table: TrackTable,
  mc: MusicColumnMessages,
  common: CommonMessages,
  navigate: ReturnType<typeof useNavigate>,
): ColumnDef<TrackListItem>[] {
  return useMemo<ColumnDef<TrackListItem>[]>(
    () => [
      ...(table.editMode
        ? [
            {
              id: "select",
              className: "w-10",
              header: <Checkbox checked={table.allSelected} onChange={table.toggleAll} />,
              cell: (track: TrackListItem) => (
                <Checkbox checked={table.selectedIds.has(track.id)} onChange={() => table.toggleRow(track.id)} />
              ),
            } satisfies ColumnDef<TrackListItem>,
          ]
        : []),
      {
        id: "artwork",
        className: "w-16",
        cell: (track) =>
          track.artworkUrl ? (
            <img
              src={track.artworkUrl}
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
        cell: (track) => (
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
            {track.albumName && <div className="text-xs text-[var(--ds-text-muted)]">{track.albumName}</div>}
          </>
        ),
      },
      {
        id: "artists",
        header: mc.artists,
        cell: (track) => <span className="text-sm">{track.artists.join(", ")}</span>,
      },
      {
        id: "source",
        secondary: true,
        header: mc.source,
        className: "w-28",
        cell: (track) =>
          track.sourceService ? (
            <span className="inline-block px-2 py-0.5 rounded-full text-xs font-medium capitalize whitespace-nowrap bg-[var(--ds-surface-raised)] text-[var(--ds-text-muted)] border border-[var(--ds-border)]">
              {track.sourceService}
            </span>
          ) : null,
      },
      {
        id: "isrc",
        secondary: true,
        header: "ISRC",
        className: "w-32",
        cell: (track) => <span className="font-mono text-xs text-[var(--ds-text-muted)]">{track.isrc ?? ""}</span>,
      },
      linkCountColumn<TrackListItem>(mc.links),
      {
        id: "createdAt",
        header: mc.added,
        className: "w-36",
        serverSort: "created_at",
        cell: (track) => (
          <span className="text-sm text-[var(--ds-text-muted)] whitespace-nowrap">{formatDate(track.createdAt)}</span>
        ),
      },
      {
        id: "actions",
        className: "w-36",
        cell: (track) => (
          <div className="flex gap-2 justify-end">
            <TableActionButton
              onClick={() => navigate(`/tracks/${track.id}`)}
              icon={<PencilSimpleIcon weight="duotone" className="size-3" />}
              label={common.edit}
            />
          </div>
        ),
      },
    ],
    [mc, common, navigate, table.editMode, table.allSelected, table.selectedIds, table.toggleAll, table.toggleRow],
  );
}

export function TracksPage() {
  const navigate = useNavigate();
  const messages = dashboardCopy;
  const mt = messages.music.tracks;
  const m = messages.music.table;
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const table = useInfiniteAdminTable<TrackListItem>({
    endpoint: ENDPOINTS.admin.tracks.list,
    deleteEndpoint: ENDPOINTS.admin.tracks.list,
    deletedEventType: AdminEventType.TracksDeleted,
  });

  const columns = useTrackColumns(table, messages.music.columns, messages.common, navigate);

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
          {table.total} {mt.total}
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
      <PageHeader title={mt.title}>
        <AdminListSearchField
          value={table.searchInput}
          onChange={table.setSearchInput}
          placeholder={mt.searchPlaceholder}
        />
      </PageHeader>

      <PageBody>
        <InfiniteAdminTable table={table} columns={columns}>
          <InfiniteAdminTable.Empty>
            <ContentUnavailableView
              icon={<MusicNotesIcon weight="duotone" aria-hidden />}
              title={mt.noTracks}
              subtitle={table.searchInput ? mt.searchPlaceholder : undefined}
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
