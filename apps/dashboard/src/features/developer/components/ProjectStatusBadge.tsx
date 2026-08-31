import { dashboardCopy } from "@/copy/dashboard";
import { DeveloperProjectStatus } from "@/features/developer/domain";

const dm = dashboardCopy.developer;

/**
 * Tone and label per project state, computed-keyed by the domain namespace so
 * no inline discriminant literal appears. A state the frontend does not know
 * yet renders neutrally with its wire value rather than breaking the screen.
 */
const STATE_PRESENTATION: Record<string, { tone: string; label: string }> = {
  [DeveloperProjectStatus.Active]: { tone: "bg-emerald-500/10 text-emerald-400", label: dm.statusActive },
  [DeveloperProjectStatus.Suspended]: { tone: "bg-amber-500/10 text-amber-400", label: dm.statusSuspended },
  [DeveloperProjectStatus.Deleted]: { tone: "bg-red-500/10 text-red-400", label: dm.statusDeleted },
};

const UNKNOWN_TONE = "bg-[var(--ds-surface)] text-[var(--ds-text-muted)]";

/**
 * Props for {@link ProjectStatusBadge}.
 */
export interface ProjectStatusBadgeProps {
  /** The project's wire status value. */
  status: string;
}

/**
 * The badge showing whether a project is live, stopped or gone.
 *
 * It lives beside the project screens rather than inside one, because the list
 * and the detail have to agree on what a state looks like.
 *
 * @param props - See {@link ProjectStatusBadgeProps}.
 * @returns The status badge.
 */
export function ProjectStatusBadge({ status }: ProjectStatusBadgeProps) {
  const presentation = STATE_PRESENTATION[status] ?? { tone: UNKNOWN_TONE, label: status };
  return (
    <span className={`inline-flex rounded px-2 py-0.5 text-xs font-semibold ${presentation.tone}`}>
      {presentation.label}
    </span>
  );
}
