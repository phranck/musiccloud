import {
  DashboardActionButton,
  DashboardActionId,
  DashboardActionStatus,
  DashboardButton,
  DashboardButtonVariant,
  DashboardInput,
} from "@musiccloud/dashboard-ui";
import { type AdminArtistListItem, ENDPOINTS } from "@musiccloud/shared";
import {
  MagnifyingGlass as MagnifyingGlassIcon,
  MicrophoneStage as MicrophoneStageIcon,
  PencilSimple as PencilSimpleIcon,
  PencilSimpleSlash as PencilSimpleSlashIcon,
  SpinnerGap as SpinnerGapIcon,
  Trash as TrashIcon,
  XCircle as XCircleIcon,
} from "@phosphor-icons/react";
import { useMemo, useState } from "react";
import { ContentLoadingView } from "@/components/ui/ContentLoadingView";
import { ContentUnavailableView } from "@/components/ui/ContentUnavailableView";
import { PageHeader } from "@/components/ui/PageHeader";
import { PageBody, PageLayout } from "@/components/ui/PageLayout";
import { type ColumnDef, DataTable } from "@/components/ui/Table";
import { Toolbar } from "@/components/ui/Toolbar";
import { dashboardCopy } from "@/copy/dashboard";
import { ArtistProfileCacheStatus } from "@/features/music/ArtistProfileCacheStatus";
import { useInfiniteAdminTable } from "@/features/music/hooks/useInfiniteAdminTable";
import { RefreshArtistProfileButton } from "@/features/music/RefreshArtistProfileButton";
import { ReResolveArtistButton } from "@/features/music/ReResolveArtistButton";
import { formatEnglishDate } from "@/lib/format";
import { Checkbox } from "@/shared/ui/Checkbox";
import { Dialog } from "@/shared/ui/Dialog";

const SHARE_BASE = import.meta.env.VITE_SHARE_BASE_URL ?? "https://musiccloud.io";

function formatDate(ts: number): string {
  return formatEnglishDate(ts, { dateStyle: "medium" });
}

type ArtistTable = ReturnType<typeof useInfiniteAdminTable<AdminArtistListItem>>;
type ArtistMessages = (typeof dashboardCopy)["music"]["artists"];
type MusicColumnMessages = (typeof dashboardCopy)["music"]["columns"];

function useArtistColumns(
  table: ArtistTable,
  ma: ArtistMessages,
  mc: MusicColumnMessages,
): ColumnDef<AdminArtistListItem>[] {
  return useMemo<ColumnDef<AdminArtistListItem>[]>(
    () => [
      ...(table.editMode
        ? [
            {
              id: "select",
              className: "w-10",
              header: <Checkbox checked={table.allSelected} onChange={table.toggleAll} />,
              cell: (artist: AdminArtistListItem) => (
                <Checkbox checked={table.selectedIds.has(artist.id)} onChange={() => table.toggleRow(artist.id)} />
              ),
            } satisfies ColumnDef<AdminArtistListItem>,
          ]
        : []),
      {
        id: "image",
        className: "w-16",
        cell: (artist) =>
          artist.imageUrl ? (
            <img
              src={artist.imageUrl}
              alt=""
              width={48}
              height={48}
              className="rounded-full object-cover"
              onError={(e) => {
                e.currentTarget.style.display = "none";
              }}
            />
          ) : (
            <div className="h-12 w-12 rounded-full bg-[var(--ds-surface-raised)]" />
          ),
      },
      {
        id: "name",
        header: ma.colName,
        sortKey: (artist) => artist.name.toLowerCase(),
        cell: (artist) =>
          artist.shortId ? (
            <a
              href={`${SHARE_BASE}/${artist.shortId}`}
              target="_blank"
              rel="noopener noreferrer"
              className="font-medium leading-tight text-[var(--ds-text)] hover:underline"
            >
              {artist.name}
            </a>
          ) : (
            <div className="font-medium leading-tight text-[var(--ds-text)]">{artist.name}</div>
          ),
      },
      {
        id: "genres",
        header: ma.colGenres,
        sortKey: (artist) => artist.genres.join(", ").toLowerCase(),
        cell: (artist) => (
          <div className="flex flex-wrap gap-1">
            {artist.genres.slice(0, 3).map((genre) => (
              <span
                key={genre}
                className="inline-block px-2 py-0.5 rounded-full text-xs font-medium capitalize whitespace-nowrap bg-[var(--ds-surface-raised)] text-[var(--ds-text-muted)] border border-[var(--ds-border)]"
              >
                {genre}
              </span>
            ))}
            {artist.genres.length > 3 && (
              <span className="text-xs text-[var(--ds-text-muted)]">+{artist.genres.length - 3}</span>
            )}
          </div>
        ),
      },
      {
        id: "source",
        header: mc.source,
        className: "w-28",
        sortKey: (artist) => artist.sourceService ?? "",
        cell: (artist) =>
          artist.sourceService ? (
            <span className="inline-block px-2 py-0.5 rounded-full text-xs font-medium capitalize whitespace-nowrap bg-[var(--ds-surface-raised)] text-[var(--ds-text-muted)] border border-[var(--ds-border)]">
              {artist.sourceService}
            </span>
          ) : null,
      },
      {
        id: "links",
        header: mc.links,
        className: "w-24",
        headerClassName: "w-24 text-right",
        cellClassName: "w-24 text-right",
        sortKey: (artist) => artist.linkCount,
        cell: (artist) => (
          <span className="inline-block min-w-6 px-1.5 py-0.5 rounded text-xs font-medium text-center border border-[var(--ds-border)] text-[var(--ds-text)]">
            {artist.linkCount}
          </span>
        ),
      },
      {
        id: "profileCache",
        header: ma.colProfileCache,
        cell: (artist) => <ArtistProfileCacheStatus status={artist.profileCache} />,
      },
      {
        id: "createdAt",
        header: mc.added,
        className: "w-36",
        sortKey: (artist) => artist.createdAt,
        cell: (artist) => (
          <span className="text-sm text-[var(--ds-text-muted)] whitespace-nowrap">{formatDate(artist.createdAt)}</span>
        ),
      },
      {
        id: "actions",
        cell: (artist) => (
          <div className="flex flex-wrap gap-2 justify-end">
            <ReResolveArtistButton shortId={artist.shortId} />
            <RefreshArtistProfileButton
              artistEntityId={artist.artistEntityId}
              refreshSilently={table.refreshSilently}
            />
          </div>
        ),
      },
    ],
    [
      ma,
      mc,
      table.editMode,
      table.allSelected,
      table.selectedIds,
      table.toggleAll,
      table.toggleRow,
      table.refreshSilently,
    ],
  );
}

export function ArtistsPage() {
  const messages = dashboardCopy;
  const ma = messages.music.artists;
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const table = useInfiniteAdminTable<AdminArtistListItem>({
    endpoint: ENDPOINTS.admin.artists.list,
    deleteEndpoint: ENDPOINTS.admin.artists.list,
    sseEventType: "artist-added",
    sseToItem: (data) => data as unknown as AdminArtistListItem,
  });

  const columns = useArtistColumns(table, ma, messages.music.columns);

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

  const searchField = (
    <div className="relative">
      <DashboardInput
        type="text"
        value={table.searchInput}
        onChange={(e) => table.setSearchInput(e.target.value)}
        placeholder={ma.searchPlaceholder}
        className="w-52 pl-8 pr-7"
      />
      <MagnifyingGlassIcon
        weight="duotone"
        className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-[var(--ds-text-muted)]"
      />
      {table.searchInput && (
        <DashboardActionButton
          action={DashboardActionId.Close}
          icon={<XCircleIcon weight="duotone" className="size-3.5" />}
          iconOnly
          label={messages.common.close}
          onClick={() => table.setSearchInput("")}
          className="absolute right-1 top-1/2 -translate-y-1/2"
          size="action"
          type="button"
        />
      )}
    </div>
  );

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
            label={ma.deleteButton.replace("{count}", String(table.selectedCount))}
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
      <PageHeader title={ma.title}>{searchField}</PageHeader>

      <PageBody>
        {table.isInitialLoading && <ContentLoadingView className="flex-1 min-h-0" />}

        {table.isError && <p className="text-sm text-[var(--ds-danger-text)] p-4">{table.errorMessage}</p>}

        {!table.isInitialLoading && !table.isError && table.items.length === 0 && (
          <ContentUnavailableView
            icon={<MicrophoneStageIcon weight="duotone" aria-hidden />}
            title={ma.noArtists}
            subtitle={table.searchInput ? ma.searchPlaceholder : undefined}
            className="flex-1 min-h-0"
          />
        )}

        {!table.isInitialLoading && !table.isError && table.items.length > 0 && (
          <div
            ref={table.scrollContainerRef}
            className={`-mx-3 -mt-3 min-h-0 flex-1 overflow-y-auto transition-opacity duration-200 ${
              table.isRefreshing ? "opacity-50" : "opacity-100"
            }`}
          >
            <DataTable
              columns={columns}
              data={table.items}
              getRowKey={(a) => a.id}
              getRowClassName={(a) =>
                [
                  table.selectedIds.has(a.id) ? "bg-[var(--ds-accent-subtle)]" : "",
                  table.deletingIds.has(a.id) ? "opacity-0 transition-opacity duration-300" : "",
                ]
                  .filter(Boolean)
                  .join(" ")
              }
              stickyHeader
              defaultSort={{ id: "createdAt", dir: "desc" }}
            />
            <div ref={table.sentinelRef} className="h-px" />
            {table.isLoadingMore && (
              <div className="flex justify-center py-4">
                <SpinnerGapIcon className="w-5 h-5 animate-spin text-[var(--ds-text-muted)]" />
              </div>
            )}
          </div>
        )}
      </PageBody>

      {toolbarContent}

      <Dialog open={confirmOpen} title={ma.deleteConfirmTitle} onClose={() => setConfirmOpen(false)}>
        <div className="px-6 py-4 space-y-3">
          <p className="text-sm text-[var(--ds-text)]">
            {ma.deleteConfirmDescription.replace("{count}", String(table.selectedCount))}
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
            label={ma.deleteConfirmAction}
            onClick={handleConfirmDelete}
            status={deleting ? DashboardActionStatus.Busy : DashboardActionStatus.Idle}
            type="button"
          />
        </Dialog.Footer>
      </Dialog>
    </PageLayout>
  );
}
