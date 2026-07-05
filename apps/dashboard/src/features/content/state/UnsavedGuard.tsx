import {
  DashboardActionButton,
  DashboardActionId,
  DashboardActionStatus,
  DashboardButtonVariant,
} from "@musiccloud/dashboard-ui";
import { useEffect, useState } from "react";
import { useBlocker } from "react-router";

import { Dialog } from "@/components/ui/Dialog";
import { useI18n } from "@/context/I18nContext";

import { usePagesEditor } from "./PagesEditorContext";
import { GlobalPagesSaveStatus, useGlobalPagesSave } from "./useGlobalPagesSave";

const BlockerState = {
  Blocked: "blocked",
} as const;

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

  const open = blocker.state === BlockerState.Blocked;

  function handleCancel() {
    if (blocker.state === BlockerState.Blocked) blocker.reset();
  }

  function handleDiscard() {
    editor.resetAll();
    if (blocker.state === BlockerState.Blocked) blocker.proceed();
  }

  async function handleSave() {
    setSavingViaModal(true);
    try {
      await save();
      if (editor.dirty.size() === 0) {
        if (blocker.state === BlockerState.Blocked) blocker.proceed();
      } else if (blocker.state === BlockerState.Blocked) {
        blocker.reset();
      }
    } finally {
      setSavingViaModal(false);
    }
  }

  const isSaving = savingViaModal || status === GlobalPagesSaveStatus.Saving;

  return (
    <Dialog open={open} title={t.title} onClose={handleCancel}>
      <div className="px-6 py-4 text-sm text-[var(--ds-text)]">{t.description}</div>
      <Dialog.Footer>
        <DashboardActionButton
          action={DashboardActionId.Cancel}
          disabled={isSaving}
          icon={false}
          label={t.cancel}
          onClick={handleCancel}
          type="button"
          variant={DashboardButtonVariant.Neutral}
        />
        <DashboardActionButton
          action={DashboardActionId.Delete}
          disabled={isSaving}
          icon={false}
          label={t.discard}
          onClick={handleDiscard}
          type="button"
        />
        <DashboardActionButton
          action={DashboardActionId.Save}
          busyLabel={messages.common.saving}
          icon={false}
          label={messages.common.save}
          onClick={handleSave}
          status={isSaving ? DashboardActionStatus.Busy : DashboardActionStatus.Idle}
          type="button"
        />
      </Dialog.Footer>
    </Dialog>
  );
}
