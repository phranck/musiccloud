import {
  ArrowCounterClockwise as ArrowCounterClockwiseIcon,
  FloppyDisk as FloppyDiskIcon,
} from "@phosphor-icons/react";
import { useCallback, useState, useSyncExternalStore } from "react";
import { usePagesEditor } from "@/features/content/state/PagesEditorContext";
import { useGlobalPagesSave } from "@/features/content/state/useGlobalPagesSave";
import { Dialog, dialogBtnDestructive, dialogBtnSecondary } from "@/shared/ui/Dialog";

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
      <button
        type="button"
        onClick={() => void save()}
        disabled={isSaving}
        className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-white bg-[var(--color-primary)] rounded-control disabled:opacity-50"
      >
        <FloppyDiskIcon weight="duotone" className="w-3.5 h-3.5" />
        {isSaving ? "Speichert…" : `Speichern (${dirtyCount})`}
      </button>
      <button
        type="button"
        onClick={() => setConfirmDiscardOpen(true)}
        className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs text-[var(--ds-text-muted)] hover:text-[var(--ds-text)] transition-colors"
      >
        <ArrowCounterClockwiseIcon weight="duotone" className="w-3.5 h-3.5" />
        Verwerfen
      </button>
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
          <button type="button" className={dialogBtnSecondary} onClick={() => setConfirmDiscardOpen(false)}>
            Abbrechen
          </button>
          <button
            type="button"
            className={dialogBtnDestructive}
            onClick={() => {
              discard();
              setConfirmDiscardOpen(false);
            }}
          >
            Verwerfen
          </button>
        </Dialog.Footer>
      </Dialog>
    </div>
  );
}
