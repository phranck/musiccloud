import {
  DashboardActionButton,
  DashboardActionId,
  DashboardActionStatus,
  DashboardButtonVariant,
} from "@musiccloud/dashboard-ui";
import {
  DownloadIcon,
  EnvelopeOpenIcon,
  FileTextIcon,
  LockIcon,
  PlusCircleIcon,
  TrashIcon,
  UploadIcon,
} from "@phosphor-icons/react";
import { useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router";

import { ContentUnavailableView } from "@/components/ui/ContentUnavailableView";
import { PageHeader } from "@/components/ui/PageHeader";
import { PageBody, PageLayout } from "@/components/ui/PageLayout";
import { type ColumnDef, DataTable } from "@/components/ui/Table";
import { TableActionButton } from "@/components/ui/TableActionButton";
import { useI18n } from "@/context/I18nContext";
import { EmailTemplateImportConflictDialog } from "@/features/templates/email-templates/EmailTemplateImportConflictDialog";
import { exportEmailTemplateAll, exportEmailTemplateSingle } from "@/features/templates/hooks/emailTemplateExport";
import {
  type EmailTemplate,
  type EmailTemplateInput,
  useDeleteEmailTemplate,
  useEmailTemplates,
  useImportEmailTemplate,
} from "@/features/templates/hooks/useEmailTemplates";
import { useImportQueue } from "@/lib/hooks/useImportQueue";
import { Dialog, dialogHeaderIconClass } from "@/shared/ui/Dialog";

type ImportTemplateData = EmailTemplateInput;

/**
 * List page showing all email templates with create, delete, import and export actions.
 */
export function EmailTemplateListPage() {
  const { messages, locale } = useI18n();
  const m = messages.emailTemplates;
  const common = messages.common;
  const navigate = useNavigate();
  const { data: templates = [], isLoading } = useEmailTemplates();
  const deleteMutation = useDeleteEmailTemplate();
  const importMutation = useImportEmailTemplate();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [deleteTarget, setDeleteTarget] = useState<{ id: number; name: string } | null>(null);
  const importQueue = useImportQueue<ImportTemplateData>({
    mutate: (data, cbs) => importMutation.mutate(data, cbs),
    messages: { importSuccess: m.importSuccess, importError: messages.common.importExport.importError },
  });

  function handleDeleteConfirm() {
    if (!deleteTarget) return;
    deleteMutation.mutate(deleteTarget.id, {
      onSuccess: () => setDeleteTarget(null),
    });
  }

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []);
    if (files.length === 0) return;
    e.target.value = "";

    const readFile = (file: File): Promise<ImportTemplateData[]> =>
      new Promise((resolve) => {
        const reader = new FileReader();
        reader.onload = (ev) => {
          try {
            const json = JSON.parse(ev.target?.result as string) as Record<string, unknown>;
            if (Array.isArray(json.templates)) {
              resolve(json.templates as ImportTemplateData[]);
            } else if (typeof json.name === "string" && typeof json.bodyText === "string") {
              resolve([json as ImportTemplateData]);
            } else {
              resolve([]);
            }
          } catch {
            resolve([]);
          }
        };
        reader.readAsText(file);
      });

    void Promise.all(files.map(readFile)).then((results) => {
      const queue = results.flat();
      if (queue.length === 0) {
        importQueue.setAlertMessage(messages.common.importExport.invalidFile);
        return;
      }
      importQueue.processQueue(queue, 0);
    });
  }

  const columns = useMemo<ColumnDef<EmailTemplate>[]>(
    () => [
      {
        id: "name",
        header: m.templateName,
        className: "w-[24rem]",
        sortKey: (tpl) => tpl.name.toLowerCase(),
        cell: (tpl) => (
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => navigate(`/email-templates/${tpl.id}`)}
              className="font-medium text-[var(--ds-text)] hover:underline text-left font-mono"
            >
              {tpl.name}
            </button>
            {tpl.isSystemTemplate && (
              <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-xs bg-[var(--ds-surface-hover)] text-[var(--ds-text-muted)]">
                <LockIcon weight="duotone" className="w-2.5 h-2.5" />
                {m.systemBadge}
              </span>
            )}
          </div>
        ),
      },
      {
        id: "subject",
        header: m.templateSubject,
        cell: (tpl) => <span className="block truncate text-[var(--ds-text-muted)]">{tpl.subject || "—"}</span>,
      },
      {
        id: "createdAt",
        header: m.tableCreated,
        // Narrow and right-aligned so the date sits directly beside the row actions.
        className: "w-28 text-right",
        sortKey: (tpl) => tpl.createdAt,
        cell: (tpl) => (
          <span className="whitespace-nowrap text-xs text-[var(--ds-text-muted)]">
            {new Date(tpl.createdAt).toLocaleDateString(locale, {
              day: "2-digit",
              month: "2-digit",
              year: "numeric",
            })}
          </span>
        ),
      },
      {
        id: "actions",
        className: "w-80",
        cell: (tpl) => (
          <div className="flex items-center justify-end gap-2">
            <TableActionButton
              onClick={() => exportEmailTemplateSingle(tpl)}
              icon={<UploadIcon weight="duotone" className="w-3.5 h-3.5" />}
              label={common.importExport.exportAction}
            />
            <TableActionButton
              onClick={() => navigate(`/email-templates/${tpl.id}`)}
              icon={<FileTextIcon weight="duotone" className="w-3.5 h-3.5" />}
              label={common.edit}
            />
            <TableActionButton
              variant={DashboardButtonVariant.Danger}
              onClick={() => setDeleteTarget({ id: tpl.id, name: tpl.name })}
              disabled={deleteMutation.isPending || tpl.isSystemTemplate}
              icon={<TrashIcon weight="duotone" className="w-3.5 h-3.5" />}
              label={m.deleteTemplate}
            />
          </div>
        ),
      },
    ],
    [m, common, locale, navigate, deleteMutation.isPending],
  );

  return (
    <PageLayout>
      <PageHeader title={m.listTitle}>
        <DashboardActionButton
          action={DashboardActionId.Import}
          icon={<DownloadIcon weight="duotone" className="w-3.5 h-3.5" />}
          label={common.importExport.importAction}
          onClick={() => fileInputRef.current?.click()}
          size="control"
          type="button"
          variant={DashboardButtonVariant.Neutral}
        />
        <DashboardActionButton
          action={DashboardActionId.Export}
          disabled={templates.length === 0}
          icon={<UploadIcon weight="duotone" className="w-3.5 h-3.5" />}
          label={m.exportAll}
          onClick={() => void exportEmailTemplateAll()}
          size="control"
          type="button"
          variant={DashboardButtonVariant.Neutral}
        />
        <DashboardActionButton
          action={DashboardActionId.Create}
          icon={<PlusCircleIcon weight="duotone" className="w-3.5 h-3.5" />}
          label={m.newTemplate}
          onClick={() => navigate("/email-templates/new")}
          size="control"
          type="button"
        />
      </PageHeader>

      <PageBody>
        {isLoading && (
          <div className="flex items-center justify-center h-32 text-[var(--ds-text-muted)] text-sm">
            {common.loading}
          </div>
        )}

        {!isLoading && templates.length === 0 && (
          <ContentUnavailableView
            className="flex-1 min-h-0"
            icon={<EnvelopeOpenIcon weight="duotone" aria-hidden />}
            title={m.noTemplates}
            subtitle={m.noTemplatesHint}
          />
        )}

        {!isLoading && templates.length > 0 && (
          <div className="-mx-3 -mt-3">
            <DataTable columns={columns} data={templates} getRowKey={(tpl) => tpl.id} stickyHeader />
          </div>
        )}
      </PageBody>

      {/* Hidden file input for import */}
      <input
        ref={fileInputRef}
        aria-label={common.importExport.importAction}
        type="file"
        accept=".json"
        multiple
        className="hidden"
        onChange={handleFileChange}
      />

      {/* Delete confirmation dialog */}
      {deleteTarget !== null && (
        <Dialog
          open={deleteTarget !== null}
          title={m.deleteTemplate}
          titleIcon={<TrashIcon weight="duotone" className={dialogHeaderIconClass} />}
          onClose={() => setDeleteTarget(null)}
        >
          <div className="px-6 py-4 text-sm text-[var(--ds-text-muted)]">
            {m.deleteTemplateConfirm} <span className="font-medium">({deleteTarget.name})</span>
          </div>
          <Dialog.Footer>
            <DashboardActionButton
              action={DashboardActionId.Cancel}
              icon={false}
              label={common.cancel}
              onClick={() => setDeleteTarget(null)}
              type="button"
              variant={DashboardButtonVariant.Neutral}
            />
            <DashboardActionButton
              action={DashboardActionId.Delete}
              busyLabel="…"
              label={common.delete}
              onClick={handleDeleteConfirm}
              status={deleteMutation.isPending ? DashboardActionStatus.Busy : DashboardActionStatus.Idle}
              type="button"
            />
          </Dialog.Footer>
        </Dialog>
      )}

      {/* Import alert dialog */}
      <Dialog
        open={importQueue.alertMessage !== null}
        title={importQueue.alertMessage ?? ""}
        titleIcon={<DownloadIcon weight="duotone" className={dialogHeaderIconClass} />}
        onClose={() => importQueue.setAlertMessage(null)}
      >
        <Dialog.Footer>
          <DashboardActionButton
            action={DashboardActionId.Close}
            icon={false}
            label={common.close}
            onClick={() => importQueue.setAlertMessage(null)}
            type="button"
            variant={DashboardButtonVariant.Neutral}
          />
        </Dialog.Footer>
      </Dialog>

      {importQueue.conflict && (
        <EmailTemplateImportConflictDialog
          templateName={importQueue.conflict.item.name}
          onOverwrite={importQueue.handleConflictOverwrite}
          onRename={importQueue.handleConflictRename}
          onCancel={importQueue.handleConflictSkip}
        />
      )}
    </PageLayout>
  );
}
