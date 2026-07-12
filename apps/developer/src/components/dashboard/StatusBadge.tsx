import { AccessRequestStatus, ApiClientStatus, ApiTokenStatus } from "@/lib/apiAccessClient";

/**
 * Visual tone classes per known status value, computed-keyed by the domain
 * namespaces so no inline discriminant literal appears. Client/token
 * statuses share wire values with each other ("active"/"revoked"), so the
 * map naturally covers both.
 */
const TONE_CLASS: Record<string, string> = {
  [AccessRequestStatus.Pending]: "status-pill--warning",
  [AccessRequestStatus.Approved]: "status-pill--success",
  [AccessRequestStatus.Rejected]: "status-pill--danger",
  [AccessRequestStatus.Archived]: "",
  [ApiClientStatus.Active]: "status-pill--success",
  [ApiClientStatus.Suspended]: "status-pill--warning",
  [ApiClientStatus.Revoked]: "status-pill--danger",
  [ApiTokenStatus.Rotated]: "",
};

/** Fallback tone for a status value the frontend does not know yet. */
const NEUTRAL_TONE_CLASS = "";

/**
 * Props for {@link StatusBadge}.
 */
export interface StatusBadgeProps {
  /** The wire status value (request, client, or token status). */
  status: string;
}

/**
 * Small bordered pill showing a request/client/token status in a tone that
 * matches its meaning (pending = gold, live = accent, terminal = red,
 * historical = subtle). Unknown values render neutrally instead of breaking,
 * so a new backend status cannot crash the dashboard.
 *
 * @param props - See {@link StatusBadgeProps}.
 * @returns The status pill.
 */
export function StatusBadge({ status }: StatusBadgeProps) {
  const tone = TONE_CLASS[status] ?? NEUTRAL_TONE_CLASS;
  return <span className={`status-pill capitalize ${tone}`}>{status}</span>;
}
