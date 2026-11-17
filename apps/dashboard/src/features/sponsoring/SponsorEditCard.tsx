import {
  DashboardActionButton,
  DashboardActionId,
  DashboardActionStatus,
  DashboardButtonVariant,
} from "@musiccloud/dashboard-ui";
import { formatEuroCents, SPONSOR_LIMITS, type Sponsor } from "@musiccloud/shared";
import { MedalIcon } from "@phosphor-icons/react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";

import { SaveErrorMessage } from "@/components/ui/SaveErrorMessage";
import { dashboardCopy } from "@/copy/dashboard";
import { createSponsor, LEDGER_QUERY_KEY, updateSponsor } from "@/features/sponsoring/api";
import { localDay } from "@/features/sponsoring/donationForm";
import {
  emptySponsorForm,
  type SponsorForm,
  sponsorFormProblems,
  toSponsorForm,
  toSponsorInput,
} from "@/features/sponsoring/sponsorForm";
import { Checkbox } from "@/shared/ui/Checkbox";
import { dialogHeaderIconClass } from "@/shared/ui/Dialog";
import { FormLabel, formInputClass, formTextareaClass } from "@/shared/ui/FormPrimitives";
import { OverlayCard } from "@/shared/ui/OverlayCard";

const messages = dashboardCopy;
const sm = messages.sponsoring;

/** Props of {@link SponsorEditCard}. */
export interface SponsorEditCardProps {
  /** The sponsor to change, or `null` to record a new one. */
  sponsor: Sponsor | null;
  /** Closes the card, after a save or on cancel. */
  onClose: () => void;
}

/**
 * The overlay card that records an annual sponsor or changes one, in the shape
 * the donation card uses for the same job.
 *
 * Save stays off while the backend would refuse a field, and the server's own
 * message appears if it refuses anyway. The amount is shown and never edited,
 * because it is summed from the donations linked to the sponsor.
 *
 * @param props - See {@link SponsorEditCardProps}.
 * @returns The card.
 */
export function SponsorEditCard({ sponsor, onClose }: SponsorEditCardProps) {
  const queryClient = useQueryClient();
  const [form, setForm] = useState<SponsorForm>(() =>
    sponsor ? toSponsorForm(sponsor) : emptySponsorForm(localDay()),
  );
  const problems = sponsorFormProblems(form);
  const title = sponsor ? sm.sponsorEditTitle : sm.sponsorCreateTitle;

  const saveMutation = useMutation({
    mutationFn: (next: SponsorForm) =>
      sponsor ? updateSponsor(sponsor.id, toSponsorInput(next)) : createSponsor(toSponsorInput(next)),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: LEDGER_QUERY_KEY });
      onClose();
    },
  });

  function change(patch: Partial<SponsorForm>) {
    setForm((current) => ({ ...current, ...patch }));
  }

  return (
    <OverlayCard
      open
      onClose={onClose}
      size={{ storageKey: "sponsors:edit-card-size", defaultWidth: 512 }}
      aria-label={title}
    >
      <OverlayCard.Header>
        <div className="flex items-center gap-3">
          <MedalIcon weight="duotone" className={dialogHeaderIconClass} />
          <h2 className="font-semibold text-[var(--ds-text)]">{title}</h2>
        </div>
      </OverlayCard.Header>

      <OverlayCard.Body className="space-y-4">
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <div>
            <FormLabel htmlFor="sponsor-name">{sm.sponsorNameLabel}</FormLabel>
            <input
              id="sponsor-name"
              aria-label={sm.sponsorNameLabel}
              type="text"
              className={formInputClass}
              value={form.name}
              maxLength={SPONSOR_LIMITS.nameMaxLength}
              aria-invalid={(form.name !== "" && problems.has("name")) || undefined}
              onChange={(event) => change({ name: event.target.value })}
            />
            {form.name !== "" && problems.has("name") && (
              <p className="mt-1 text-xs text-amber-400">
                {sm.sponsorNameInvalid.replace("{max}", String(SPONSOR_LIMITS.nameMaxLength))}
              </p>
            )}
          </div>
          <div>
            <FormLabel htmlFor="sponsor-paid-on">{sm.sponsorPaidOnLabel}</FormLabel>
            <input
              id="sponsor-paid-on"
              aria-label={sm.sponsorPaidOnLabel}
              type="date"
              className={formInputClass}
              value={form.paidOn}
              aria-invalid={problems.has("paidOn") || undefined}
              onChange={(event) => change({ paidOn: event.target.value })}
            />
            {problems.has("paidOn") ? (
              <p className="mt-1 text-xs text-amber-400">{sm.dayInvalid}</p>
            ) : (
              <p className="mt-1 text-xs text-[var(--ds-text-muted)]">{sm.sponsorPaidOnHint}</p>
            )}
          </div>
        </div>

        <div>
          <FormLabel htmlFor="sponsor-links">{sm.sponsorLinksLabel}</FormLabel>
          <textarea
            id="sponsor-links"
            aria-label={sm.sponsorLinksLabel}
            className={formTextareaClass}
            rows={3}
            value={form.links}
            spellCheck={false}
            aria-invalid={problems.has("links") || undefined}
            onChange={(event) => change({ links: event.target.value })}
          />
          {problems.has("links") ? (
            <p className="mt-1 text-xs text-amber-400">
              {sm.sponsorLinksInvalid.replace("{max}", String(SPONSOR_LIMITS.linksMaxCount))}
            </p>
          ) : (
            <p className="mt-1 text-xs text-[var(--ds-text-muted)]">{sm.sponsorLinksHint}</p>
          )}
        </div>

        <div>
          <FormLabel htmlFor="sponsor-claim">{sm.sponsorClaimLabel}</FormLabel>
          <textarea
            id="sponsor-claim"
            aria-label={sm.sponsorClaimLabel}
            className={formTextareaClass}
            rows={3}
            value={form.claim}
            maxLength={SPONSOR_LIMITS.claimMaxLength}
            onChange={(event) => change({ claim: event.target.value })}
          />
          {problems.has("claim") && (
            <p className="mt-1 text-xs text-amber-400">
              {sm.tooLong.replace("{max}", String(SPONSOR_LIMITS.claimMaxLength))}
            </p>
          )}
        </div>

        <div>
          <Checkbox
            checked={form.published}
            onChange={(published) => change({ published })}
            label={sm.sponsorPublishedLabel}
          />
          <p className="mt-1 text-xs text-[var(--ds-text-muted)]">{sm.sponsorPublishedHint}</p>
        </div>

        {sponsor && (
          <p className="text-xs text-[var(--ds-text-muted)]">
            <span className="tabular-nums text-[var(--ds-text)]">{formatEuroCents(sponsor.amountCents)}</span>
            {" · "}
            {sm.sponsorAmountHint}
          </p>
        )}

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
