import {
  DashboardActionButton,
  DashboardActionId,
  DashboardActionStatus,
  DashboardButtonVariant,
} from "@musiccloud/dashboard-ui";
import { DONATION_LIMITS, DONATION_PROVIDERS, type Donation, type DonationProviderValue } from "@musiccloud/shared";
import { HandCoinsIcon } from "@phosphor-icons/react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";

import { Dropdown } from "@/components/ui/Dropdown";
import { SaveErrorMessage } from "@/components/ui/SaveErrorMessage";
import { dashboardCopy } from "@/copy/dashboard";
import { createDonation, DONATIONS_QUERY_KEY, updateDonation } from "@/features/sponsoring/api";
import {
  type DonationForm,
  donationFormProblems,
  emptyDonationForm,
  localDay,
  toDonationForm,
  toDonationInput,
} from "@/features/sponsoring/donationForm";
import { Checkbox } from "@/shared/ui/Checkbox";
import { dialogHeaderIconClass } from "@/shared/ui/Dialog";
import { FormLabel, formInputClass, formTextareaClass } from "@/shared/ui/FormPrimitives";
import { OverlayCard } from "@/shared/ui/OverlayCard";

const messages = dashboardCopy;
const sm = messages.sponsoring;

/** The routes as the route picker lists them, in the ledger's order. */
const PROVIDER_OPTIONS = DONATION_PROVIDERS.map((provider) => ({ value: provider, label: sm.provider[provider] }));

/** Props of {@link DonationEditCard}. */
export interface DonationEditCardProps {
  /** The donation to change, or `null` to record a new one. */
  donation: Donation | null;
  /** Closes the card, after a save or on cancel. */
  onClose: () => void;
}

/**
 * The overlay card that records a donation or changes one, in the shape the
 * user editor uses for the same job.
 *
 * Save stays off while the backend would refuse a field, and the server's own
 * message appears if it refuses anyway. A save refreshes the ledger's list and
 * its sums together, because a donation changes both.
 *
 * @param props - See {@link DonationEditCardProps}.
 * @returns The card.
 */
export function DonationEditCard({ donation, onClose }: DonationEditCardProps) {
  const queryClient = useQueryClient();
  const [form, setForm] = useState<DonationForm>(() =>
    donation ? toDonationForm(donation) : emptyDonationForm(localDay()),
  );
  const problems = donationFormProblems(form);
  const title = donation ? sm.donationEditTitle : sm.donationCreateTitle;

  const saveMutation = useMutation({
    mutationFn: (next: DonationForm) =>
      donation ? updateDonation(donation.id, toDonationInput(next)) : createDonation(toDonationInput(next)),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: DONATIONS_QUERY_KEY });
      onClose();
    },
  });

  function change(patch: Partial<DonationForm>) {
    setForm((current) => ({ ...current, ...patch }));
  }

  return (
    <OverlayCard
      open
      onClose={onClose}
      size={{ storageKey: "donations:edit-card-size", defaultWidth: 512 }}
      aria-label={title}
    >
      <OverlayCard.Header>
        <div className="flex items-center gap-3">
          <HandCoinsIcon weight="duotone" className={dialogHeaderIconClass} />
          <h2 className="font-semibold text-[var(--ds-text)]">{title}</h2>
        </div>
      </OverlayCard.Header>

      <OverlayCard.Body className="space-y-4">
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <div>
            <FormLabel htmlFor="donation-amount">{sm.amountLabel}</FormLabel>
            <input
              id="donation-amount"
              aria-label={sm.amountLabel}
              type="text"
              inputMode="decimal"
              className={formInputClass}
              value={form.amount}
              aria-invalid={(form.amount !== "" && problems.has("amount")) || undefined}
              onChange={(event) => change({ amount: event.target.value })}
            />
            {form.amount !== "" && problems.has("amount") && (
              <p className="mt-1 text-xs text-amber-400">{sm.donationAmountInvalid}</p>
            )}
          </div>
          <div>
            <FormLabel htmlFor="donation-received-on">{sm.receivedOnLabel}</FormLabel>
            <input
              id="donation-received-on"
              aria-label={sm.receivedOnLabel}
              type="date"
              className={formInputClass}
              value={form.receivedOn}
              aria-invalid={problems.has("receivedOn") || undefined}
              onChange={(event) => change({ receivedOn: event.target.value })}
            />
            {problems.has("receivedOn") && <p className="mt-1 text-xs text-amber-400">{sm.dayInvalid}</p>}
          </div>
        </div>

        <Dropdown<DonationProviderValue>
          label={sm.providerLabel}
          value={form.provider}
          options={PROVIDER_OPTIONS}
          onChange={(provider) => change({ provider })}
        />

        <div>
          <FormLabel htmlFor="donation-donor">{sm.donorLabel}</FormLabel>
          <input
            id="donation-donor"
            aria-label={sm.donorLabel}
            type="text"
            className={formInputClass}
            value={form.name}
            maxLength={DONATION_LIMITS.nameMaxLength}
            placeholder={sm.anonymous}
            onChange={(event) => change({ name: event.target.value })}
          />
          {problems.has("name") && (
            <p className="mt-1 text-xs text-amber-400">
              {sm.tooLong.replace("{max}", String(DONATION_LIMITS.nameMaxLength))}
            </p>
          )}
        </div>

        <div>
          <Checkbox
            checked={form.published}
            onChange={(published) => change({ published })}
            label={sm.publishedLabel}
          />
          <p className="mt-1 text-xs text-[var(--ds-text-muted)]">{sm.publishedHint}</p>
        </div>

        <div>
          <FormLabel htmlFor="donation-note">{sm.noteLabel}</FormLabel>
          <textarea
            id="donation-note"
            aria-label={sm.noteLabel}
            className={formTextareaClass}
            rows={3}
            value={form.note}
            maxLength={DONATION_LIMITS.noteMaxLength}
            onChange={(event) => change({ note: event.target.value })}
          />
          {problems.has("note") && (
            <p className="mt-1 text-xs text-amber-400">
              {sm.tooLong.replace("{max}", String(DONATION_LIMITS.noteMaxLength))}
            </p>
          )}
        </div>

        {saveMutation.isError && <SaveErrorMessage error={saveMutation.error} />}
      </OverlayCard.Body>

      <OverlayCard.Footer className="flex justify-end gap-2">
        <DashboardActionButton
          action={DashboardActionId.Cancel}
          icon={false}
          label={messages.common.cancel}
          onClick={onClose}
          size="control"
          type="button"
          variant={DashboardButtonVariant.Neutral}
        />
        <DashboardActionButton
          action={DashboardActionId.Save}
          label={messages.common.save}
          disabled={problems.size > 0 || saveMutation.isPending}
          onClick={() => saveMutation.mutate(form)}
          size="control"
          status={saveMutation.isPending ? DashboardActionStatus.Busy : DashboardActionStatus.Idle}
          type="button"
        />
      </OverlayCard.Footer>
    </OverlayCard>
  );
}
