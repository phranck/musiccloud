import type { ColumnDef } from "@musiccloud/dashboard-ui";
import { type AdminArtistEntityListItem, ENDPOINTS } from "@musiccloud/shared";
import { IdentificationCard as IdentificationCardIcon } from "@phosphor-icons/react";
import { useMemo } from "react";
import { Link } from "react-router";

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

type ArtistEntityMessages = (typeof dashboardCopy)["music"]["artistEntities"];
type MusicColumnMessages = (typeof dashboardCopy)["music"]["columns"];

/** The classes of a right-aligned count column, header and cells alike, wide enough for its heading on one line. */
const COUNT_COLUMN_CLASS = "w-28 text-right tabular-nums";

function useArtistEntityColumns(
  me: ArtistEntityMessages,
  mc: MusicColumnMessages,
): ColumnDef<AdminArtistEntityListItem>[] {
  return useMemo<ColumnDef<AdminArtistEntityListItem>[]>(
    () => [
      {
        id: "name",
        header: me.colName,
        serverSort: "name",
        cell: (entity) => (
          <Link
            to={`/artist-entities/${encodeURIComponent(entity.id)}`}
            className="block truncate font-medium leading-tight text-[var(--ds-text)] hover:underline"
          >
            {entity.name}
          </Link>
        ),
      },
      {
        id: "entityType",
        header: me.colType,
        className: "w-28",
        serverSort: "entity_type",
        cell: (entity) => <span className="text-sm">{me.types[entity.entityType]}</span>,
      },
      {
        id: "verificationStatus",
        header: me.colStatus,
        className: "w-28",
        serverSort: "verification_status",
        cell: (entity) => <span className="text-sm">{me.statuses[entity.verificationStatus]}</span>,
      },
      {
        id: "trackCredits",
        header: me.colTrackCredits,
        className: COUNT_COLUMN_CLASS,
        cell: (entity) => <span className="text-sm">{entity.trackCreditCount}</span>,
      },
      {
        id: "albumCredits",
        header: me.colAlbumCredits,
        className: COUNT_COLUMN_CLASS,
        cell: (entity) => <span className="text-sm">{entity.albumCreditCount}</span>,
      },
      {
        id: "artistPage",
        header: me.colArtistPage,
        className: "w-36",
        cell: (entity) =>
          entity.shortId ? (
            <a
              href={`${SHARE_BASE}/${entity.shortId}`}
              target="_blank"
              rel="noopener noreferrer"
              className="block truncate text-sm text-[var(--ds-text)] hover:underline"
            >
              {entity.shortId}
            </a>
          ) : (
            <span className="text-sm text-[var(--ds-text-muted)]">{me.artistPageNone}</span>
          ),
      },
      {
        id: "createdAt",
        header: mc.added,
        className: "w-36",
        serverSort: "created_at",
        cell: (entity) => (
          <span className="text-sm text-[var(--ds-text-muted)] whitespace-nowrap">
            {formatEnglishDate(entity.createdAt, { dateStyle: "medium" })}
          </span>
        ),
      },
    ],
    [me, mc],
  );
}

/**
 * Lists the artist entities, the identity layer below the artist pages: every
 * person, group or persona the catalog has met in a credit or a membership.
 *
 * It is a paged, searchable and sortable list like the tracks, albums and
 * artist profiles. An entity is never deleted here, because track and album
 * credits point at it, so the list has no edit mode. A name opens the entity's
 * detail page.
 */
export function ArtistEntitiesPage() {
  const messages = dashboardCopy;
  const me = messages.music.artistEntities;

  const table = useInfiniteAdminTable<AdminArtistEntityListItem>({ endpoint: ENDPOINTS.admin.artistEntities.list });
  const columns = useArtistEntityColumns(me, messages.music.columns);

  return (
    <PageLayout>
      <PageHeader title={me.title}>
        <AdminListSearchField
          value={table.searchInput}
          onChange={table.setSearchInput}
          placeholder={me.searchPlaceholder}
        />
      </PageHeader>

      <PageBody>
        <InfiniteAdminTable table={table} columns={columns}>
          <InfiniteAdminTable.Empty>
            <ContentUnavailableView
              icon={<IdentificationCardIcon weight="duotone" aria-hidden />}
              title={me.noEntities}
              subtitle={table.searchInput ? me.searchPlaceholder : undefined}
              className="flex-1 min-h-0"
            />
          </InfiniteAdminTable.Empty>
        </InfiniteAdminTable>
      </PageBody>

      <Toolbar>
        {table.total !== null && (
          <span className="text-sm text-[var(--ds-text-muted)]">
            {table.total} {me.total}
          </span>
        )}
      </Toolbar>
    </PageLayout>
  );
}
