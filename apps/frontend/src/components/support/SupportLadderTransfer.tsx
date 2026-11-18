/**
 * @file The transfer card: who is paid, how much and what for, with its GiroCode.
 */

import {
  buildEpcQrPayload,
  formatCreditorReference,
  groupIban,
  type PendingSponsorshipReceipt,
  SPONSORSHIP_REFERENCE_RANDOM_LENGTH,
  SPONSORSHIP_REFERENCE_TAG,
  type SupportLadderLabelKey,
  type SupportLadderPayee,
  type SupportLadderQrStyle,
  type SupportLadderVariant,
} from "@musiccloud/shared";
import { useMemo } from "react";

import { ContentCard } from "@/components/cards/ContentCard";
import { cn } from "@/lib/utils";

import { GiroCode } from "./GiroCode";
import { LadderCardHead } from "./LadderCardHead";
import { LadderNotice } from "./LadderNotice";
import { LadderRichText } from "./LadderRichText";
import { SUPPORT_TEXT_CLASS } from "./supportType";

/** What every creditor reference opens with before its tag: `RF` and two check digits, 4 characters. */
const CREDITOR_REFERENCE_PREFIX_LENGTH = 4;

/** The character the reference line is masked with before a reference exists. */
const REFERENCE_MASK_CHARACTER = "X";

/**
 * The reference line before there is a reference: as many masked characters as
 * a finished reference holds, in the same groups of four. The row keeps its
 * width when the real value arrives, and a line that is visibly missing is what
 * sends somebody to the form above it.
 */
const REFERENCE_MASK = formatCreditorReference(
  REFERENCE_MASK_CHARACTER.repeat(
    CREDITOR_REFERENCE_PREFIX_LENGTH + SPONSORSHIP_REFERENCE_TAG.length + SPONSORSHIP_REFERENCE_RANDOM_LENGTH,
  ),
);

/**
 * One line of the card.
 *
 * @property label - What the line is, such as "IBAN".
 * @property value - What the line shows.
 * @property missing - What the line is read out as while its value is only a mask, and which marks it as
 *   missing; absent for a line with a real value.
 */
interface TransferLine {
  label: string;
  value: string;
  missing?: string;
}

/** Props of {@link TransferCard}. */
export interface TransferCardProps {
  /** How the card presents itself on the tab in view. */
  variant: SupportLadderVariant;
  /** How the GiroCode looks, which a tab naming none borrows from the single payment. */
  qr: SupportLadderQrStyle | undefined;
  /** Who is paid, from the sponsoring settings. */
  payee: SupportLadderPayee;
  /** The amount the transfer carries, in euros; 0 leaves it to the reader. */
  amountEur: number;
  /** The amount as the site writes it. */
  amountText: string;
  /** Whether the tab is the monthly one, which names a month after the amount. */
  monthly: boolean;
  /** What the transfer's purpose says where it carries no reference. */
  remittance: string;
  /**
   * Whether the transfer announces a sponsorship and so carries a reference
   * line: on a tab whose variant holds a sponsor form, at or above the sponsor minimum.
   */
  referenceLine: boolean;
  /** The reference this browser was issued, or `null` before one exists, which masks the line. */
  issued: PendingSponsorshipReceipt | null;
  /** Whether a GiroCode is drawn, which a standing order cannot carry. */
  showQr: boolean;
  /** The ladder's wording, merged with its defaults. */
  text: Record<SupportLadderLabelKey, string>;
}

/**
 * The account to pay into, with the GiroCode beside it.
 *
 * Every line is one a reader types into a banking app, so each is set in a
 * monospaced face to compare character by character.
 * The GiroCode carries the same details; where they cannot form a valid code,
 * the code is left out and the lines remain.
 *
 * Where the transfer announces a sponsorship, a reference line stands in the
 * card from the start, masked until the form above has issued a reference. Once
 * there is one, the reference replaces the purpose in the lines and in the
 * code, because a transfer carries one of the two and never both, and the
 * reference is the half that survives the banks in between.
 *
 * @param props - See {@link TransferCardProps}.
 * @returns The card.
 */
export function TransferCard({
  variant,
  qr,
  payee,
  amountEur,
  amountText,
  monthly,
  remittance,
  referenceLine,
  issued,
  showQr,
  text,
}: TransferCardProps) {
  const creditorReference = referenceLine ? issued?.reference : undefined;
  const purpose = creditorReference ? "" : remittance;

  const payload = useMemo(() => {
    if (!showQr) return null;
    try {
      return buildEpcQrPayload({
        beneficiaryName: payee.name,
        iban: payee.iban,
        bic: payee.bic,
        amountEur: amountEur > 0 ? amountEur : undefined,
        remittance: purpose,
        creditorReference,
      });
    } catch {
      return null;
    }
  }, [showQr, payee, amountEur, purpose, creditorReference]);

  const amountLine = amountEur > 0 ? `${amountText}${monthly ? ` ${text.perMonth}` : ""}` : text.amountOpen;
  const reference: TransferLine = issued
    ? { label: text.fieldReference, value: issued.referenceFormatted }
    : { label: text.fieldReference, value: REFERENCE_MASK, missing: text.referenceMissing };
  const lines: TransferLine[] = [
    { label: text.fieldName, value: payee.name },
    { label: text.fieldIban, value: groupIban(payee.iban) },
    ...(payee.bic ? [{ label: text.fieldBic, value: payee.bic }] : []),
    ...(purpose ? [{ label: text.fieldPurpose, value: purpose }] : []),
    ...(referenceLine ? [reference] : []),
    { label: text.fieldAmount, value: amountLine },
  ];

  // The distances are lmaa.space's: the text close under the heading, the code
  // and its column the widest step below it and from each other, and at least
  // a step between the lines and the notice.
  return (
    <ContentCard className="flex flex-col">
      <LadderCardHead title={variant.title} icon={variant.icon} />
      <LadderRichText html={variant.text} className={cn("mt-[var(--mc-support-step-1)]", SUPPORT_TEXT_CLASS)} />

      <div className="mt-[var(--mc-support-step-6)] flex flex-wrap gap-[var(--mc-support-step-6)]">
        {/* The code sits at the foot of the row and the notice at the foot of
            the column, which stretches to the row, so the two always end on
            one line, whichever of them is taller. */}
        {payload && (
          <div className="self-end">
            <GiroCode payload={payload} style={qr} label={text.qrAlt} />
          </div>
        )}
        <div className="flex min-w-[var(--mc-support-column-min)] flex-1 flex-col">
          <dl className="grid grid-cols-[auto_1fr] content-start gap-x-[var(--mc-support-step-6)] gap-y-[var(--mc-support-step-0-5)] text-lg leading-[1.35]">
            {lines.map((line) => (
              <div key={line.label} className="contents">
                <dt className="text-[var(--mc-text-card)]">{line.label}</dt>
                {/* Monospaced, because these are figures somebody copies into a
                    banking app and compares character by character; 0.92em
                    takes back the width the face gains over the text, as
                    lmaa.space sets it. */}
                <dd
                  className={cn(
                    "m-0 min-w-0 break-all font-mono text-[0.92em] font-semibold",
                    line.missing ? "text-error" : "text-text-primary",
                  )}
                >
                  {/* A masked line is meaningless read out, so what it stands for is said instead. */}
                  {line.missing ? (
                    <>
                      <span aria-hidden="true">{line.value}</span>
                      <span className="sr-only">{line.missing}</span>
                    </>
                  ) : (
                    line.value
                  )}
                </dd>
              </div>
            ))}
          </dl>
          {variant.info && (
            <div className="mt-auto pt-[var(--mc-support-step-4)]">
              <LadderNotice>
                <LadderRichText html={variant.info} />
              </LadderNotice>
            </div>
          )}
        </div>
      </div>
    </ContentCard>
  );
}
