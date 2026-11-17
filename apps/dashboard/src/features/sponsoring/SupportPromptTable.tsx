import { type ColumnDef, DataTable, StatusBadgeClass, StatusTone } from "@musiccloud/dashboard-ui";
import type { SupportPrompt } from "@musiccloud/shared";
import { FileTextIcon } from "@phosphor-icons/react";
import { memo, useMemo } from "react";

import { TableActionButton } from "@/components/ui/TableActionButton";
import { dashboardCopy } from "@/copy/dashboard";
import { promptState, SupportPromptState } from "@/features/sponsoring/supportPromptState";

/** The dashboard's copy. */
const messages = dashboardCopy;
/** The support prompt screens' copy. */
const text = messages.sponsoring.supportPrompts;

/** Props of {@link SupportPromptTable}. */
interface SupportPromptTableProps {
  /** The prompts to list, in the order the backend gave them. */
  prompts: SupportPrompt[];
  /** The day the states are judged against, as `YYYY-MM-DD`. */
  today: string;
  /** Opens a prompt in its editor. */
  onEdit: (prompt: SupportPrompt) => void;
}

/**
 * A prompt's window in one line: both days joined by "to", with an ellipsis
 * for a side that is open, or the word for no window at all.
 *
 * @param prompt - The prompt whose window to describe.
 * @returns The line, such as `2026-08-01 to …`, or `null` when the prompt has no window.
 */
function windowLabel(prompt: SupportPrompt): string | null {
  if (!prompt.startsAt && !prompt.endsAt) return null;
  return text.windowRange
    .replace("{start}", prompt.startsAt ?? text.windowOpenSide)
    .replace("{end}", prompt.endsAt ?? text.windowOpenSide);
}

/**
 * The prompts as a table, with the same row shape as the other tables in the
 * dashboard: what it is, where it goes, what it does today, and one action.
 *
 * Ported from lmaa.space's support prompt table. The state is judged against
 * `today`, and only a prompt that is live today takes the success tone; a
 * draft, a scheduled and an expired prompt all stay neutral.
 *
 * @param props - See {@link SupportPromptTableProps}.
 * @returns The table.
 */
function SupportPromptTableComponent({ prompts, today, onEdit }: SupportPromptTableProps) {
  const columns = useMemo<ColumnDef<SupportPrompt>[]>(
    () => [
      {
        id: "name",
        header: text.nameLabel,
        sortKey: (prompt) => prompt.name,
        cell: (prompt) => (
          <span className="block truncate text-sm font-medium text-[var(--ds-text)]">{prompt.name}</span>
        ),
      },
      {
        id: "slot",
        header: text.slotLabel,
        sortKey: (prompt) => prompt.slot,
        cell: (prompt) => <span className="text-sm text-[var(--ds-text-muted)]">{text.slots[prompt.slot]}</span>,
      },
      {
        id: "threshold",
        header: text.thresholdLabel,
        sortKey: (prompt) => prompt.threshold,
        className: "w-28",
        cell: (prompt) => <span className="text-sm tabular-nums text-[var(--ds-text-muted)]">{prompt.threshold}</span>,
      },
      {
        id: "window",
        header: text.windowColumn,
        cell: (prompt) => {
          const label = windowLabel(prompt);
          return label ? (
            <span className="text-sm tabular-nums text-[var(--ds-text-muted)]">{label}</span>
          ) : (
            <span className="text-sm text-[var(--ds-text-subtle)]">{text.windowNone}</span>
          );
        },
      },
      {
        id: "state",
        header: text.stateColumn,
        className: "w-32",
        cell: (prompt) => {
          const state = promptState(prompt, today);
          const tone = state === SupportPromptState.Live ? StatusTone.Success : StatusTone.Neutral;
          return (
            <span className={`shrink-0 ${StatusBadgeClass.Root} ${StatusBadgeClass[tone]}`}>{text.states[state]}</span>
          );
        },
      },
      {
        id: "actions",
        className: "w-36",
        cell: (prompt) => (
          <div className="flex gap-2 justify-end">
            <TableActionButton
              onClick={() => onEdit(prompt)}
              icon={<FileTextIcon weight="duotone" className="size-3.5" />}
              label={messages.common.edit}
            />
          </div>
        ),
      },
    ],
    [onEdit, today],
  );

  return (
    <DataTable data={prompts} columns={columns} getRowKey={(prompt) => prompt.id}>
      <DataTable.Viewport>
        <DataTable.Head />
        <DataTable.Rows />
      </DataTable.Viewport>
    </DataTable>
  );
}

/** {@link SupportPromptTableComponent}, re-rendered only when its props change. */
export const SupportPromptTable = memo(SupportPromptTableComponent);
