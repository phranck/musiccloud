import { createPortal } from "react-dom";
import { Outlet } from "react-router";

import { PagesSaveBar } from "@/components/layout/PagesSaveBar";
import { usePageHeaderContext } from "@/context/PageHeaderContext";
import { PagesEditorProvider } from "@/features/content/state/PagesEditorContext";
import { UnsavedGuard } from "@/features/content/state/UnsavedGuard";
import { useGlobalPagesSave } from "@/features/content/state/useGlobalPagesSave";
import { useKeyboardSave } from "@/lib/useKeyboardSave";

function PagesEditorTopbar() {
  const { actionsEl } = usePageHeaderContext();
  return actionsEl ? createPortal(<PagesSaveBar />, actionsEl) : null;
}

function PagesEditorBindings() {
  const { save } = useGlobalPagesSave();
  useKeyboardSave(save);
  return null;
}

export function PagesEditorRoot() {
  return (
    <PagesEditorProvider>
      <PagesEditorTopbar />
      <PagesEditorBindings />
      <UnsavedGuard />
      <Outlet />
    </PagesEditorProvider>
  );
}
