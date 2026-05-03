import { useEffect } from "react";

import { usePagesEditor } from "./PagesEditorContext";

/**
 * Browser-level guard for unsaved page edits.
 *
 * Shows the browser's standard "Leave site?" dialog when the user closes the
 * tab, refreshes (F5), or types a non-app URL while the dirtyRegistry has
 * uncommitted changes.
 *
 * SPA-internal navigation (Sidebar clicks, in-app <Link>, programmatic
 * navigate()) is NOT yet guarded — see plan
 * `.claude/plans/open/2026-05-03-data-router-migration-and-spa-unsaved-guard.md`
 * for the follow-up that adds useBlocker-driven SPA guard once the dashboard
 * router is migrated to the data-router API.
 */
export function UnsavedGuard() {
  const editor = usePagesEditor();

  useEffect(() => {
    function handler(e: BeforeUnloadEvent) {
      if (editor.dirty.size() === 0) return;
      e.preventDefault();
      // Legacy browsers ignore preventDefault and require returnValue to be
      // a non-empty string. The string itself is no longer shown — modern
      // browsers display their own generic warning.
      e.returnValue = "";
    }
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [editor.dirty]);

  return null;
}
