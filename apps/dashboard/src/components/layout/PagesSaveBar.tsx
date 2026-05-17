import { DashboardActionButton } from "@musiccloud/dashboard-ui";
import { useCallback, useState, useSyncExternalStore } from "react";
import { usePagesEditor } from "@/features/content/state/PagesEditorContext";
import { useGlobalPagesSave } from "@/features/content/state/useGlobalPagesSave";
import { Dialog } from "@/shared/ui/Dialog";

export function PagesSaveBar() {
  const editor = usePagesEditor();
  const { save, discard, status, errorDetails } = useGlobalPagesSave();
  const dirtyCount = useSyncExternalStore(
    useCallback((cb) => editor.dirty.subscribe(cb), [editor.dirty]),
    () => editor.dirty.groupCount(),
  );
  const [confirmDiscardOpen, setConfirmDiscardOpen] = useState(false);

  if (dirtyCount === 0) return null;

  const isSaving = status === "saving";

  return (
    <div className="flex items-center gap-2">
      <DashboardActionButton
        action="save"
        busyLabel="Speichert…"
        label={`Speichern (${dirtyCount})`}
        onClick={() => void save()}
        status={isSaving ? "busy" : "idle"}
        type="button"
        variant="accent"
      />
      <DashboardActionButton
        action="restore"
        label="Verwerfen"
        onClick={() => setConfirmDiscardOpen(true)}
        type="button"
        variant="ghost"
      />
      {errorDetails && errorDetails.length > 0 && (
        <span className="text-xs text-[var(--ds-btn-danger-text)]">
          {errorDetails.length === 1 ? "1 Fehler" : `${errorDetails.length} Fehler`}
        </span>
      )}
      <Dialog open={confirmDiscardOpen} title="Änderungen verwerfen?" onClose={() => setConfirmDiscardOpen(false)}>
        <div className="bg-[var(--ds-surface)] px-6 py-4">
          <p className="text-sm text-[var(--ds-text-muted)]">
            Alle nicht gespeicherten Änderungen gehen verloren. Diese Aktion kann nicht rückgängig gemacht werden.
          </p>
        </div>
        <Dialog.Footer>
          <DashboardActionButton
            action="cancel"
            icon={false}
            label="Abbrechen"
            onClick={() => setConfirmDiscardOpen(false)}
            type="button"
            variant="neutral"
          />
          <DashboardActionButton
            action="delete"
            icon={false}
            label="Verwerfen"
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
