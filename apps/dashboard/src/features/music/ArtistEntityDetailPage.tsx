import { type ColumnDef, DataTable } from "@musiccloud/dashboard-ui";
import {
  type AdminArtistEntityDetail,
  type AdminArtistEntityName,
  type AdminArtistFactSource,
  type AdminArtistLifecycleEvent,
  type AdminArtistMembership,
  getPlatformLabel,
  isValidServiceId,
} from "@musiccloud/shared";
import {
  CalendarBlank as CalendarBlankIcon,
  IdentificationCard as IdentificationCardIcon,
  Tag as TagIcon,
  UserList as UserListIcon,
  UsersFour as UsersFourIcon,
} from "@phosphor-icons/react";
import type { ReactNode } from "react";
import { Link, useNavigate, useParams } from "react-router";

import { ContentLoadingView } from "@/components/ui/ContentLoadingView";
import { ContentUnavailableView } from "@/components/ui/ContentUnavailableView";
import { DashboardSection } from "@/components/ui/DashboardSection";
import { HeaderBackButton } from "@/components/ui/HeaderBackButton";
import { PageHeader } from "@/components/ui/PageHeader";
import { PageLayout } from "@/components/ui/PageLayout";
import { dashboardCopy } from "@/copy/dashboard";
import { useArtistEntityDetail } from "@/features/music/hooks/useArtistEntityDetail";
import { formatEnglishDate, formatPartialDate } from "@/lib/format";
import { SHARE_BASE } from "@/lib/shareBase";
import { FormLabelText, FormValue } from "@/shared/ui/FormPrimitives";
import { describeRequestFailure, HttpStatus } from "@/shared/utils/api-error";

const me = dashboardCopy.music.artistEntities;
const md = dashboardCopy.music.artistEntityDetail;

/** The route of an entity's detail page, which a membership row links its counterpart to. */
function entityPath(id: string): string {
  return `/artist-entities/${encodeURIComponent(id)}`;
}

/** The medium date an operator reads a timestamp in, such as "Oct 12, 2026". */
function formatTimestamp(epochMs: number): string {
  return formatEnglishDate(epochMs, { dateStyle: "medium" });
}

/**
 * The years a membership stint covers, as precisely as they are known.
 *
 * A stint with a beginning and no end reads as running only where it is
 * recorded as current. Without an end date and without that flag, the page
 * says where it began and nothing about whether it ended.
 */
function membershipPeriod(membership: AdminArtistMembership): string {
  const begin = formatPartialDate(membership.begin);
  const end = formatPartialDate(membership.end);
  if (begin && end) return md.periodRange.replace("{begin}", begin).replace("{end}", end);
  if (end) return md.periodUntil.replace("{end}", end);
  if (begin) {
    if (membership.isCurrent === true) return md.periodSince.replace("{begin}", begin);
    if (membership.isCurrent === false) return md.periodEndedSince.replace("{begin}", begin);
    return md.periodFrom.replace("{begin}", begin);
  }
  return membership.isCurrent ? md.periodCurrent : md.periodUnknown;
}

/**
 * Who stated a fact and when they were read, which is what an operator checks
 * first when a date or a membership looks wrong.
 */
function FactSource({ source }: { source: AdminArtistFactSource | null }) {
  if (!source) return <span className="text-sm text-[var(--ds-text-muted)]">{md.sourceNone}</span>;
  const label = isValidServiceId(source.provider) ? getPlatformLabel(source.provider) : source.provider;
  return (
    <div className="min-w-0">
      {source.url ? (
        <a
          href={source.url}
          target="_blank"
          rel="noopener noreferrer"
          className="block truncate text-sm text-[var(--ds-text)] hover:underline"
        >
          {label}
        </a>
      ) : (
        <span className="block truncate text-sm text-[var(--ds-text)]">{label}</span>
      )}
      {source.fetchedAt !== null && (
        <span className="block truncate text-xs text-[var(--ds-text-muted)]">
          {md.sourceRead.replace("{date}", formatTimestamp(source.fetchedAt))}
        </span>
      )}
    </div>
  );
}

const SOURCE_COLUMN_CLASS = "w-56";

const NAME_COLUMNS: ColumnDef<AdminArtistEntityName>[] = [
  {
    id: "name",
    header: md.colName,
    cell: (name) => <span className="block truncate text-sm font-medium text-[var(--ds-text)]">{name.name}</span>,
  },
  {
    id: "nameType",
    header: md.colNameType,
    className: "w-32",
    cell: (name) => <span className="text-sm">{md.nameTypes[name.nameType]}</span>,
  },
  {
    id: "locale",
    header: md.colLocale,
    className: "w-28",
    cell: (name) => <span className="text-sm text-[var(--ds-text-muted)]">{name.locale ?? md.localeNone}</span>,
  },
];

const EVENT_COLUMNS: ColumnDef<AdminArtistLifecycleEvent>[] = [
  {
    id: "eventType",
    header: md.colEvent,
    className: "w-32",
    cell: (event) => (
      <span className="text-sm font-medium text-[var(--ds-text)]">{md.eventTypes[event.eventType]}</span>
    ),
  },
  {
    id: "date",
    header: md.colDate,
    cell: (event) => <span className="text-sm">{formatPartialDate(event.date) ?? md.dateUnknown}</span>,
  },
  {
    id: "source",
    header: md.colSource,
    className: SOURCE_COLUMN_CLASS,
    cell: (event) => <FactSource source={event.source} />,
  },
];

/**
 * The columns of a membership table. The counterpart is the member on the
 * group's page and the group on the member's page, and it links to its own
 * detail page.
 */
function membershipColumns(counterpart: "member" | "group"): ColumnDef<AdminArtistMembership>[] {
  return [
    {
      id: "counterpart",
      header: counterpart === "member" ? md.colMember : md.colGroup,
      cell: (membership) => {
        const id = counterpart === "member" ? membership.memberArtistEntityId : membership.groupArtistEntityId;
        const name = counterpart === "member" ? membership.memberName : membership.groupName;
        return (
          <Link
            to={entityPath(id)}
            className="block truncate text-sm font-medium text-[var(--ds-text)] hover:underline"
          >
            {name}
          </Link>
        );
      },
    },
    {
      id: "roles",
      header: md.colRoles,
      cell: (membership) => <span className="text-sm">{membership.roles.join(", ")}</span>,
    },
    {
      id: "period",
      header: md.colPeriod,
      className: "w-56",
      cell: (membership) => <span className="text-sm">{membershipPeriod(membership)}</span>,
    },
    {
      id: "source",
      header: md.colSource,
      className: SOURCE_COLUMN_CLASS,
      cell: (membership) => <FactSource source={membership.source} />,
    },
  ];
}

const MEMBER_COLUMNS = membershipColumns("member");
const GROUP_COLUMNS = membershipColumns("group");

/** Props for {@link FactTableSection}. */
interface FactTableSectionProps<T extends { id: string }> {
  icon: ReactNode;
  title: string;
  columns: ColumnDef<T>[];
  rows: T[];
  /** What the section says when there is no row. */
  emptyText: string;
}

/**
 * One section of the detail page that lists stored facts as a table, or says
 * that there are none.
 */
function FactTableSection<T extends { id: string }>({
  icon,
  title,
  columns,
  rows,
  emptyText,
}: FactTableSectionProps<T>) {
  return (
    <DashboardSection className="overflow-hidden">
      <DashboardSection.Header icon={icon} title={title} />
      <DashboardSection.Body flush>
        <DataTable columns={columns} data={rows} getRowKey={(row) => row.id}>
          <DataTable.Empty>
            <p className="px-4 py-3 text-sm text-[var(--ds-text-muted)]">{emptyText}</p>
          </DataTable.Empty>
          <DataTable.Viewport>
            <DataTable.Head />
            <DataTable.Rows />
          </DataTable.Viewport>
        </DataTable>
      </DashboardSection.Body>
    </DashboardSection>
  );
}

/** One labelled fact in the identity section. */
function IdentityFact({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="min-w-0">
      <FormLabelText>{label}</FormLabelText>
      <FormValue>{children}</FormValue>
    </div>
  );
}

function IdentitySection({ entity }: { entity: AdminArtistEntityDetail }) {
  return (
    <DashboardSection className="overflow-hidden">
      <DashboardSection.Header
        icon={<IdentificationCardIcon weight="duotone" className="size-4" />}
        title={md.identityTitle}
      />
      <DashboardSection.Body>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-5">
          <IdentityFact label={me.colType}>{me.types[entity.entityType]}</IdentityFact>
          <IdentityFact label={me.colStatus}>{me.statuses[entity.verificationStatus]}</IdentityFact>
          <IdentityFact label={md.added}>{formatTimestamp(entity.createdAt)}</IdentityFact>
          <IdentityFact label={me.colArtistPage}>
            {entity.shortId ? (
              <a
                href={`${SHARE_BASE}/${entity.shortId}`}
                target="_blank"
                rel="noopener noreferrer"
                className="block truncate hover:underline"
              >
                {entity.shortId}
              </a>
            ) : (
              <span className="text-[var(--ds-text-muted)]">{me.artistPageNone}</span>
            )}
          </IdentityFact>
          <IdentityFact label={md.entityId}>
            <span className="block break-all font-mono text-xs">{entity.id}</span>
          </IdentityFact>
        </div>
      </DashboardSection.Body>
    </DashboardSection>
  );
}

/**
 * Shows one artist entity: what kind of artist it is, its names, its lifecycle
 * dates and its band memberships, each fact with the source that stated it and
 * when that source was read.
 *
 * A group shows its members and a person the groups it belongs to. The other
 * side appears only where something is recorded, because a person with an
 * empty member list says nothing. A membership's counterpart opens its own
 * page, so an operator can walk from a band to a member and back.
 */
export function ArtistEntityDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const query = useArtistEntityDetail(id);

  const backButton = () => <HeaderBackButton label={md.backLabel} onClick={() => navigate("/artist-entities")} />;

  if (query.isPending) {
    return (
      <PageLayout>
        <PageHeader title="" renderLeading={backButton} />
        <ContentLoadingView className="flex-1 min-h-0" />
      </PageLayout>
    );
  }

  if (query.isError) {
    const notFound = query.error.status === HttpStatus.NotFound;
    const failure = describeRequestFailure(query.error, dashboardCopy.common.errorId);
    return (
      <PageLayout>
        <PageHeader title="" renderLeading={backButton} />
        <ContentUnavailableView
          icon={<IdentificationCardIcon weight="duotone" aria-hidden />}
          title={notFound ? md.notFound : md.loadError}
          subtitle={notFound ? md.notFoundHint : failure}
          className="flex-1 min-h-0"
        />
      </PageLayout>
    );
  }

  const entity = query.data;
  const showMembers = entity.entityType === "group" || entity.members.length > 0;
  const showMemberOf = entity.entityType !== "group" || entity.memberOf.length > 0;

  return (
    <PageLayout>
      <PageHeader title={entity.name} renderLeading={backButton} />
      <div className="grid content-start gap-[var(--ds-space-base)]">
        <IdentitySection entity={entity} />
        <FactTableSection
          icon={<TagIcon weight="duotone" className="size-4" />}
          title={md.namesTitle}
          columns={NAME_COLUMNS}
          rows={entity.names}
          emptyText={md.namesEmpty}
        />
        <FactTableSection
          icon={<CalendarBlankIcon weight="duotone" className="size-4" />}
          title={md.lifecycleTitle}
          columns={EVENT_COLUMNS}
          rows={entity.events}
          emptyText={md.lifecycleEmpty}
        />
        {showMembers && (
          <FactTableSection
            icon={<UsersFourIcon weight="duotone" className="size-4" />}
            title={md.membersTitle}
            columns={MEMBER_COLUMNS}
            rows={entity.members}
            emptyText={md.membersEmpty}
          />
        )}
        {showMemberOf && (
          <FactTableSection
            icon={<UserListIcon weight="duotone" className="size-4" />}
            title={md.memberOfTitle}
            columns={GROUP_COLUMNS}
            rows={entity.memberOf}
            emptyText={md.memberOfEmpty}
          />
        )}
      </div>
    </PageLayout>
  );
}
