/**
 * @file What the dashboard says about the bank connection in one word, and the
 * tone it says it in, ported from lmaa.space
 * (`apps/dashboard/src/features/system/bank-connection/bank-connection-state.ts`
 * and `bank-connection-colors.ts`).
 */

import { StatusTone, type StatusToneValue } from "@musiccloud/dashboard-ui";
import { BANK_CONSENT_NOTICE_DAYS, type BankConnectionStatus, DAY_MS } from "@musiccloud/shared";

/**
 * The states the bank connection is shown in.
 *
 * - `unconfigured`: the deployment holds no credential at all, which is a
 *   different thing from holding one and not having connected with it.
 * - `disconnected`: no connection is in force.
 * - `expired`: the consent has lapsed.
 * - `expiring`: the consent lapses within {@link BANK_CONSENT_NOTICE_DAYS} `soon` days.
 * - `connected`: a connection is in force and its consent is far off or has no end date.
 */
export const BankConnectionState = {
  Unconfigured: "unconfigured",
  Disconnected: "disconnected",
  Expired: "expired",
  Expiring: "expiring",
  Connected: "connected",
} as const;

/** A {@link BankConnectionState} member value. */
export type BankConnectionStateValue = (typeof BankConnectionState)[keyof typeof BankConnectionState];

/**
 * The tone each state carries.
 *
 * These are the tones read for their own meaning rather than borrowed: a live
 * connection is in force, a consent about to lapse is waiting on somebody, and
 * one that has lapsed is gone. Not connected is the ordinary starting point and
 * takes the neutral badge, which says as much.
 */
export const BANK_CONNECTION_STATE_TONES: Readonly<Record<BankConnectionStateValue, StatusToneValue>> = {
  [BankConnectionState.Unconfigured]: StatusTone.Neutral,
  [BankConnectionState.Disconnected]: StatusTone.Neutral,
  [BankConnectionState.Expired]: StatusTone.Danger,
  [BankConnectionState.Expiring]: StatusTone.Warning,
  [BankConnectionState.Connected]: StatusTone.Success,
};

/**
 * Works out which of the states the connection is in.
 *
 * @param status - What the backend reports, straight from its own database.
 * @param now - The moment to measure the consent against.
 * @returns The state, which decides both the wording and the tone.
 *
 * @remarks
 * A connection whose consent carries no end date, or one that cannot be read,
 * counts as connected. The date is what the bank said when it granted the
 * consent, and its absence says nothing was promised rather than that
 * something ran out. The warning window is the one the backend's notices to the
 * owner open at, read from the same shared number.
 */
export function resolveBankConnectionState(status: BankConnectionStatus, now: Date): BankConnectionStateValue {
  if (!status.configured) return BankConnectionState.Unconfigured;
  if (!status.connected) return BankConnectionState.Disconnected;
  if (!status.consentValidUntil) return BankConnectionState.Connected;

  const remainingMs = new Date(status.consentValidUntil).getTime() - now.getTime();
  if (Number.isNaN(remainingMs)) return BankConnectionState.Connected;
  if (remainingMs <= 0) return BankConnectionState.Expired;
  if (remainingMs < BANK_CONSENT_NOTICE_DAYS.soon * DAY_MS) return BankConnectionState.Expiring;
  return BankConnectionState.Connected;
}
