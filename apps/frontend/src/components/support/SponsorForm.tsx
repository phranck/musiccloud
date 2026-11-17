/**
 * @file The sponsor tab's form, which issues a payment reference before the transfer.
 *
 * Ported from lmaa.space (`apps/frontend/src/components/islands/SponsorForm.tsx`
 * and the part of its `SupportLadder.tsx` that switches between the form and
 * the notice after it). A refusal is worded by the form's own texts, as lmaa
 * words it, and followed by the backend's `MC-*` code and error ID, as every
 * musiccloud error is.
 */

import {
  classifyProfileLink,
  formatUserMessage,
  PENDING_SPONSORSHIP_LIMITS,
  type PendingSponsorshipReceipt,
  SPONSOR_FORM_REMAINING_PLACEHOLDER,
  type SponsorFormLabelKey,
} from "@musiccloud/shared";
import { CheckCircleIcon, CircleIcon } from "@phosphor-icons/react";
import { useEffect, useId, useReducer, useRef, useState } from "react";

import { recessedControlInsetClassName } from "@/components/cards/cardGeometry";
import { RecessedCard } from "@/components/cards/RecessedCard";
import { AlertDialog } from "@/components/ui/AlertDialog";
import { EmbossedButton } from "@/components/ui/EmbossedButton";
import { commonCopy } from "@/copy/common";
import {
  type AnnouncedSponsorship,
  type IssuedSponsorship,
  rememberIssuedSponsorship,
} from "@/lib/support/pending-sponsorship-store";
import {
  SponsorshipRequestOutcome,
  type SponsorshipRequestResult,
  sendSponsorshipRequest,
} from "@/lib/support/sponsorships";
import { cn } from "@/lib/utils";

import { eurosToCents } from "./amountInput";
import { LadderField } from "./LadderField";
import { LadderNotice } from "./LadderNotice";
import { LADDER_INPUT_CLASS, ladderFieldLabelId } from "./ladderFieldParts";
import { LadderNoticeTone } from "./ladderNoticeTone";

/** Rows the sentence field shows before it scrolls: 3, which a sentence of the longest allowed length fills. */
const CLAIM_ROWS = 3;

/** Classes of a single-line field of the form, beside {@link LADDER_INPUT_CLASS}. */
const TEXT_INPUT_CLASS = cn(LADDER_INPUT_CLASS, "h-10 px-3 font-semibold");

/**
 * Classes of the note under the name and address fields, which holds `linkHint`
 * or, after a refused address, `linkInvalid`.
 *
 * It is set in the small print of a counter, and it takes back half of the
 * form's row gap, so it reads as belonging to the fields above rather than as a
 * row of its own. The gap is `--mc-gap-rowitem`, which the form's own stack
 * uses, so the note follows that token.
 */
const LINK_NOTE_CLASS = "m-0 -mt-[calc(var(--mc-gap-rowitem,0.75rem)/2)] px-1 text-xs";

/**
 * The status the site answers with when the form was sent too often: `429`.
 * It is answered with `failureRateLimited`, and every other refusal with
 * `failureRejected`.
 */
const TOO_MANY_REQUESTS_STATUS = 429;

/**
 * What somebody has typed, and what the form is doing with it.
 *
 * @property name - The name field, as typed.
 * @property link - The address field, as typed.
 * @property claim - The sentence field, as typed.
 * @property published - Whether the switch for being named is on.
 * @property sending - Set while the site is asked, which is what stops a second ask.
 * @property linkError - What is wrong with the address, shown under the fields; `null` when nothing is.
 * @property failure - Why the ask did not go through, shown in a dialog; `null` while the dialog is closed.
 */
interface FormState {
  name: string;
  link: string;
  claim: string;
  published: boolean;
  sending: boolean;
  linkError: string | null;
  failure: string | null;
}

/**
 * What can happen to the form.
 *
 * - `Edit`: somebody typed into the name or the sentence.
 * - `EditLink`: somebody typed into the address, which also takes back a complaint about it.
 * - `SetPublished`: somebody flipped the switch.
 * - `LinkRefused`: the address cannot be linked, said before anything is sent.
 * - `Sending`: the site is being asked.
 * - `Failed`: the site refused or could not be reached.
 * - `DismissFailure`: the dialog was closed.
 */
const FormActionType = {
  Edit: "edit",
  EditLink: "edit-link",
  SetPublished: "set-published",
  LinkRefused: "link-refused",
  Sending: "sending",
  Failed: "failed",
  DismissFailure: "dismiss-failure",
} as const;

/** Everything that can happen to the form, by {@link FormActionType}. */
type FormAction =
  | { type: typeof FormActionType.Edit; field: "name" | "claim"; value: string }
  | { type: typeof FormActionType.EditLink; value: string }
  | { type: typeof FormActionType.SetPublished; value: boolean }
  | { type: typeof FormActionType.LinkRefused; message: string }
  | { type: typeof FormActionType.Sending }
  | { type: typeof FormActionType.Failed; message: string }
  | { type: typeof FormActionType.DismissFailure };

/**
 * The form as it opens: empty with the switch for being named on, or on what
 * was announced before.
 *
 * @param announced - What was sent last time, when this is a correction.
 * @returns The opening state.
 */
function openingForm(announced: AnnouncedSponsorship | undefined): FormState {
  return {
    name: announced?.name ?? "",
    link: announced?.link ?? "",
    claim: announced?.claim ?? "",
    published: announced?.published ?? true,
    sending: false,
    linkError: null,
    failure: null,
  };
}

/**
 * Moves the form from one state to the next.
 *
 * @param state - Where it stands.
 * @param action - What happened.
 * @returns Where it stands afterwards.
 */
function reduceForm(state: FormState, action: FormAction): FormState {
  switch (action.type) {
    case FormActionType.Edit:
      return { ...state, [action.field]: action.value };
    case FormActionType.EditLink:
      // Typing on answers a complaint about the address, so the complaint goes
      // with the keystroke rather than staying until the next attempt.
      return { ...state, link: action.value, linkError: null };
    case FormActionType.SetPublished:
      return { ...state, published: action.value };
    case FormActionType.LinkRefused:
      return { ...state, linkError: action.message };
    case FormActionType.Sending:
      return { ...state, sending: true, linkError: null };
    case FormActionType.Failed:
      return { ...state, sending: false, failure: action.message };
    case FormActionType.DismissFailure:
      return { ...state, failure: null };
  }
}

/**
 * What the dialog says about a refusal.
 *
 * A visitor over the rate limit reads `failureRateLimited` and any other
 * refusal reads `failureRejected`. The backend's `MC-*` code follows in
 * parentheses and its error ID after that, the way every musiccloud error ends,
 * so the sentence can be quoted in a report and found in the logs. Either is
 * left out where the answer did not carry it.
 *
 * @param refusal - The refusal, with its status, code and error ID.
 * @param text - The form's words.
 * @returns The sentence, such as `That did not work. Please check your details and try again. (MC-REQ-0013) Error ID: …`.
 */
function describeRefusal(
  refusal: Extract<SponsorshipRequestResult, { outcome: typeof SponsorshipRequestOutcome.Refused }>,
  text: Record<SponsorFormLabelKey, string>,
): string {
  const sentence = refusal.status === TOO_MANY_REQUESTS_STATUS ? text.failureRateLimited : text.failureRejected;
  const coded = refusal.code ? formatUserMessage(refusal.code, undefined, sentence) : sentence;
  return refusal.errorId ? commonCopy.error.withErrorId(coded, refusal.errorId) : coded;
}

/**
 * Remembers a receipt the site has just answered with, with the moment it happened.
 *
 * The moment is taken here rather than from the server, because what it
 * decides is when this browser stops showing the reference, and that is a
 * decision about this browser. A correction is stamped anew like a new
 * reference, so the browser keeps the reference `PENDING_SPONSORSHIP_DAYS`
 * after the form was last sent. The backend restarts its own count on a
 * correction as well, so the two let go of the reference together.
 *
 * @param receipt - The reference the site answered with.
 * @param announced - What was sent under it.
 */
function keepReceipt(receipt: PendingSponsorshipReceipt, announced: AnnouncedSponsorship): void {
  rememberIssuedSponsorship({
    reference: receipt.reference,
    referenceFormatted: receipt.referenceFormatted,
    issuedAt: Date.now(),
    announced,
  });
}

/** Props of {@link SponsorForm}. */
interface SponsorFormProps {
  /** What the ladder stands on, in euros, which is the amount the GiroCode carries and so the one announced. */
  amountEur: number;
  /** Whether that amount reaches the sponsor minimum. Below it the button stays unavailable. */
  earnsSponsorship: boolean;
  /** The reference and what was sent under it, when this corrects an announcement. Absent asks for a new reference. */
  correcting?: IssuedSponsorship;
  /** Every word of the form, the page's own merged over the defaults. */
  text: Record<SponsorFormLabelKey, string>;
  /** Told the receipt once the site has answered with one, along with what was sent. */
  onIssued: (receipt: PendingSponsorshipReceipt, announced: AnnouncedSponsorship) => void;
}

/**
 * The form that takes what a transfer cannot carry.
 *
 * A SEPA transfer holds either a sentence or a reference, never both, and the
 * sentence is the half a banking app may let the payer edit and a bank may
 * fold. So the name, the address, the sentence and the answer about being
 * named are given here, and the transfer carries only the reference this asks
 * for.
 *
 * The address is one field rather than one per service. Which service it
 * belongs to is worked out from the address, here so a mistyped one is
 * answered at once, and again on the server, which decides. Everything is
 * required, so the button stays unavailable until everything is there and the
 * amount reaches the sponsor minimum. The first field takes the caret when the
 * form appears, because the form only exists on the tab somebody chose.
 *
 * @param props - See {@link SponsorFormProps}.
 * @returns The form.
 */
function SponsorForm({ amountEur, earnsSponsorship, correcting, text, onIssued }: SponsorFormProps) {
  const [form, dispatch] = useReducer(reduceForm, correcting?.announced, openingForm);
  const nameId = useId();
  const linkId = useId();
  const claimId = useId();
  const linkNoteId = useId();
  const firstFieldRef = useRef<HTMLInputElement>(null);

  // Scrolling is left alone, because the click that opened the tab may still be
  // scrolling the page towards it, and a focus that scrolled as well would land
  // somewhere neither meant.
  useEffect(() => {
    firstFieldRef.current?.focus({ preventScroll: true });
  }, []);

  const remaining = PENDING_SPONSORSHIP_LIMITS.claimMaxLength - form.claim.length;
  const complete = earnsSponsorship && form.name.trim() !== "" && form.link.trim() !== "" && form.claim.trim() !== "";

  async function submit() {
    if (form.sending) return;
    const announced: AnnouncedSponsorship = {
      name: form.name.trim(),
      link: form.link.trim(),
      claim: form.claim.trim(),
      published: form.published,
    };
    if (!classifyProfileLink(announced.link)) {
      dispatch({ type: FormActionType.LinkRefused, message: text.linkInvalid });
      return;
    }

    dispatch({ type: FormActionType.Sending });
    // What stands on the ladder at this moment, which is what the code beside
    // the form carries. Whether that is what arrives is settled against the
    // statement rather than here.
    const result = await sendSponsorshipRequest(
      { ...announced, amountCents: eurosToCents(amountEur) },
      correcting?.reference,
    );
    switch (result.outcome) {
      case SponsorshipRequestOutcome.Issued:
        // Nothing is dispatched afterwards: the notice replaces the form the
        // moment the ladder has the reference.
        onIssued(result.receipt, announced);
        return;
      case SponsorshipRequestOutcome.Refused:
        dispatch({ type: FormActionType.Failed, message: describeRefusal(result, text) });
        return;
      case SponsorshipRequestOutcome.Unreachable:
        dispatch({ type: FormActionType.Failed, message: text.failureOffline });
    }
  }

  return (
    <form
      aria-label={text.submitLabel}
      className="flex flex-col gap-[var(--mc-gap-rowitem,0.75rem)]"
      onSubmit={(event) => {
        event.preventDefault();
        void submit();
      }}
    >
      {/* The two answers about the person stand in one row of equal columns,
          so neither reads as the important one, and stack on a narrow screen. */}
      <div className="grid gap-[var(--mc-gap-rowitem,0.75rem)] sm:grid-cols-2">
        <LadderField controlId={nameId} label={text.nameLabel} required>
          <input
            ref={firstFieldRef}
            id={nameId}
            aria-labelledby={ladderFieldLabelId(nameId)}
            className={TEXT_INPUT_CLASS}
            value={form.name}
            maxLength={PENDING_SPONSORSHIP_LIMITS.nameMaxLength}
            required
            autoComplete="name"
            onChange={(event) => dispatch({ type: FormActionType.Edit, field: "name", value: event.target.value })}
          />
        </LadderField>
        <LadderField controlId={linkId} label={text.linkLabel} required>
          <input
            id={linkId}
            aria-labelledby={ladderFieldLabelId(linkId)}
            className={TEXT_INPUT_CLASS}
            value={form.link}
            maxLength={PENDING_SPONSORSHIP_LIMITS.linkMaxLength}
            required
            inputMode="url"
            autoComplete="url"
            placeholder={text.linkPlaceholder}
            aria-describedby={linkNoteId}
            aria-invalid={form.linkError !== null}
            onChange={(event) => dispatch({ type: FormActionType.EditLink, value: event.target.value })}
          />
        </LadderField>
      </div>

      <p
        id={linkNoteId}
        role={form.linkError ? "alert" : undefined}
        className={cn(LINK_NOTE_CLASS, form.linkError ? "text-error" : "text-text-secondary")}
      >
        {form.linkError ?? text.linkHint}
      </p>

      <LadderField
        controlId={claimId}
        label={text.claimLabel}
        required
        counter={text.claimRemaining.replaceAll(SPONSOR_FORM_REMAINING_PLACEHOLDER, String(remaining))}
      >
        <textarea
          id={claimId}
          aria-labelledby={ladderFieldLabelId(claimId)}
          className={cn(LADDER_INPUT_CLASS, "resize-none px-3 py-2 font-semibold")}
          rows={CLAIM_ROWS}
          value={form.claim}
          maxLength={PENDING_SPONSORSHIP_LIMITS.claimMaxLength}
          required
          onChange={(event) => dispatch({ type: FormActionType.Edit, field: "claim", value: event.target.value })}
        />
      </LadderField>

      {/* The last decision and the button that acts on it share one row, with
          the button where a form ends, and stack on a narrow screen. */}
      <div className="flex flex-wrap items-center justify-between gap-[var(--mc-gap-rowitem,0.75rem)]">
        <RecessedCard className={recessedControlInsetClassName}>
          <EmbossedButton
            as="button"
            role="switch"
            aria-checked={form.published}
            pressed={form.published}
            onClick={() => dispatch({ type: FormActionType.SetPublished, value: !form.published })}
            className="flex items-center gap-2 text-sm font-semibold text-text-primary"
          >
            {form.published ? (
              <CheckCircleIcon weight="fill" aria-hidden="true" className="size-4 text-success" />
            ) : (
              <CircleIcon weight="regular" aria-hidden="true" className="size-4 text-text-secondary" />
            )}
            {text.publishedLabel}
          </EmbossedButton>
        </RecessedCard>
        <RecessedCard className={cn(recessedControlInsetClassName, "max-sm:w-full")}>
          <EmbossedButton
            as="button"
            type="submit"
            disabled={form.sending || !complete}
            className="w-full text-sm font-semibold text-text-primary"
          >
            {form.sending ? text.submitBusyLabel : text.submitLabel}
          </EmbossedButton>
        </RecessedCard>
      </div>

      <AlertDialog
        open={form.failure !== null}
        title={text.failureTitle}
        message={form.failure ?? ""}
        closeLabel={text.failureClose}
        onClose={() => dispatch({ type: FormActionType.DismissFailure })}
      />
    </form>
  );
}

/** Props of {@link SponsorStep}. */
export interface SponsorStepProps {
  /** The reference this browser holds, or `null` before one is issued. */
  issued: IssuedSponsorship | null;
  /** What the ladder stands on, in euros. */
  amountEur: number;
  /** Whether that amount reaches the sponsor minimum. */
  earnsSponsorship: boolean;
  /** Every word of the form, the page's own merged over the defaults. */
  text: Record<SponsorFormLabelKey, string>;
}

/**
 * What the sponsor tab asks between the amount and the transfer.
 *
 * Before a reference exists it is the form. Once one exists it is a notice that
 * the transfer now carries it, with a button that opens the form again on what
 * was sent. A correction writes to the same reference rather than asking for a
 * second one, because the first may already stand in a banking app.
 *
 * @param props - See {@link SponsorStepProps}.
 * @returns The form or the notice.
 */
export function SponsorStep({ issued, amountEur, earnsSponsorship, text }: SponsorStepProps) {
  const [correcting, setCorrecting] = useState(false);

  if (issued && !correcting) {
    return (
      // In the success tone, because it says something has already happened
      // rather than something to read before acting.
      <LadderNotice tone={LadderNoticeTone.Success}>
        <div className="flex flex-col gap-[var(--mc-gap-rowitem,0.75rem)]">
          <div>
            <p className="m-0 font-semibold">{text.issuedTitle}</p>
            <p className="m-0 text-text-muted">{text.issuedText}</p>
          </div>
          <div className="flex justify-end">
            <EmbossedButton
              as="button"
              onClick={() => setCorrecting(true)}
              className="text-sm font-semibold text-text-primary"
            >
              {text.changeLabel}
            </EmbossedButton>
          </div>
        </div>
      </LadderNotice>
    );
  }

  return (
    <SponsorForm
      amountEur={amountEur}
      earnsSponsorship={earnsSponsorship}
      correcting={issued ?? undefined}
      text={text}
      onIssued={(receipt, announced) => {
        keepReceipt(receipt, announced);
        setCorrecting(false);
      }}
    />
  );
}
