import {
  type ColumnDef,
  DashboardActionButton,
  DashboardActionId,
  DataTable,
  DataTableScroll,
} from "@musiccloud/dashboard-ui";
import { type Donation, formatEuroCents } from "@musiccloud/shared";
import { HandCoinsIcon, PencilSimpleIcon, PlusCircleIcon, TrashIcon } from "@phosphor-icons/react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useMemo, useState } from "react";

import { ContentLoadingView } from "@/components/ui/ContentLoadingView";
import { ContentUnavailableView } from "@/components/ui/ContentUnavailableView";
import { DashboardSection } from "@/components/ui/DashboardSection";
import { PageHeader } from "@/components/ui/PageHeader";
import { PageLayout } from "@/components/ui/PageLayout";
import { TableActionButton } from "@/components/ui/TableActionButton";
import { dashboardCopy } from "@/copy/dashboard";
import { DONATION_LIST_QUERY_KEY, deleteDonation, fetchDonations, LEDGER_QUERY_KEY } from "@/features/sponsoring/api";
import { DonationEditCard } from "@/features/sponsoring/DonationEditCard";
import { type EditTarget, EditTargetKind } from "@/features/sponsoring/editTarget";
import { RemoveConfirmDialog } from "@/features/sponsoring/RemoveConfirmDialog";

const messages = dashboardCopy;
const sm = messages.sponsoring;

/**
 * The ledger's columns, built once per set of callbacks.
 *
 * @param onEdit - Opens the edit card for a row.
 * @param onRemove - Asks before removing a row.
 * @returns The column definitions.
 */
function useDonationColumns(
  onEdit: (donation: Donation) => void,
  onRemove: (donation: Donation) => void,
): ColumnDef<Donation>[] {
  return useMemo<ColumnDef<Donation>[]>(
    () => [
      {
        id: "receivedOn",
        header: sm.colReceivedOn,
        className: "w-32",
        sortKey: (donation) => donation.receivedOn,
        cell: (donation) => <span className="tabular-nums">{donation.receivedOn}</span>,
      },
      {
        id: "donor",
        header: sm.colDonor,
        sortKey: (donation) => donation.name.toLowerCase(),
        cell: (donation) => (
          <span className="flex flex-col">
            <span className={donation.name ? "text-[var(--ds-text)]" : "text-[var(--ds-text-muted)]"}>
              {donation.name || sm.anonymous}
            </span>
            {donation.note && <span className="text-xs text-[var(--ds-text-muted)]">{donation.note}</span>}
          </span>
        ),
      },
      {
        id: "amount",
        header: sm.colAmount,
        className: "w-32",
        sortKey: (donation) => donation.amountCents,
        cell: (donation) => <span className="tabular-nums">{formatEuroCents(donation.amountCents)}</span>,
      },
      {
        id: "provider",
        header: sm.colProvider,
        className: "w-40",
        secondary: true,
        sortKey: (donation) => sm.provider[donation.provider],
        cell: (donation) => sm.provider[donation.provider],
      },
      {
        id: "published",
        header: sm.colPublished,
        className: "w-32",
        secondary: true,
        sortKey: (donation) => (donation.published ? 1 : 0),
        cell: (donation) => (donation.published ? sm.publishedYes : sm.publishedNo),
      },
      {
        id: "actions",
        className: "w-28",
        cell: (donation) => (
          <div className="flex justify-end gap-1">
            <TableActionButton
              onClick={() => onEdit(donation)}
              icon={<PencilSimpleIcon weight="duotone" className="size-3" />}
              label={messages.common.edit}
            />
            <TableActionButton
              onClick={() => onRemove(donation)}
              icon={<TrashIcon weight="duotone" className="size-3" />}
              label={messages.common.remove}
            />
          </div>
        ),
      },
    ],
    [onEdit, onRemove],
  );
}

/**
 * The donations ledger: every payment that reached musiccloud, newest first,
 * with the card that records or changes one and the question before one is
 * removed.
 *
 * The rows are the only source of every funding figure, so the page says so
 * while it is empty, and a removal names its consequence before it happens.
 *
 * @returns The page.
 */
export function DonationsPage() {
  const queryClient = useQueryClient();
  const listQuery = useQuery({ queryKey: DONATION_LIST_QUERY_KEY, queryFn: fetchDonations });
  const [editTarget, setEditTarget] = useState<EditTarget<Donation>>({ kind: EditTargetKind.Closed });
  const [removeTarget, setRemoveTarget] = useState<Donation | null>(null);

  const removeMutation = useMutation({
    mutationFn: (id: string) => deleteDonation(id),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: LEDGER_QUERY_KEY });
      setRemoveTarget(null);
    },
  });

  const { reset: resetRemoval } = removeMutation;
  const openEdit = useCallback(
    (donation: Donation) => setEditTarget({ kind: EditTargetKind.Existing, row: donation }),
    [],
  );
  const askRemoval = useCallback(
    (donation: Donation) => {
      resetRemoval();
      setRemoveTarget(donation);
    },
    [resetRemoval],
  );
  const columns = useDonationColumns(openEdit, askRemoval);
  const donations = listQuery.data ?? [];

  return (
    <PageLayout>
      <PageHeader title={sm.donationsTitle}>
        <DashboardActionButton
          action={DashboardActionId.Create}
          icon={<PlusCircleIcon weight="duotone" className="w-3.5 h-3.5" />}
          label={sm.donationAdd}
          onClick={() => setEditTarget({ kind: EditTargetKind.New })}
          size="control"
          type="button"
        />
      </PageHeader>

      {listQuery.isLoading && <ContentLoadingView className="flex-1 min-h-0" />}

      {!listQuery.isLoading && donations.length === 0 && (
        <ContentUnavailableView
          icon={<HandCoinsIcon weight="duotone" aria-hidden />}
          title={sm.donationsEmpty}
          subtitle={sm.donationsEmptyHint}
          className="flex-1 min-h-0"
        />
      )}

      {donations.length > 0 && (
        <DashboardSection className="overflow-hidden flex-1 min-h-0 flex flex-col">
          <DashboardSection.Header
            icon={<HandCoinsIcon weight="duotone" className="size-4" />}
            title={sm.donationsTitle}
          />
          <DashboardSection.Body flush>
            <DataTable
              columns={columns}
              data={donations}
              getRowKey={(donation) => donation.id}
              defaultSort={{ id: "receivedOn", dir: "desc" }}
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
        <DonationEditCard
          donation={editTarget.kind === EditTargetKind.Existing ? editTarget.row : null}
          onClose={() => setEditTarget({ kind: EditTargetKind.Closed })}
        />
      )}

      <RemoveConfirmDialog
        summary={
          removeTarget &&
          `${removeTarget.receivedOn} · ${removeTarget.name || sm.anonymous} · ${formatEuroCents(removeTarget.amountCents)}`
        }
        title={sm.removeConfirmTitle}
        description={sm.removeConfirmDescription}
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
