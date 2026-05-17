import { DashboardActionButton } from "@musiccloud/dashboard-ui";
import { useEffect, useState } from "react";
import { useBlocker } from "react-router";

import { Dialog } from "@/components/ui/Dialog";
import { useI18n } from "@/context/I18nContext";

import { usePagesEditor } from "./PagesEditorContext";
import { useGlobalPagesSave } from "./useGlobalPagesSave";

/**
 * Two-layer guard for unsaved page edits:
 *
 * 1. Browser-level (`beforeunload`): tab close / refresh / external URL.
 * 2. SPA-internal (`useBlocker`): Sidebar clicks, in-app `<Link>`,
 *    programmatic `navigate()`. Requires the data-router (`RouterProvider`).
 */
export function UnsavedGuard() {
  const editor = usePagesEditor();
  const { save, status } = useGlobalPagesSave();
  const { messages } = useI18n();
  const t = messages.unsavedGuard;

  const blocker = useBlocker(
    ({ currentLocation, nextLocation }) =>
      currentLocation.pathname !== nextLocation.pathname && editor.dirty.size() > 0,
  );

  const [savingViaModal, setSavingViaModal] = useState(false);

  useEffect(() => {
    function handler(e: BeforeUnloadEvent) {
      if (editor.dirty.size() === 0) return;
      e.preventDefault();
      e.returnValue = "";
    }
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [editor.dirty]);

  const open = blocker.state === "blocked";

  function handleCancel() {
    if (blocker.state === "blocked") blocker.reset();
  }

  function handleDiscard() {
    editor.resetAll();
    if (blocker.state === "blocked") blocker.proceed();
  }

  async function handleSave() {
    setSavingViaModal(true);
    try {
      await save();
      if (editor.dirty.size() === 0) {
        if (blocker.state === "blocked") blocker.proceed();
      } else if (blocker.state === "blocked") {
        blocker.reset();
      }
    } finally {
      setSavingViaModal(false);
    }
  }

  const isSaving = savingViaModal || status === "saving";

  return (
    <Dialog open={open} title={t.title} onClose={handleCancel}>
      <div className="px-6 py-4 text-sm text-[var(--ds-text)]">{t.description}</div>
      <Dialog.Footer>
        <DashboardActionButton
          action="cancel"
          disabled={isSaving}
          icon={false}
          label={t.cancel}
          onClick={handleCancel}
          type="button"
          variant="neutral"
        />
        <DashboardActionButton
          action="delete"
          disabled={isSaving}
          icon={false}
          label={t.discard}
          onClick={handleDiscard}
          type="button"
        />
        <DashboardActionButton
          action="save"
          busyLabel={t.saving}
          icon={false}
          label={t.save}
          onClick={handleSave}
          status={isSaving ? "busy" : "idle"}
          type="button"
        />
      </Dialog.Footer>
    </Dialog>
  );
}
