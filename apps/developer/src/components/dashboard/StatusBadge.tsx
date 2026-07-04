import { AccessRequestStatus, ApiClientStatus, ApiTokenStatus } from "@/lib/apiAccessClient";

/**
 * Visual tone classes per known status value, computed-keyed by the domain
 * namespaces so no inline discriminant literal appears. Client/token
 * statuses share wire values with each other ("active"/"revoked"), so the
 * map naturally covers both.
 */
const TONE_CLASS: Record<string, string> = {
  [AccessRequestStatus.Pending]: "text-gold border-gold/40",
  [AccessRequestStatus.Approved]: "text-accent border-accent/40",
  [AccessRequestStatus.Rejected]: "text-red-400 border-red-400/40",
  [AccessRequestStatus.Archived]: "text-fg-subtle border-border",
  [ApiClientStatus.Active]: "text-accent border-accent/40",
  [ApiClientStatus.Suspended]: "text-gold border-gold/40",
  [ApiClientStatus.Revoked]: "text-red-400 border-red-400/40",
  [ApiTokenStatus.Rotated]: "text-fg-subtle border-border",
};

/** Fallback tone for a status value the frontend does not know yet. */
const NEUTRAL_TONE_CLASS = "text-fg-muted border-border";

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
  return (
    <span
      className={`inline-flex items-center rounded-button border px-2 py-0.5 text-nav leading-none capitalize ${tone}`}
    >
      {status}
    </span>
  );
}
