import {
  DashboardActionButton,
  DashboardActionId,
  DashboardButton,
  DashboardButtonVariant,
  DashboardInput,
} from "@musiccloud/dashboard-ui";
import { DownloadSimpleIcon, PencilSimpleIcon } from "@phosphor-icons/react";
import { useState } from "react";

import { useI18n } from "@/context/I18nContext";
import { Dialog, dialogHeaderIconClass } from "@/shared/ui/Dialog";

interface ImportConflictDialogProps {
  formName: string;
  onOverwrite: () => void;
  onRename: (newName: string) => void;
  onCancel: () => void;
}

/**
 * Dialog shown when an imported form's name conflicts with an existing one
 * (ported from lmaa.space). Offers three choices: overwrite the existing
 * form, import under a new name, or skip this form entirely.
 */
export function ImportConflictDialog({ formName, onOverwrite, onRename, onCancel }: ImportConflictDialogProps) {
  const { messages } = useI18n();
  const fb = messages.formBuilder;
  const [showRename, setShowRename] = useState(false);
  const [newName, setNewName] = useState(`${formName}-copy`);

  return (
    <Dialog
      open={true}
      title={fb.importConflictTitle.replace("{name}", formName)}
      titleIcon={<DownloadSimpleIcon weight="duotone" className={dialogHeaderIconClass} />}
      onClose={onCancel}
    >
      <div className="px-6 py-3">
        <p className="mb-4 text-sm text-[var(--ds-text-muted)]">{fb.importConflictHint}</p>

        {showRename && (
          <div className="mb-4">
            <label htmlFor="import-new-name" className="mb-1 block text-xs font-medium text-[var(--ds-text-muted)]">
              {fb.importNewNameLabel}
            </label>
            <DashboardInput
              id="import-new-name"
              type="text"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              className="font-mono"
            />
          </div>
        )}
      </div>

      <Dialog.Footer className="flex flex-col gap-2">
        <DashboardActionButton
          action={DashboardActionId.Overwrite}
          label={fb.importOverwrite}
          onClick={onOverwrite}
          size="action"
          type="button"
        />
        {showRename ? (
          <DashboardButton
            disabled={!newName.trim()}
            leadingIcon={<PencilSimpleIcon weight="duotone" className="size-3.5" />}
            onClick={() => onRename(newName.trim())}
            size="action"
            type="button"
            variant={DashboardButtonVariant.Neutral}
          >
            {fb.importRename}
          </DashboardButton>
        ) : (
          <DashboardButton
            leadingIcon={<PencilSimpleIcon weight="duotone" className="size-3.5" />}
            onClick={() => setShowRename(true)}
            size="action"
            type="button"
            variant={DashboardButtonVariant.Neutral}
          >
            {fb.importRename}
          </DashboardButton>
        )}
        <DashboardActionButton
          action={DashboardActionId.Skip}
          label={fb.importSkip}
          onClick={onCancel}
          size="action"
          type="button"
          variant={DashboardButtonVariant.Neutral}
        />
      </Dialog.Footer>
    </Dialog>
  );
}
