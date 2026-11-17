/**
 * @file The transfer card: who is paid, how much and what for, with its GiroCode.
 */

import {
  buildEpcQrPayload,
  groupIban,
  type SupportLadderLabelKey,
  type SupportLadderPayee,
  type SupportLadderQrStyle,
  type SupportLadderVariant,
} from "@musiccloud/shared";
import { useMemo } from "react";

import { RecessedCard } from "@/components/cards/RecessedCard";

import { CopyValueButton } from "./CopyValueButton";
import { GiroCode } from "./GiroCode";
import { LadderCardHead } from "./LadderCardHead";
import { LadderNotice } from "./LadderNotice";
import { LadderRichText } from "./LadderRichText";

/**
 * One line of the card.
 *
 * @property label - What the line is, such as "IBAN".
 * @property value - What the line shows.
 * @property copy - What its button copies, which may differ from what it shows; no button where absent.
 */
interface TransferLine {
  label: string;
  value: string;
  copy?: string;
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
  /** What the transfer's purpose says. */
  remittance: string;
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
  showQr,
  text,
}: TransferCardProps) {
  const payload = useMemo(() => {
    if (!showQr) return null;
    try {
      return buildEpcQrPayload({
        beneficiaryName: payee.name,
        iban: payee.iban,
        bic: payee.bic,
        amountEur: amountEur > 0 ? amountEur : undefined,
        remittance,
      });
    } catch {
      return null;
    }
  }, [showQr, payee, amountEur, remittance]);

  const amountLine = amountEur > 0 ? `${amountText}${monthly ? ` ${text.perMonth}` : ""}` : text.amountOpen;
  const lines: TransferLine[] = [
    { label: text.fieldName, value: payee.name, copy: payee.name },
    { label: text.fieldIban, value: groupIban(payee.iban), copy: payee.iban },
    ...(payee.bic ? [{ label: text.fieldBic, value: payee.bic, copy: payee.bic }] : []),
    ...(remittance ? [{ label: text.fieldPurpose, value: remittance, copy: remittance }] : []),
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
                <dd className="m-0 min-w-0 break-all font-mono font-semibold text-text-primary">{line.value}</dd>
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
