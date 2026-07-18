import { DashboardActionButton, DashboardActionId, DashboardButtonVariant } from "@musiccloud/dashboard-ui";
import { DownloadIcon } from "@phosphor-icons/react";
import { useState } from "react";

import { dashboardCopy } from "@/copy/dashboard";
import { Dialog, dialogHeaderIconClass } from "@/shared/ui/Dialog";

interface EmailTemplateImportConflictDialogProps {
  templateName: string;
  onOverwrite: () => void;
  onRename: (newName: string) => void;
  onCancel: () => void;
}

/**
 * Dialog shown when an imported email template name conflicts with an existing one.
 *
 * Offers three choices: overwrite the existing template, import under a new name,
 * or skip this template entirely.
 */
export function EmailTemplateImportConflictDialog({
  templateName,
  onOverwrite,
  onRename,
  onCancel,
}: EmailTemplateImportConflictDialogProps) {
  const messages = dashboardCopy;
  const m = messages.emailTemplates;
  const ie = messages.common.importExport;
  const [showRename, setShowRename] = useState(false);
  const [newName, setNewName] = useState(`${templateName}-copy`);

  return (
    <Dialog
      open={true}
      title={m.importConflictTitle.replace("{name}", templateName)}
      titleIcon={<DownloadIcon weight="duotone" className={dialogHeaderIconClass} />}
      onClose={onCancel}
    >
      <div className="px-6 py-3">
        <p className="text-sm text-[var(--ds-text-muted)] mb-4">{m.importConflictHint}</p>

        {showRename && (
          <div className="mb-4">
            <label htmlFor="import-new-name" className="block text-xs font-medium text-[var(--ds-text-muted)] mb-1">
              {ie.newNameLabel}
            </label>
            <input
              id="import-new-name"
              type="text"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              className="w-full h-[var(--ds-control-h-field)] px-3 border border-[var(--ds-border)] rounded-control text-sm bg-[var(--ds-form-control-bg,var(--ds-input-bg))] text-[var(--ds-text)] focus:outline-none focus:border-[var(--ds-border-focus)] focus:ring-2 focus:ring-[var(--ds-focus-ring)]"
            />
          </div>
        )}
      </div>

      <Dialog.Footer className="flex flex-col gap-2">
        <DashboardActionButton
          action={DashboardActionId.Overwrite}
          icon={false}
          label={ie.overwrite}
          onClick={onOverwrite}
          type="button"
        />
        {showRename ? (
          <DashboardActionButton
            action={DashboardActionId.Import}
            disabled={!newName.trim()}
            icon={false}
            label={ie.rename}
            onClick={() => onRename(newName.trim())}
            type="button"
            variant={DashboardButtonVariant.Neutral}
          />
        ) : (
          <DashboardActionButton
            action={DashboardActionId.Import}
            icon={false}
            label={ie.rename}
            onClick={() => setShowRename(true)}
            type="button"
            variant={DashboardButtonVariant.Neutral}
          />
        )}
        <DashboardActionButton
          action={DashboardActionId.Skip}
          icon={false}
          label={ie.skip}
          onClick={onCancel}
          type="button"
          variant={DashboardButtonVariant.Neutral}
        />
      </Dialog.Footer>
    </Dialog>
  );
}
