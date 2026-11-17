import {
  DashboardActionButton,
  DashboardActionId,
  DashboardActionStatus,
  DashboardButtonVariant,
} from "@musiccloud/dashboard-ui";
import {
  formatCreditorReference,
  formatEuroCents,
  PENDING_SPONSORSHIP_LIMITS,
  type PendingSponsorship,
} from "@musiccloud/shared";
import { HandHeartIcon } from "@phosphor-icons/react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";

import { SaveErrorMessage } from "@/components/ui/SaveErrorMessage";
import { dashboardCopy } from "@/copy/dashboard";
import {
  LEDGER_QUERY_KEY,
  SPONSORSHIP_REQUESTS_QUERY_KEY,
  takeOverSponsorshipRequest,
} from "@/features/sponsoring/api";
import { localDay } from "@/features/sponsoring/donationForm";
import {
  type SponsorshipTakeoverForm,
  sponsorshipTakeoverProblems,
  toSponsorshipTakeover,
  toSponsorshipTakeoverForm,
} from "@/features/sponsoring/sponsorshipRequest";
import { Dialog, dialogHeaderIconClass } from "@/shared/ui/Dialog";
import { FormLabel, formInputClass } from "@/shared/ui/FormPrimitives";

/** The dashboard's copy. */
const messages = dashboardCopy;
/** The sponsoring screens' copy. */
const sm = messages.sponsoring;

/** The sentence under the amount when it is refused, with the largest amount filled in once. */
const AMOUNT_INVALID_MESSAGE = sm.requestAmountInvalid.replace(
  "{max}",
  formatEuroCents(PENDING_SPONSORSHIP_LIMITS.amountMaxCents),
);

/** Props of {@link SponsorshipTakeoverDialog}. */
export interface SponsorshipTakeoverDialogProps {
  /** The request to take over. The dialog is mounted only while one is chosen. */
  request: PendingSponsorship;
  /**
   * The sponsoring settings' minimum in cents, the amount preset when the
   * request announced none. The page passes `SPONSORING_DEFAULTS.sponsorMinimumCents`
   * while the settings have not loaded.
   */
  sponsorMinimumCents: number;
  /** Closes the dialog, after a takeover or on cancel. */
  onClose: () => void;
}

/**
 * The dialog that turns a sponsorship request into an annual sponsor and the
 * donation that pays for them, ported from lmaa.space's takeover dialog.
 *
 * It names the person and the reference, so the operator can compare both
 * with the statement, and asks only for what the statement says: the amount
 * that arrived, preset to the announced one or, where none was announced, to
 * the sponsoring minimum, and the day it arrived, preset to today. Take over stays off while the backend would refuse either field,
 * and the server's own message, with its code and error id, appears if it
 * refuses anyway. A takeover refreshes the requests and the whole ledger,
 * because the request leaves one list and a sponsor and a donation join the
 * others.
 *
 * @param props - See {@link SponsorshipTakeoverDialogProps}.
 * @returns The dialog.
 */
export function SponsorshipTakeoverDialog({ request, sponsorMinimumCents, onClose }: SponsorshipTakeoverDialogProps) {
  const queryClient = useQueryClient();
  const [form, setForm] = useState<SponsorshipTakeoverForm>(() =>
    toSponsorshipTakeoverForm(request, localDay(), sponsorMinimumCents),
  );
  const problems = sponsorshipTakeoverProblems(form);

  const takeOverMutation = useMutation({
    mutationFn: (next: SponsorshipTakeoverForm) => takeOverSponsorshipRequest(request.id, toSponsorshipTakeover(next)),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: SPONSORSHIP_REQUESTS_QUERY_KEY }),
        queryClient.invalidateQueries({ queryKey: LEDGER_QUERY_KEY }),
      ]);
      onClose();
    },
  });

  /**
   * Replaces some of the form's fields.
   *
   * @param patch - The fields to replace.
   */
  function change(patch: Partial<SponsorshipTakeoverForm>) {
    setForm((current) => ({ ...current, ...patch }));
  }

  return (
    <Dialog
      open
      title={sm.requestTakeOverTitle}
      titleIcon={<HandHeartIcon weight="duotone" className={dialogHeaderIconClass} />}
      onClose={onClose}
    >
      <div className="px-6 py-3 space-y-4">
        <div className="space-y-1">
          <p className="text-sm font-medium text-[var(--ds-text)]">{request.name}</p>
          <p className="text-sm font-mono text-[var(--ds-text-muted)]">{formatCreditorReference(request.reference)}</p>
        </div>
        <p className="text-sm text-[var(--ds-text-muted)]">{sm.requestTakeOverHint}</p>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <div>
            <FormLabel htmlFor="takeover-amount">{sm.amountLabel}</FormLabel>
            <input
              id="takeover-amount"
              aria-label={sm.amountLabel}
              type="text"
              inputMode="decimal"
              className={formInputClass}
              value={form.amount}
              aria-invalid={(form.amount !== "" && problems.has("amount")) || undefined}
              onChange={(event) => change({ amount: event.target.value })}
            />
            {form.amount !== "" && problems.has("amount") && (
              <p className="mt-1 text-xs text-amber-400">{AMOUNT_INVALID_MESSAGE}</p>
            )}
          </div>
          <div>
            <FormLabel htmlFor="takeover-paid-on">{sm.sponsorPaidOnLabel}</FormLabel>
            <input
              id="takeover-paid-on"
              aria-label={sm.sponsorPaidOnLabel}
              type="date"
              className={formInputClass}
              value={form.paidOn}
              aria-invalid={problems.has("paidOn") || undefined}
              onChange={(event) => change({ paidOn: event.target.value })}
            />
            {problems.has("paidOn") && <p className="mt-1 text-xs text-amber-400">{sm.dayInvalid}</p>}
          </div>
        </div>
        <p className="text-xs text-[var(--ds-text-muted)]">{sm.sponsorPaidOnHint}</p>
        {takeOverMutation.isError && <SaveErrorMessage error={takeOverMutation.error} />}
      </div>
      <Dialog.Footer>
        <DashboardActionButton
          action={DashboardActionId.Cancel}
          icon={false}
          label={messages.common.cancel}
          onClick={onClose}
          type="button"
          variant={DashboardButtonVariant.Neutral}
        />
        <DashboardActionButton
          action={DashboardActionId.Approve}
          icon={false}
          label={sm.requestTakeOver}
          disabled={problems.size > 0 || takeOverMutation.isPending}
          onClick={() => takeOverMutation.mutate(form)}
          status={takeOverMutation.isPending ? DashboardActionStatus.Busy : DashboardActionStatus.Idle}
          type="button"
        />
      </Dialog.Footer>
    </Dialog>
  );
}
