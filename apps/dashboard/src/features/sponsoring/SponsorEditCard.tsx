import {
  DashboardActionButton,
  DashboardActionId,
  DashboardActionStatus,
  DashboardButtonVariant,
} from "@musiccloud/dashboard-ui";
import { SocialMediaEditor, type SocialMediaEditorMessages } from "@musiccloud/dashboard-ui/social-media";
import { formatEuroCents, type SocialMediaLinks, SPONSOR_LIMITS, type Sponsor } from "@musiccloud/shared";
import { MedalIcon } from "@phosphor-icons/react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useRef, useState } from "react";

import { SaveErrorMessage } from "@/components/ui/SaveErrorMessage";
import { dashboardCopy } from "@/copy/dashboard";
import { createSponsor, LEDGER_QUERY_KEY, resolveSponsorAvatar, updateSponsor } from "@/features/sponsoring/api";
import { localDay } from "@/features/sponsoring/donationForm";
import { SponsorPictureEditor } from "@/features/sponsoring/SponsorPictureEditor";
import {
  emptySponsorForm,
  type SponsorForm,
  sponsorFormProblems,
  toSponsorForm,
  toSponsorInput,
} from "@/features/sponsoring/sponsorForm";
import { canFetchPicture, lookupKey, shouldFetchPicture } from "@/features/sponsoring/sponsorPictureLookup";
import { Checkbox } from "@/shared/ui/Checkbox";
import { dialogHeaderIconClass } from "@/shared/ui/Dialog";
import { FormLabel, FormLabelText, formInputClass, formTextareaClass } from "@/shared/ui/FormPrimitives";
import { OverlayCard } from "@/shared/ui/OverlayCard";

const messages = dashboardCopy;
const sm = messages.sponsoring;

/** The social media editor's copy, with the platform's name put into the invalid-address message. */
const SOCIAL_MEDIA_EDITOR_MESSAGES: SocialMediaEditorMessages = {
  ...sm.sponsorSocialMediaEditor,
  invalidUrlMessage: (platformLabel) =>
    sm.sponsorSocialMediaEditor.invalidUrlMessage.replace("{platform}", platformLabel),
};

/** Props of {@link SponsorEditCard}. */
export interface SponsorEditCardProps {
  /** The sponsor to change, or `null` to record a new one. */
  sponsor: Sponsor | null;
  /** Closes the card, after a save or on cancel. */
  onClose: () => void;
}

/**
 * The overlay card that records an annual sponsor or changes one, laid out as
 * lmaa.space's sponsor editor: the picture stands on the left with the
 * buttons that change it, everything a visitor reads stands on the right.
 *
 * The picture is looked up as the profiles are entered rather than when the
 * card is saved, and what comes back is the id of a copy musiccloud stored, so
 * no visitor's browser asks a sponsor's host for anything. Save stays off while
 * the backend would refuse a field. The amount is shown and never edited,
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
  const [pictureMissing, setPictureMissing] = useState(false);
  /** What the last lookup asked about, so the same question is not asked twice. */
  const lastLookup = useRef(sponsor ? lookupKey(sponsor.socialMedia) : "");
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

  // Writes a row of `sponsor_avatars`, which no query reads: the copy is only
  // referenced once the card is saved, and the save mutation invalidates the
  // ledger then. There is no cache to synchronize here.
  // react-doctor-disable-next-line react-doctor/query-mutation-missing-invalidation
  const avatarMutation = useMutation({
    mutationFn: (socialMedia: SocialMediaLinks) => resolveSponsorAvatar(socialMedia),
    onSuccess: (result) => {
      if (result.avatarId) change({ avatarId: result.avatarId });
      else setPictureMissing(true);
    },
  });

  function change(patch: Partial<SponsorForm>) {
    setForm((current) => ({ ...current, ...patch }));
  }

  function fetchPicture(socialMedia: SocialMediaLinks) {
    lastLookup.current = lookupKey(socialMedia);
    setPictureMissing(false);
    avatarMutation.mutate(socialMedia);
  }

  function handleSocialMediaChange(socialMedia: SocialMediaLinks) {
    change({ socialMedia });
    if (shouldFetchPicture(socialMedia, lastLookup.current)) fetchPicture(socialMedia);
  }

  return (
    <OverlayCard
      open
      onClose={onClose}
      size={{ storageKey: "sponsors:edit-card-size", defaultWidth: 780 }}
      aria-label={title}
    >
      <OverlayCard.Header>
        <div className="flex items-center gap-3">
          <MedalIcon weight="duotone" className={dialogHeaderIconClass} />
          <h2 className="font-semibold text-[var(--ds-text)]">{form.name.trim() || title}</h2>
        </div>
      </OverlayCard.Header>

      <OverlayCard.Body>
        <div className="flex items-start gap-6">
          <div className="flex flex-col items-center gap-2">
            <SponsorPictureEditor
              avatarId={form.avatarId}
              displayName={form.name || title}
              canFetch={canFetchPicture(form.socialMedia)}
              isFetching={avatarMutation.isPending}
              onFetch={() => fetchPicture(form.socialMedia)}
              onRemove={() => change({ avatarId: null })}
            />
            {pictureMissing && <p className="w-40 text-center text-xs text-amber-400">{sm.sponsorNoPictureFound}</p>}
            {avatarMutation.isError && <SaveErrorMessage error={avatarMutation.error} />}
          </div>

          <div className="flex min-w-0 flex-1 flex-col gap-4">
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

            <fieldset className="min-w-0" aria-labelledby="sponsor-social-media">
              <FormLabelText id="sponsor-social-media">{sm.sponsorSocialMediaLabel}</FormLabelText>
              <SocialMediaEditor
                value={form.socialMedia}
                onChange={handleSocialMediaChange}
                messages={SOCIAL_MEDIA_EDITOR_MESSAGES}
                blurOnPaste
              />
              {problems.has("socialMedia") ? (
                <p className="mt-1 text-xs text-amber-400">
                  {sm.sponsorSocialMediaInvalid.replace("{max}", String(SPONSOR_LIMITS.socialMediaMaxCount))}
                </p>
              ) : (
                <p className="mt-1 text-xs text-[var(--ds-text-muted)]">{sm.sponsorSocialMediaHint}</p>
              )}
            </fieldset>

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
          </div>
        </div>
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
          disabled={problems.size > 0 || saveMutation.isPending || avatarMutation.isPending}
          onClick={() => saveMutation.mutate(form)}
          size="control"
          status={saveMutation.isPending ? DashboardActionStatus.Busy : DashboardActionStatus.Idle}
          type="button"
        />
      </OverlayCard.Footer>
    </OverlayCard>
  );
}
