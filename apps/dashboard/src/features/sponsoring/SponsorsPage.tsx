import {
  type ColumnDef,
  DashboardActionButton,
  DashboardActionId,
  DataTable,
  DataTableScroll,
} from "@musiccloud/dashboard-ui";
import { formatEuroCents, type Sponsor, sponsorDaysLeft } from "@musiccloud/shared";
import { MedalIcon, PencilSimpleIcon, PlusCircleIcon, TrashIcon } from "@phosphor-icons/react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useMemo, useState } from "react";

import { ContentLoadingView } from "@/components/ui/ContentLoadingView";
import { ContentUnavailableView } from "@/components/ui/ContentUnavailableView";
import { DashboardSection } from "@/components/ui/DashboardSection";
import { PageHeader } from "@/components/ui/PageHeader";
import { PageLayout } from "@/components/ui/PageLayout";
import { TableActionButton } from "@/components/ui/TableActionButton";
import { dashboardCopy } from "@/copy/dashboard";
import { deleteSponsor, fetchSponsors, LEDGER_QUERY_KEY, SPONSORS_QUERY_KEY } from "@/features/sponsoring/api";
import { localDay } from "@/features/sponsoring/donationForm";
import { type EditTarget, EditTargetKind } from "@/features/sponsoring/editTarget";
import { RemoveConfirmDialog } from "@/features/sponsoring/RemoveConfirmDialog";
import { SponsorEditCard } from "@/features/sponsoring/SponsorEditCard";

const messages = dashboardCopy;
const sm = messages.sponsoring;

/**
 * The sponsors' columns, built once per set of callbacks.
 *
 * @param today - The day the days left are counted from, `YYYY-MM-DD`.
 * @param onEdit - Opens the edit card for a row.
 * @param onRemove - Asks before removing a row.
 * @returns The column definitions.
 */
function useSponsorColumns(
  today: string,
  onEdit: (sponsor: Sponsor) => void,
  onRemove: (sponsor: Sponsor) => void,
): ColumnDef<Sponsor>[] {
  return useMemo<ColumnDef<Sponsor>[]>(
    () => [
      {
        id: "sponsor",
        header: sm.colSponsor,
        sortKey: (sponsor) => sponsor.name.toLowerCase(),
        cell: (sponsor) => (
          <span className="flex flex-col">
            <span className="text-[var(--ds-text)]">{sponsor.name}</span>
            {sponsor.claim && <span className="text-xs text-[var(--ds-text-muted)] line-clamp-1">{sponsor.claim}</span>}
          </span>
        ),
      },
      {
        id: "paidOn",
        header: sm.colPaidOn,
        className: "w-32",
        sortKey: (sponsor) => sponsor.paidOn,
        cell: (sponsor) => <span className="tabular-nums">{sponsor.paidOn}</span>,
      },
      {
        id: "daysLeft",
        header: sm.colDaysLeft,
        className: "w-28",
        sortKey: (sponsor) => sponsorDaysLeft(sponsor.paidOn, today),
        cell: (sponsor) => {
          const left = sponsorDaysLeft(sponsor.paidOn, today);
          return left > 0 ? (
            <span className="tabular-nums">{left}</span>
          ) : (
            <span className="text-[var(--ds-text-muted)]">{sm.sponsorExpired}</span>
          );
        },
      },
      {
        id: "amount",
        header: sm.colAmount,
        className: "w-32",
        secondary: true,
        sortKey: (sponsor) => sponsor.amountCents,
        cell: (sponsor) => <span className="tabular-nums">{formatEuroCents(sponsor.amountCents)}</span>,
      },
      {
        id: "published",
        header: sm.colPublished,
        className: "w-32",
        secondary: true,
        sortKey: (sponsor) => (sponsor.published ? 1 : 0),
        cell: (sponsor) => (sponsor.published ? sm.publishedYes : sm.publishedNo),
      },
      {
        id: "actions",
        className: "w-28",
        cell: (sponsor) => (
          <div className="flex justify-end gap-1">
            <TableActionButton
              onClick={() => onEdit(sponsor)}
              icon={<PencilSimpleIcon weight="duotone" className="size-3" />}
              label={messages.common.edit}
            />
            <TableActionButton
              onClick={() => onRemove(sponsor)}
              icon={<TrashIcon weight="duotone" className="size-3" />}
              label={messages.common.remove}
            />
          </div>
        ),
      },
    ],
    [today, onEdit, onRemove],
  );
}

/**
 * The annual sponsors: everybody who carries or carried a year of the running
 * costs, the most recent payment first, with the days left of each year, the
 * amount summed from their linked donations, and the card that records or
 * changes one.
 *
 * @returns The page.
 */
export function SponsorsPage() {
  const queryClient = useQueryClient();
  const listQuery = useQuery({ queryKey: SPONSORS_QUERY_KEY, queryFn: fetchSponsors });
  const [editTarget, setEditTarget] = useState<EditTarget<Sponsor>>({ kind: EditTargetKind.Closed });
  const [removeTarget, setRemoveTarget] = useState<Sponsor | null>(null);
  const [today] = useState(localDay);

  const removeMutation = useMutation({
    mutationFn: (id: string) => deleteSponsor(id),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: LEDGER_QUERY_KEY });
      setRemoveTarget(null);
    },
  });

  const { reset: resetRemoval } = removeMutation;
  const openEdit = useCallback(
    (sponsor: Sponsor) => setEditTarget({ kind: EditTargetKind.Existing, row: sponsor }),
    [],
  );
  const askRemoval = useCallback(
    (sponsor: Sponsor) => {
      resetRemoval();
      setRemoveTarget(sponsor);
    },
    [resetRemoval],
  );
  const columns = useSponsorColumns(today, openEdit, askRemoval);
  const sponsors = listQuery.data ?? [];

  return (
    <PageLayout>
      <PageHeader title={sm.sponsorsTitle}>
        <DashboardActionButton
          action={DashboardActionId.Create}
          icon={<PlusCircleIcon weight="duotone" className="w-3.5 h-3.5" />}
          label={sm.sponsorAdd}
          onClick={() => setEditTarget({ kind: EditTargetKind.New })}
          size="control"
          type="button"
        />
      </PageHeader>

      {listQuery.isLoading && <ContentLoadingView className="flex-1 min-h-0" />}

      {!listQuery.isLoading && sponsors.length === 0 && (
        <ContentUnavailableView
          icon={<MedalIcon weight="duotone" aria-hidden />}
          title={sm.sponsorsEmpty}
          subtitle={sm.sponsorsEmptyHint}
          className="flex-1 min-h-0"
        />
      )}

      {sponsors.length > 0 && (
        <DashboardSection className="overflow-hidden flex-1 min-h-0 flex flex-col">
          <DashboardSection.Header icon={<MedalIcon weight="duotone" className="size-4" />} title={sm.sponsorsTitle} />
          <DashboardSection.Body flush>
            <DataTable
              columns={columns}
              data={sponsors}
              getRowKey={(sponsor) => sponsor.id}
              defaultSort={{ id: "paidOn", dir: "desc" }}
            >
              <DataTable.Viewport scroll={DataTableScroll.Self}>
                <DataTable.Head sticky />
                <DataTable.Rows />
              </DataTable.Viewport>
            </DataTable>
          </DashboardSection.Body>
        </DashboardSection>
      )}

      {editTarget.kind !== EditTargetKind.Closed && (
        <SponsorEditCard
          sponsor={editTarget.kind === EditTargetKind.Existing ? editTarget.row : null}
          onClose={() => setEditTarget({ kind: EditTargetKind.Closed })}
        />
      )}

      <RemoveConfirmDialog
        summary={removeTarget && `${removeTarget.paidOn} · ${removeTarget.name}`}
        title={sm.sponsorRemoveConfirmTitle}
        description={sm.sponsorRemoveConfirmDescription}
        pending={removeMutation.isPending}
        error={removeMutation.error}
        onConfirm={() => {
          if (removeTarget) removeMutation.mutate(removeTarget.id);
        }}
        onClose={() => setRemoveTarget(null)}
      />
    </PageLayout>
  );
}
