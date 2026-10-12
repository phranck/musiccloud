/**
 * @file What a status badge says and which tone it takes, without drawing it.
 *
 * The dashboard and the developer portal show the states of accounts,
 * projects, applications and tokens. Both read the tone from here, so a state
 * looks the same on either surface and in every list.
 */
import type { DeveloperAccessStatusValue } from "@musiccloud/shared";

/** The four tones a status can take. */
export const StatusTone = {
  /** Working as intended. */
  Success: "success",
  /** Stopped for now and reversible. */
  Warning: "warning",
  /** Gone for good. */
  Danger: "danger",
  /** Historical, or a state this table does not know. */
  Neutral: "neutral",
} as const;

/** A {@link StatusTone} member value. */
export type StatusToneValue = (typeof StatusTone)[keyof typeof StatusTone];

/**
 * The tone of every state. A word means the same thing in every lifecycle, so
 * a suspended account and a suspended application share one tone.
 */
const STATUS_TONES: Readonly<Record<DeveloperAccessStatusValue, StatusToneValue>> = {
  active: StatusTone.Success,
  suspended: StatusTone.Warning,
  revoked: StatusTone.Danger,
  deleted: StatusTone.Danger,
  rotated: StatusTone.Neutral,
};

/**
 * The tone a status is shown in.
 *
 * @param status - A status as a response carries it.
 * @returns Its tone, and {@link StatusTone.Neutral} for a state not in the table.
 */
export function statusTone(status: string): StatusToneValue {
  return Object.hasOwn(STATUS_TONES, status) ? STATUS_TONES[status as DeveloperAccessStatusValue] : StatusTone.Neutral;
}

/**
 * The class names the badge puts on its element.
 *
 * The badge names no color. Each app writes a rule per tone against these
 * names from its own tokens, the way it paints the usage chart.
 */
export const StatusBadgeClass = {
  Root: "mc-status-badge",
  [StatusTone.Success]: "mc-status-badge--success",
  [StatusTone.Warning]: "mc-status-badge--warning",
  [StatusTone.Danger]: "mc-status-badge--danger",
  [StatusTone.Neutral]: "mc-status-badge--neutral",
} as const;

/** Props for the status badge. */
export interface StatusBadgeProps {
  /** The status of an account, a project, an application or a token, as a response carries it. */
  status: string;
}
