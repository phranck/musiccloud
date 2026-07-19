import {
  DashboardActionButton,
  DashboardActionId,
  DashboardActionStatus,
  DashboardButtonVariant,
} from "@musiccloud/dashboard-ui";
import { useCallback, useState, useSyncExternalStore } from "react";
import { dashboardCopy } from "@/copy/dashboard";
import { usePagesEditor } from "@/features/content/state/PagesEditorContext";
import { GlobalPagesSaveStatus, useGlobalPagesSave } from "@/features/content/state/useGlobalPagesSave";
import { Dialog } from "@/shared/ui/Dialog";

export function PagesSaveBar() {
  const messages = dashboardCopy;
  const text = messages.layout.pagesSaveBar;
  const editor = usePagesEditor();
  const { save, discard, status, errorDetails, errorMessage, errorId } = useGlobalPagesSave();
  const dirtyCount = useSyncExternalStore(
    useCallback((cb) => editor.dirty.subscribe(cb), [editor.dirty]),
    () => editor.dirty.groupCount(),
  );
  const [confirmDiscardOpen, setConfirmDiscardOpen] = useState(false);

  if (dirtyCount === 0) return null;

  const isSaving = status === GlobalPagesSaveStatus.Saving;

  return (
    <div className="flex items-center gap-2">
      <DashboardActionButton
        action={DashboardActionId.Save}
        busyLabel={text.saving}
        label={text.save.replace("{count}", String(dirtyCount))}
        onClick={() => void save()}
        status={isSaving ? DashboardActionStatus.Busy : DashboardActionStatus.Idle}
        type="button"
        variant={DashboardButtonVariant.Accent}
      />
      <DashboardActionButton
        action={DashboardActionId.Restore}
        label={text.discard}
        onClick={() => setConfirmDiscardOpen(true)}
        type="button"
        variant={DashboardButtonVariant.Ghost}
      />
      {errorDetails && errorDetails.length > 0 && (
        <span className="text-xs text-[var(--ds-danger-text)]">
          {errorDetails.length === 1 ? text.error : text.errors.replace("{count}", String(errorDetails.length))}
        </span>
      )}
      {errorMessage && (
        <span role="alert" className="max-w-72 text-xs text-[var(--ds-danger-text)]">
          {errorMessage}
          {errorId ? ` Error ID: ${errorId}` : ""}
        </span>
      )}
      <Dialog open={confirmDiscardOpen} title={text.discardTitle} onClose={() => setConfirmDiscardOpen(false)}>
        <div className="bg-[var(--ds-surface)] px-6 py-4">
          <p className="text-sm text-[var(--ds-text-muted)]">{text.discardDescription}</p>
        </div>
        <Dialog.Footer>
          <DashboardActionButton
            action={DashboardActionId.Cancel}
            icon={false}
            label={messages.common.cancel}
            onClick={() => setConfirmDiscardOpen(false)}
            type="button"
            variant={DashboardButtonVariant.Neutral}
          />
          <DashboardActionButton
            action={DashboardActionId.Delete}
            icon={false}
            label={text.discard}
            onClick={() => {
              discard();
              setConfirmDiscardOpen(false);
            }}
            type="button"
          />
        </Dialog.Footer>
      </Dialog>
    </div>
  );
}
