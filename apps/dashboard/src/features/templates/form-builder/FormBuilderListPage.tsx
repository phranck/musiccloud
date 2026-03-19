import {
  CheckCircleIcon,
  CircleIcon,
  FileIcon,
  FileTextIcon,
  PlusCircleIcon,
  TrashIcon,
} from "@phosphor-icons/react";
import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router";

import { ContentUnavailableView } from "@/components/ui/ContentUnavailableView";
import {
  Dialog,
  dialogBtnDestructive,
  dialogBtnPrimary,
  dialogBtnSecondary,
  dialogHeaderIconClass,
} from "@/shared/ui/Dialog";
import { PageHeader } from "@/components/ui/PageHeader";
import { useI18n } from "@/context/I18nContext";
import {
  useCreateFormConfig,
  useDeleteFormConfig,
  useFormConfigs,
  useSetFormConfigActive,
} from "@/features/templates/hooks/useFormConfig";

function deriveSlug(name: string): string {
  return name
    .toLowerCase()
    .replace(/[\s_]+/g, "-")
    .replace(/[^a-z0-9-]/g, "")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

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
      <span className="inline-flex items-center gap-1 text-xs text-green-600 dark:text-green-400">
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

  const nameInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    nameInputRef.current?.focus();
  }, []);

  useEffect(() => {
    if (!slugEdited) {
      setSlug(deriveSlug(name));
    }
  }, [name, slugEdited]);

  function handleSlugChange(value: string) {
    setSlugEdited(true);
    setSlug(value.toLowerCase().replace(/[^a-z0-9-]/g, ""));
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim() || !slug.trim()) return;
    setError(null);

    createMutation.mutate(
      { name: name.trim(), slug: slug.trim() },
      {
        onSuccess: () => {
          onCreated(name.trim());
        },
        onError: (err: unknown) => {
          const status =
            err && typeof err === "object" && "status" in err
              ? (err as { status: number }).status
              : 0;
          if (status === 409) {
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
          <div>
            <label
              htmlFor="new-form-name"
              className="block text-xs font-medium text-[var(--ds-text-muted)] mb-1"
            >
              {m.formNameLabel}
            </label>
            <input
              id="new-form-name"
              ref={nameInputRef}
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ""))}
              placeholder="suggestion-form"
              className="w-full px-3 py-1.5 text-sm bg-[var(--ds-input-bg)] border border-[var(--ds-border)] rounded-control text-[var(--ds-text)] placeholder:text-[var(--ds-text-muted)] focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)] focus:border-transparent font-mono"
            />
          </div>
          <div>
            <label
              htmlFor="new-form-slug"
              className="block text-xs font-medium text-[var(--ds-text-muted)] mb-1"
            >
              {m.formSlugLabel}
            </label>
            <div className="flex items-center gap-2">
              <span className="text-xs text-[var(--ds-text-muted)] shrink-0">/</span>
              <input
                id="new-form-slug"
                type="text"
                value={slug}
                onChange={(e) => handleSlugChange(e.target.value)}
                placeholder={m.slugPlaceholder}
                className="flex-1 px-3 py-1.5 text-sm bg-[var(--ds-input-bg)] border border-[var(--ds-border)] rounded-control text-[var(--ds-text)] placeholder:text-[var(--ds-text-muted)] focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)] focus:border-transparent font-mono"
              />
            </div>
            <p className="text-xs text-[var(--ds-text-muted)] mt-1">{m.formSlugHint}</p>
          </div>
          {error && <p className="text-xs text-red-500">{error}</p>}
        </div>
        <Dialog.Footer>
          <button type="button" onClick={onClose} className={dialogBtnSecondary}>
            {messages.common.cancel}
          </button>
          <button
            type="submit"
            disabled={createMutation.isPending || !slug || !name}
            className={dialogBtnPrimary}
          >
            {createMutation.isPending ? messages.common.saving : m.create}
          </button>
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
  const [showDialog, setShowDialog] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);

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
        <button
          type="button"
          onClick={() => setShowDialog(true)}
          className="flex items-center gap-2 h-9 px-4 border border-[var(--ds-btn-primary-border)] text-[var(--ds-btn-primary-text)] rounded-control text-sm font-medium hover:border-[var(--ds-btn-primary-hover-border)] hover:bg-[var(--ds-btn-primary-hover-bg)] transition-colors"
        >
          <PlusCircleIcon weight="duotone" className="w-3.5 h-3.5" />
          {m.newForm}
        </button>
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
                  <th className="px-4 py-3" />
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
                        onClick={() =>
                          setActive.mutate({ name: form.name, active: !form.isActive })
                        }
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
                        <button
                          type="button"
                          onClick={() => navigate(`/forms/${form.name}`)}
                          className="h-9 px-3 flex items-center gap-2 border border-[var(--ds-btn-neutral-border)] rounded-control text-[var(--ds-btn-neutral-text)] text-sm hover:border-[var(--ds-btn-neutral-hover-border)] hover:bg-[var(--ds-btn-neutral-hover-bg)] transition-colors"
                        >
                          <FileTextIcon weight="duotone" className="w-3.5 h-3.5" />
                          {m.editButton}
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDelete(form.name)}
                          disabled={deleteForm.isPending}
                          className="h-9 px-3 flex items-center gap-2 border border-[var(--ds-btn-danger-border)] rounded-control text-[var(--ds-btn-danger-text)] text-sm hover:border-[var(--ds-btn-danger-hover-border)] hover:bg-[var(--ds-btn-danger-hover-bg)] transition-colors disabled:opacity-40"
                        >
                          <TrashIcon weight="duotone" className="w-3.5 h-3.5" />
                          {messages.common.delete}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <NewFormDialog
        open={showDialog}
        onClose={() => setShowDialog(false)}
        onCreated={handleCreated}
      />

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
          <button
            type="button"
            onClick={() => setDeleteTarget(null)}
            className={dialogBtnSecondary}
          >
            {messages.common.cancel}
          </button>
          <button
            type="button"
            disabled={deleteForm.isPending}
            onClick={() => void confirmDelete()}
            className={dialogBtnDestructive}
          >
            {deleteForm.isPending ? "\u2026" : messages.common.delete}
          </button>
        </Dialog.Footer>
      </Dialog>
    </>
  );
}
