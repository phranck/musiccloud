import { ENDPOINTS } from "@musiccloud/shared";
import {
  MagnifyingGlass as MagnifyingGlassIcon,
  MusicNotes as MusicNotesIcon,
  PencilSimple as PencilSimpleIcon,
  PencilSimpleSlash as PencilSimpleSlashIcon,
  SpinnerGap as SpinnerGapIcon,
  Trash as TrashIcon,
  XCircle as XCircleIcon,
} from "@phosphor-icons/react";
import { useMemo, useState } from "react";
import { useNavigate } from "react-router";
import { ContentUnavailableView } from "@/components/ui/ContentUnavailableView";
import { PageHeader } from "@/components/ui/PageHeader";
import { PageBody, PageLayout } from "@/components/ui/PageLayout";
import { type ColumnDef, DataTable } from "@/components/ui/Table";
import { Toolbar } from "@/components/ui/Toolbar";
import { useI18n } from "@/context/I18nContext";
import { useInfiniteAdminTable } from "@/features/music/hooks/useInfiniteAdminTable";
import { InvalidateCacheButton } from "@/features/music/InvalidateCacheButton";
import { Checkbox } from "@/shared/ui/Checkbox";
import { Dialog, dialogBtnDestructive, dialogBtnSecondary } from "@/shared/ui/Dialog";

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

const SHARE_BASE = import.meta.env.VITE_SHARE_BASE_URL ?? "https://musiccloud.io";

function formatDate(ts: number): string {
  return new Date(ts).toLocaleDateString(undefined, { dateStyle: "medium" });
}

export function TracksPage() {
  const navigate = useNavigate();
  const { messages } = useI18n();
  const mt = messages.music.tracks;
  const m = messages.music.table;
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const table = useInfiniteAdminTable<TrackListItem>({
    endpoint: ENDPOINTS.admin.tracks.list,
    deleteEndpoint: ENDPOINTS.admin.tracks.list,
    sseEventType: "track-added",
    sseToItem: (data) => data as unknown as TrackListItem,
  });

  const columns = useMemo<ColumnDef<TrackListItem>[]>(
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
        id: "invalidate-cache",
        className: "w-10",
        cell: (track) => <InvalidateCacheButton shortId={track.shortId} kind="tracks" />,
      },
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
        header: mt.colTitle,
        sortKey: (track) => track.title.toLowerCase(),
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
        header: mt.colArtists,
        sortKey: (track) => track.artists.join(", ").toLowerCase(),
        cell: (track) => <span className="text-sm">{track.artists.join(", ")}</span>,
      },
      {
        id: "source",
        header: mt.colSource,
        className: "w-28",
        sortKey: (track) => track.sourceService ?? "",
        cell: (track) =>
          track.sourceService ? (
            <span className="inline-block px-2 py-0.5 rounded-full text-xs font-medium capitalize whitespace-nowrap bg-[var(--ds-surface-raised)] text-[var(--ds-text-muted)] border border-[var(--ds-border)]">
              {track.sourceService}
            </span>
          ) : null,
      },
      {
        id: "isrc",
        header: "ISRC",
        className: "w-32",
        sortKey: (track) => track.isrc ?? "",
        cell: (track) => <span className="font-mono text-xs text-[var(--ds-text-muted)]">{track.isrc ?? ""}</span>,
      },
      {
        id: "links",
        header: mt.colLinks,
        className: "w-24",
        headerClassName: "w-24 text-right",
        cellClassName: "w-24 text-right",
        sortKey: (track) => track.linkCount,
        cell: (track) => (
          <span className="inline-block min-w-6 px-1.5 py-0.5 rounded text-xs font-medium text-center border border-[var(--ds-border)] text-[var(--ds-text)]">
            {track.linkCount}
          </span>
        ),
      },
      {
        id: "createdAt",
        header: mt.colAdded,
        className: "w-36",
        sortKey: (track) => track.createdAt,
        cell: (track) => (
          <span className="text-sm text-[var(--ds-text-muted)] whitespace-nowrap">{formatDate(track.createdAt)}</span>
        ),
      },
      {
        id: "actions",
        className: "w-36",
        cell: (track) => (
          <div className="flex gap-2 justify-end">
            <button
              type="button"
              onClick={() => navigate(`/tracks/${track.id}`)}
              className="h-7 px-3 flex items-center gap-1.5 border border-[var(--ds-btn-neutral-border)] rounded-control text-[var(--ds-btn-neutral-text)] text-xs hover:border-[var(--ds-btn-neutral-hover-border)] hover:bg-[var(--ds-btn-neutral-hover-bg)] transition-colors"
            >
              <PencilSimpleIcon weight="duotone" className="w-3 h-3" />
              {messages.common.edit}
            </button>
          </div>
        ),
      },
    ],
    [
      mt,
      messages.common,
      navigate,
      table.editMode,
      table.allSelected,
      table.selectedIds,
      table.toggleAll,
      table.toggleRow,
    ],
  );

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
      <input
        type="text"
        value={table.searchInput}
        onChange={(e) => table.setSearchInput(e.target.value)}
        placeholder={mt.searchPlaceholder}
        className="py-1.5 w-52 pl-8 pr-7 border border-[var(--ds-border)] rounded-control text-sm bg-[var(--ds-surface)] text-[var(--ds-text)] placeholder:text-[var(--ds-text-muted)] focus:outline-none focus:border-[var(--color-primary)]"
      />
      <MagnifyingGlassIcon
        weight="duotone"
        className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-[var(--ds-text-muted)]"
      />
      {table.searchInput && (
        <button
          type="button"
          onClick={() => table.setSearchInput("")}
          className="absolute right-2 top-1/2 -translate-y-1/2 text-[var(--ds-text-subtle)] hover:text-[var(--ds-text-muted)]"
        >
          <XCircleIcon weight="duotone" className="w-3.5 h-3.5" />
        </button>
      )}
    </div>
  );

  const toolbarContent = (
    <Toolbar>
      {table.total !== null && (
        <span className="text-sm text-[var(--ds-text-muted)]">
          {table.total} {mt.total}
        </span>
      )}
      <div className="ml-auto flex items-center gap-2">
        {table.editMode && table.selectedCount > 0 && (
          <button
            type="button"
            onClick={() => {
              setDeleteError(null);
              setConfirmOpen(true);
            }}
            className="inline-flex items-center gap-1.5 h-8 px-3 rounded-control text-sm font-medium border border-[var(--ds-btn-danger-border)] text-[var(--ds-btn-danger-text)] hover:bg-[var(--ds-btn-danger-hover-bg)] transition-colors"
          >
            <TrashIcon weight="duotone" className="w-3.5 h-3.5" />
            {m.deleteButton.replace("{count}", String(table.selectedCount))}
          </button>
        )}
        <button
          type="button"
          onClick={table.toggleEditMode}
          className={`inline-flex items-center gap-1.5 h-8 px-3 rounded-control text-sm font-medium border transition-colors ${
            table.editMode
              ? "bg-[var(--ds-btn-primary-bg)] text-white border-[var(--ds-btn-primary-bg)]"
              : "border-[var(--ds-border)] text-[var(--ds-text)] hover:border-[var(--ds-border-strong)]"
          }`}
        >
          {table.editMode ? (
            <PencilSimpleSlashIcon weight="duotone" className="w-3.5 h-3.5" />
          ) : (
            <PencilSimpleIcon weight="duotone" className="w-3.5 h-3.5" />
          )}
          {m.editButton}
        </button>
      </div>
    </Toolbar>
  );

  return (
    <PageLayout>
      <PageHeader title={mt.title}>{searchField}</PageHeader>

      <PageBody>
        {table.isInitialLoading && (
          <div className="space-y-px">
            {Array.from({ length: 8 }, (_, i) => `sk-${i}`).map((key) => (
              <div
                key={key}
                className="h-14 bg-[var(--ds-surface)] animate-pulse border-b border-[var(--ds-border-subtle)]"
              />
            ))}
          </div>
        )}

        {table.isError && <p className="text-sm text-[var(--ds-btn-danger-text)] p-4">{table.errorMessage}</p>}

        {!table.isInitialLoading && !table.isError && table.items.length === 0 && (
          <ContentUnavailableView
            icon={<MusicNotesIcon weight="duotone" aria-hidden />}
            title={mt.noTracks}
            subtitle={table.searchInput ? mt.searchPlaceholder : undefined}
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
              getRowKey={(t) => t.id}
              getRowClassName={(t) =>
                [
                  table.selectedIds.has(t.id) ? "bg-[var(--ds-accent-subtle)]" : "",
                  table.deletingIds.has(t.id) ? "opacity-0 transition-opacity duration-300" : "",
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

      <Dialog open={confirmOpen} title={m.deleteConfirmTitle} onClose={() => setConfirmOpen(false)}>
        <div className="px-6 py-4 space-y-3">
          <p className="text-sm text-[var(--ds-text)]">
            {m.deleteConfirmDescription.replace("{count}", String(table.selectedCount))}
          </p>
          {deleteError && <p className="text-sm text-[var(--ds-btn-danger-text)]">{deleteError}</p>}
        </div>
        <Dialog.Footer>
          <button
            type="button"
            className={dialogBtnSecondary}
            onClick={() => setConfirmOpen(false)}
            disabled={deleting}
          >
            {m.deleteConfirmCancel}
          </button>
          <button type="button" className={dialogBtnDestructive} onClick={handleConfirmDelete} disabled={deleting}>
            {deleting ? "\u2026" : m.deleteConfirmAction}
          </button>
        </Dialog.Footer>
      </Dialog>
    </PageLayout>
  );
}
