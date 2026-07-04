import {
  DashboardActionButton,
  DashboardActionId,
  DashboardActionStatus,
  DashboardButtonVariant,
  DashboardField,
  DashboardInput,
} from "@musiccloud/dashboard-ui";
import type { FormConfigPayload } from "@musiccloud/shared";
import {
  CheckCircleIcon,
  CircleIcon,
  FileIcon,
  FileTextIcon,
  PlusCircleIcon,
  TrashIcon,
  TrayArrowDownIcon,
} from "@phosphor-icons/react";
import { useRef, useState } from "react";
import { useNavigate } from "react-router";

import { ContentUnavailableView } from "@/components/ui/ContentUnavailableView";
import { PageHeader } from "@/components/ui/PageHeader";
import { TableActionButton } from "@/components/ui/TableActionButton";
import { useI18n } from "@/context/I18nContext";
import { ImportConflictDialog } from "@/features/templates/form-builder/ImportConflictDialog";
import {
  useCreateFormConfig,
  useDeleteFormConfig,
  useFormConfigs,
  useImportFormConfig,
  useSetFormConfigActive,
} from "@/features/templates/hooks/useFormConfig";
import { useImportQueue } from "@/lib/hooks/useImportQueue";
import { Dialog, dialogHeaderIconClass } from "@/shared/ui/Dialog";

/** One entry of an import file: a form payload plus its target name. */
type ImportFormData = FormConfigPayload & { name: string };

/**
 * Parses an export file into the import queue's entries. Accepts both the
 * single-form envelope (`{ name, rows, … }`) and a multi-form envelope
 * (`{ forms: [...] }`); returns `null` for anything unusable.
 */
function parseImportFile(raw: string): ImportFormData[] | null {
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return null;
    const obj = parsed as Record<string, unknown>;
    const candidates: unknown[] = Array.isArray(obj.forms) ? obj.forms : [obj];
    const entries: ImportFormData[] = [];
    for (const candidate of candidates) {
      if (!candidate || typeof candidate !== "object") return null;
      const c = candidate as Record<string, unknown>;
      if (typeof c.name !== "string" || c.name.trim() === "" || !Array.isArray(c.rows)) return null;
      entries.push({
        name: c.name,
        slug: typeof c.slug === "string" ? c.slug : undefined,
        rows: c.rows,
        submissionConfig: c.submissionConfig,
      } as ImportFormData);
    }
    return entries.length > 0 ? entries : null;
  } catch {
    return null;
  }
}

function deriveSlug(name: string): string {
  return name
    .toLowerCase()
    .replace(/[\s_]+/g, "-")
    .replace(/[^a-z0-9-]/g, "")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

const ApiStatusCode = {
  Conflict: 409,
} as const;

function ActiveBadge({
  isActive,
  activeLabel,
  inactiveLabel,
}: {
  isActive: boolean;
  activeLabel: string;
  inactiveLabel: string;
}) {
  if (isActive) {
    return (
      <span className="inline-flex items-center gap-1 text-xs text-green-400">
        <CheckCircleIcon weight="duotone" className="w-3.5 h-3.5" />
        {activeLabel}
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 text-xs text-[var(--ds-text-muted)]">
      <CircleIcon weight="duotone" className="w-3.5 h-3.5" />
      {inactiveLabel}
    </span>
  );
}

function NewFormDialog({
  open,
  onClose,
  onCreated,
}: {
  open: boolean;
  onClose: () => void;
  onCreated: (name: string) => void;
}) {
  const { messages } = useI18n();
  const m = messages.formBuilder;
  const createMutation = useCreateFormConfig();

  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [slugEdited, setSlugEdited] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const currentSlug = slugEdited ? slug : deriveSlug(name);

  function handleSlugChange(value: string) {
    setSlugEdited(true);
    setSlug(value.toLowerCase().replace(/[^a-z0-9-]/g, ""));
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim() || !currentSlug.trim()) return;
    setError(null);

    createMutation.mutate(
      { name: name.trim(), slug: currentSlug.trim() },
      {
        onSuccess: () => {
          onCreated(name.trim());
        },
        onError: (err: unknown) => {
          const status = err && typeof err === "object" && "status" in err ? (err as { status: number }).status : 0;
          if (status === ApiStatusCode.Conflict) {
            const msg =
              err && typeof err === "object" && "responseMessage" in err
                ? String((err as { responseMessage: string }).responseMessage)
                : "";
            if (msg.toLowerCase().includes("slug")) {
              setError(m.slugConflict);
            } else {
              setError(m.nameConflict);
            }
          } else {
            setError(messages.common.unknownError);
          }
        },
      },
    );
  }

  return (
    <Dialog
      open={open}
      title={m.newForm}
      titleIcon={<PlusCircleIcon weight="duotone" className={dialogHeaderIconClass} />}
      onClose={onClose}
      maxWidth="md"
    >
      <form onSubmit={handleSubmit}>
        <div className="px-6 py-3 space-y-4">
          <DashboardField label={m.formNameLabel} labelHtmlFor="new-form-name">
            <DashboardInput
              id="new-form-name"
              autoFocus
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ""))}
              placeholder="suggestion-form"
              className="font-mono"
            />
          </DashboardField>
          <DashboardField label={m.formSlugLabel} labelHtmlFor="new-form-slug" hint={m.formSlugHint}>
            <div className="flex items-center gap-2">
              <span className="text-xs text-[var(--ds-text-muted)] shrink-0">/</span>
              <DashboardInput
                id="new-form-slug"
                type="text"
                value={currentSlug}
                onChange={(e) => handleSlugChange(e.target.value)}
                placeholder={m.slugPlaceholder}
                className="flex-1 font-mono"
              />
            </div>
          </DashboardField>
          {error && <p className="text-xs text-red-500">{error}</p>}
        </div>
        <Dialog.Footer>
          <DashboardActionButton
            action={DashboardActionId.Cancel}
            icon={false}
            label={messages.common.cancel}
            onClick={onClose}
            type="button"
            variant={DashboardButtonVariant.Neutral}
          />
          <DashboardActionButton
            action={DashboardActionId.Create}
            busyLabel={messages.common.saving}
            disabled={!currentSlug || !name}
            label={m.create}
            status={createMutation.isPending ? DashboardActionStatus.Busy : DashboardActionStatus.Idle}
            type="submit"
          />
        </Dialog.Footer>
      </form>
    </Dialog>
  );
}

export function FormBuilderListPage() {
  const { messages } = useI18n();
  const m = messages.formBuilder;
  const navigate = useNavigate();
  const { data: forms = [], isLoading } = useFormConfigs();
  const deleteForm = useDeleteFormConfig();
  const setActive = useSetFormConfigActive();
  const importForm = useImportFormConfig();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [showDialog, setShowDialog] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);

  const importQueue = useImportQueue<ImportFormData>({
    mutate: (data, callbacks) => importForm.mutate(data, callbacks),
    messages: { importSuccess: m.importSuccess, importError: m.importError },
  });

  function handleImportFile(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    void file.text().then((raw) => {
      const entries = parseImportFile(raw);
      if (!entries) {
        importQueue.setAlertMessage(m.importInvalidFile);
        return;
      }
      importQueue.processQueue(entries, 0);
    });
  }

  function handleDelete(name: string) {
    setDeleteTarget(name);
  }

  async function confirmDelete() {
    if (!deleteTarget) return;
    await deleteForm.mutateAsync(deleteTarget);
    setDeleteTarget(null);
  }

  function handleCreated(name: string) {
    setShowDialog(false);
    void navigate(`/forms/${name}`);
  }

  return (
    <>
      <PageHeader title={m.listTitle}>
        <div className="flex items-center gap-2">
          {importQueue.alertMessage && (
            <span className="text-sm text-[var(--ds-text-muted)]">{importQueue.alertMessage}</span>
          )}
          <DashboardActionButton
            action={DashboardActionId.Import}
            icon={<TrayArrowDownIcon weight="duotone" className="size-3.5" />}
            label={m.importForm}
            onClick={() => fileInputRef.current?.click()}
            size="control"
            type="button"
            variant={DashboardButtonVariant.Neutral}
          />
          <input
            ref={fileInputRef}
            aria-label={m.importForm}
            type="file"
            accept="application/json"
            className="hidden"
            onChange={handleImportFile}
          />
          <DashboardActionButton
            action={DashboardActionId.Create}
            icon={<PlusCircleIcon weight="duotone" className="size-3.5" />}
            label={m.newForm}
            onClick={() => setShowDialog(true)}
            size="control"
            type="button"
          />
        </div>
      </PageHeader>

      <div className="space-y-6">
        {isLoading && (
          <div className="flex items-center justify-center h-32 text-[var(--ds-text-muted)] text-sm">
            {messages.common.loading}
          </div>
        )}

        {!isLoading && forms.length === 0 && (
          <ContentUnavailableView
            className="flex-1"
            icon={<FileIcon weight="duotone" aria-hidden />}
            title={m.noForms}
            subtitle={m.noFormsHint}
          />
        )}

        {!isLoading && forms.length > 0 && (
          <div className="bg-[var(--ds-surface)] border border-[var(--ds-border)] rounded-control overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[var(--ds-border)] text-xs font-medium text-[var(--ds-text-muted)] uppercase tracking-wide">
                  <th className="text-left px-4 py-3">{m.tableColumns.name}</th>
                  <th className="text-left px-4 py-3">{m.slugLabel}</th>
                  <th className="text-left px-4 py-3">{m.tableColumns.status}</th>
                  <th className="px-4 py-3 text-right" scope="col">
                    <span className="sr-only">Actions</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {forms.map((form) => (
                  <tr
                    key={form.id}
                    className="border-b border-[var(--ds-border)] last:border-0 hover:bg-[var(--ds-surface-hover)] transition-colors"
                  >
                    <td className="px-4 py-3 font-medium text-[var(--ds-text)]">
                      <button
                        type="button"
                        onClick={() => navigate(`/forms/${form.name}`)}
                        className="hover:underline text-left font-mono"
                      >
                        {form.name}
                      </button>
                    </td>
                    <td className="px-4 py-3 font-mono text-xs text-[var(--ds-text-muted)]">
                      {form.slug ? `/${form.slug}` : "\u2014"}
                    </td>
                    <td className="px-4 py-3">
                      <button
                        type="button"
                        title={form.isActive ? m.status.deactivate : m.status.activate}
                        disabled={setActive.isPending}
                        onClick={() => setActive.mutate({ name: form.name, active: !form.isActive })}
                        className="disabled:opacity-40 transition-opacity"
                      >
                        <ActiveBadge
                          isActive={form.isActive}
                          activeLabel={m.status.active}
                          inactiveLabel={m.status.inactive}
                        />
                      </button>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex items-center justify-end gap-2">
                        <TableActionButton
                          onClick={() => navigate(`/forms/${form.name}`)}
                          icon={<FileTextIcon weight="duotone" className="size-3.5" />}
                          label={m.editButton}
                        />
                        <TableActionButton
                          variant={DashboardButtonVariant.Danger}
                          onClick={() => handleDelete(form.name)}
                          disabled={deleteForm.isPending}
                          icon={<TrashIcon weight="duotone" className="size-3.5" />}
                          label={messages.common.delete}
                        />
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <NewFormDialog open={showDialog} onClose={() => setShowDialog(false)} onCreated={handleCreated} />

      {importQueue.conflict && (
        <ImportConflictDialog
          formName={importQueue.conflict.item.name}
          onOverwrite={importQueue.handleConflictOverwrite}
          onRename={importQueue.handleConflictRename}
          onCancel={importQueue.handleConflictSkip}
        />
      )}

      <Dialog
        open={deleteTarget !== null}
        title={`${m.deleteConfirmPrefix}${deleteTarget}${m.deleteConfirmSuffix}`}
        titleIcon={<TrashIcon weight="duotone" className={dialogHeaderIconClass} />}
        onClose={() => setDeleteTarget(null)}
      >
        <div className="px-6 py-3">
          <p className="text-sm text-[var(--ds-text-muted)]">{m.deleteConfirmDescription}</p>
        </div>
        <Dialog.Footer>
          <DashboardActionButton
            action={DashboardActionId.Cancel}
            icon={false}
            label={messages.common.cancel}
            onClick={() => setDeleteTarget(null)}
            type="button"
            variant={DashboardButtonVariant.Neutral}
          />
          <DashboardActionButton
            action={DashboardActionId.Delete}
            busyLabel="…"
            label={messages.common.delete}
            onClick={() => void confirmDelete()}
            status={deleteForm.isPending ? DashboardActionStatus.Busy : DashboardActionStatus.Idle}
            type="button"
          />
        </Dialog.Footer>
      </Dialog>
    </>
  );
}
