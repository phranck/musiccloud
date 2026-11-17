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

import { RecessedCard } from "@/components/cards/RecessedCard";
import { cn } from "@/lib/utils";

import { CopyValueButton } from "./CopyValueButton";
import { GiroCode } from "./GiroCode";
import { LadderCardHead } from "./LadderCardHead";
import { LadderNotice } from "./LadderNotice";
import { LadderRichText } from "./LadderRichText";

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
 * @property copy - What its button copies, which may differ from what it shows; no button where absent.
 * @property missing - What the line is read out as while its value is only a mask, and which marks it as
 *   missing; absent for a line with a real value.
 */
interface TransferLine {
  label: string;
  value: string;
  copy?: string;
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
   * line: on the sponsor tab with a form, at or above the sponsor minimum.
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
 * Every line is one a reader copies into a banking app, so each has a copy
 * button and is set in a monospaced face to compare character by character.
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
    ? { label: text.fieldReference, value: issued.referenceFormatted, copy: issued.reference }
    : { label: text.fieldReference, value: REFERENCE_MASK, missing: text.referenceMissing };
  const lines: TransferLine[] = [
    { label: text.fieldName, value: payee.name, copy: payee.name },
    { label: text.fieldIban, value: groupIban(payee.iban), copy: payee.iban },
    ...(payee.bic ? [{ label: text.fieldBic, value: payee.bic, copy: payee.bic }] : []),
    ...(purpose ? [{ label: text.fieldPurpose, value: purpose, copy: purpose }] : []),
    ...(referenceLine ? [reference] : []),
    { label: text.fieldAmount, value: amountLine, copy: amountEur > 0 ? amountEur.toFixed(2) : undefined },
  ];

  return (
    <RecessedCard className="flex flex-col gap-[var(--mc-gap-rowitem,0.75rem)]">
      <LadderCardHead title={variant.title} icon={variant.icon} />
      <LadderRichText html={variant.text} className="text-sm text-text-secondary" />

      <div className="flex flex-wrap items-start gap-[var(--mc-gap-cards,1.5rem)]">
        {payload && <GiroCode payload={payload} style={qr} label={text.qrAlt} />}
        <div className="flex min-w-[16rem] flex-1 flex-col gap-[var(--mc-gap-rowitem,0.75rem)]">
          <dl className="grid grid-cols-[auto_1fr_auto] items-center gap-x-[var(--mc-gap-rowitem,0.75rem)] gap-y-1 text-sm">
            {lines.map((line) => (
              <div key={line.label} className="contents">
                <dt className="text-text-muted">{line.label}</dt>
                <dd
                  className={cn(
                    "m-0 min-w-0 break-all font-mono font-semibold",
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
                {line.copy ? (
                  <CopyValueButton
                    value={line.copy}
                    label={line.label}
                    copyLabel={text.copy}
                    copiedLabel={text.copied}
                  />
                ) : (
                  <span />
                )}
              </div>
            ))}
          </dl>
          {variant.info && (
            <LadderNotice>
              <LadderRichText html={variant.info} />
            </LadderNotice>
          )}
        </div>
      </div>
    </RecessedCard>
  );
}
