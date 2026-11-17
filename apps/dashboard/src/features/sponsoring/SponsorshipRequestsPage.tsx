import { type ColumnDef, DashboardButtonVariant, DataTable, DataTableScroll } from "@musiccloud/dashboard-ui";
import { SocialMediaIcons } from "@musiccloud/dashboard-ui/social-media";
import {
  formatCreditorReference,
  formatEuroCents,
  PENDING_SPONSORSHIP_DAYS,
  type PendingSponsorship,
  pendingSponsorshipDaysLeft,
} from "@musiccloud/shared";
import { HandHeartIcon, HourglassMediumIcon, TrashIcon } from "@phosphor-icons/react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useMemo, useState } from "react";

import { ContentLoadingView } from "@/components/ui/ContentLoadingView";
import { ContentUnavailableView } from "@/components/ui/ContentUnavailableView";
import { DashboardSection } from "@/components/ui/DashboardSection";
import { PageHeader } from "@/components/ui/PageHeader";
import { PageLayout } from "@/components/ui/PageLayout";
import { SaveErrorMessage } from "@/components/ui/SaveErrorMessage";
import { TableActionButton } from "@/components/ui/TableActionButton";
import { dashboardCopy } from "@/copy/dashboard";
import {
  deleteSponsorshipRequest,
  fetchSponsorshipRequests,
  SPONSORSHIP_REQUESTS_QUERY_KEY,
} from "@/features/sponsoring/api";
import { localDay } from "@/features/sponsoring/donationForm";
import { RemoveConfirmDialog } from "@/features/sponsoring/RemoveConfirmDialog";
import { SponsorshipTakeoverDialog } from "@/features/sponsoring/SponsorshipTakeoverDialog";

/** The dashboard's copy. */
const messages = dashboardCopy;
/** The sponsoring screens' copy. */
const sm = messages.sponsoring;

/** The empty page's explanation, with the days a request stands filled in once. */
const EMPTY_HINT = sm.requestsEmptyHint.replace("{days}", String(PENDING_SPONSORSHIP_DAYS));

/**
 * Names a request in one line, as the remove dialog shows it: the reference
 * in the groups of four it is printed in, then the name.
 *
 * @param request - The request to name.
 * @returns The line, such as `RF12 MCSP 7Q2K 9X4M 8T3B · Ada`.
 */
function requestSummary(request: PendingSponsorship): string {
  return `${formatCreditorReference(request.reference)} · ${request.name}`;
}

/**
 * The requests' columns, built once per set of callbacks.
 *
 * The reference comes first, because it is the only thing the transfer
 * carries and therefore the only way to tell which row the money on the
 * statement belongs to. It is shown in the groups of four it is printed in,
 * which is how a banking app shows it.
 *
 * @param now - The moment the days left are counted from.
 * @param onTakeOver - Opens the takeover dialog for a row.
 * @param onRemove - Asks before removing a row.
 * @returns The column definitions.
 */
function useRequestColumns(
  now: Date,
  onTakeOver: (request: PendingSponsorship) => void,
  onRemove: (request: PendingSponsorship) => void,
): ColumnDef<PendingSponsorship>[] {
  return useMemo<ColumnDef<PendingSponsorship>[]>(
    () => [
      {
        id: "reference",
        header: sm.colReference,
        className: "w-56",
        sortKey: (request) => request.reference,
        cell: (request) => (
          <span className="font-mono whitespace-nowrap text-[var(--ds-text)]">
            {formatCreditorReference(request.reference)}
          </span>
        ),
      },
      {
        id: "sponsor",
        header: sm.colSponsor,
        sortKey: (request) => request.name.toLowerCase(),
        cell: (request) => (
          <span className="flex flex-col">
            <span className="text-[var(--ds-text)]">{request.name}</span>
            <span className="text-xs text-[var(--ds-text-muted)] line-clamp-1" title={request.claim}>
              {request.claim}
            </span>
          </span>
        ),
      },
      {
        id: "profile",
        header: sm.sponsorSocialMediaLabel,
        className: "w-24",
        secondary: true,
        cell: (request) => (
          <SocialMediaIcons
            socialMedia={request.socialMedia}
            itemClassName="text-[var(--ds-text-muted)] hover:text-[var(--ds-text)]"
          />
        ),
      },
      {
        id: "amount",
        header: sm.colAnnounced,
        className: "w-32",
        sortKey: (request) => request.amountCents,
        cell: (request) =>
          request.amountCents > 0 ? (
            <span className="tabular-nums">{formatEuroCents(request.amountCents)}</span>
          ) : (
            <span className="text-[var(--ds-text-muted)]">{sm.requestAmountNone}</span>
          ),
      },
      {
        id: "published",
        header: sm.colPublished,
        className: "w-32",
        secondary: true,
        sortKey: (request) => (request.published ? 1 : 0),
        cell: (request) => (request.published ? sm.publishedYes : sm.publishedNo),
      },
      {
        id: "createdAt",
        header: sm.colRequestedOn,
        className: "w-32",
        sortKey: (request) => request.createdAt,
        cell: (request) => <span className="tabular-nums">{localDay(new Date(request.createdAt))}</span>,
      },
      {
        id: "daysLeft",
        header: sm.colDaysLeft,
        className: "w-28",
        sortKey: (request) => pendingSponsorshipDaysLeft(request.createdAt, now),
        cell: (request) => {
          const left = pendingSponsorshipDaysLeft(request.createdAt, now);
          return left > 0 ? (
            <span className="tabular-nums">{left}</span>
          ) : (
            <span className="text-[var(--ds-text-muted)]">{sm.requestExpired}</span>
          );
        },
      },
      {
        id: "actions",
        className: "w-56",
        cell: (request) => (
          <div className="flex justify-end gap-1">
            <TableActionButton
              onClick={() => onTakeOver(request)}
              icon={<HandHeartIcon weight="duotone" className="size-3" />}
              label={sm.requestTakeOver}
              variant={DashboardButtonVariant.Primary}
            />
            <TableActionButton
              onClick={() => onRemove(request)}
              icon={<TrashIcon weight="duotone" className="size-3" />}
              label={messages.common.remove}
            />
          </div>
        ),
      },
    ],
    [now, onTakeOver, onRemove],
  );
}

/**
 * The sponsorship requests: everybody who filled in the sponsor form on the
 * support page and has not been taken over yet, oldest first, ported from
 * lmaa.space's pending sponsorships page.
 *
 * Somebody says on the site who they are, and the transfer that follows
 * carries only a reference. This is where the two are put together: the
 * reference in the first column is what the statement shows, the days left say
 * how long the request still stands, and Take over makes a sponsor and a
 * donation of everything the person already wrote. A failed load, takeover or
 * removal shows the server's message with its code and error id.
 *
 * @returns The page.
 */
export function SponsorshipRequestsPage() {
  const queryClient = useQueryClient();
  const listQuery = useQuery({ queryKey: SPONSORSHIP_REQUESTS_QUERY_KEY, queryFn: fetchSponsorshipRequests });
  const [takeOverTarget, setTakeOverTarget] = useState<PendingSponsorship | null>(null);
  const [removeTarget, setRemoveTarget] = useState<PendingSponsorship | null>(null);
  const [now] = useState(() => new Date());

  const removeMutation = useMutation({
    mutationFn: (id: string) => deleteSponsorshipRequest(id),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: SPONSORSHIP_REQUESTS_QUERY_KEY });
      setRemoveTarget(null);
    },
  });

  const { reset: resetRemoval } = removeMutation;
  const openTakeOver = useCallback((request: PendingSponsorship) => setTakeOverTarget(request), []);
  const askRemoval = useCallback(
    (request: PendingSponsorship) => {
      resetRemoval();
      setRemoveTarget(request);
    },
    [resetRemoval],
  );
  const columns = useRequestColumns(now, openTakeOver, askRemoval);
  const requests = listQuery.data ?? [];

  return (
    <PageLayout>
      <PageHeader title={sm.requestsTitle} />

      {listQuery.isLoading && <ContentLoadingView className="flex-1 min-h-0" />}

      {listQuery.isError && <SaveErrorMessage error={listQuery.error} />}

      {listQuery.isSuccess && requests.length === 0 && (
        <ContentUnavailableView
          icon={<HourglassMediumIcon weight="duotone" aria-hidden />}
          title={sm.requestsEmpty}
          subtitle={EMPTY_HINT}
          className="flex-1 min-h-0"
        />
      )}

      {requests.length > 0 && (
        <DashboardSection className="overflow-hidden flex-1 min-h-0 flex flex-col">
          <DashboardSection.Header
            icon={<HourglassMediumIcon weight="duotone" className="size-4" />}
            title={sm.requestsTitle}
          />
          <DashboardSection.Body flush>
            <DataTable
              columns={columns}
              data={requests}
              getRowKey={(request) => request.id}
              defaultSort={{ id: "createdAt", dir: "asc" }}
            >
              <DataTable.Viewport scroll={DataTableScroll.Self}>
                <DataTable.Head sticky />
                <DataTable.Rows />
              </DataTable.Viewport>
            </DataTable>
          </DashboardSection.Body>
        </DashboardSection>
      )}

      {takeOverTarget && <SponsorshipTakeoverDialog request={takeOverTarget} onClose={() => setTakeOverTarget(null)} />}

      <RemoveConfirmDialog
        summary={removeTarget && requestSummary(removeTarget)}
        title={sm.requestRemoveConfirmTitle}
        description={sm.requestRemoveConfirmDescription}
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
