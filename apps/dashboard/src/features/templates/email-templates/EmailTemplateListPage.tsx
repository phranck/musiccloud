import { EnvelopeOpenIcon, FileTextIcon, LockIcon, PlusCircleIcon, TrashIcon } from "@phosphor-icons/react";
import { useNavigate } from "react-router";

import { Card } from "@/components/ui/Card";
import { ContentUnavailableView } from "@/components/ui/ContentUnavailableView";
import { PageHeader } from "@/components/ui/PageHeader";
import { useI18n } from "@/context/I18nContext";
import { useDeleteEmailTemplate, useEmailTemplates } from "@/features/templates/hooks/useEmailTemplates";

export function EmailTemplateListPage() {
  const { messages, locale } = useI18n();
  const m = messages.emailTemplates;
  const navigate = useNavigate();
  const { data: templates = [], isLoading } = useEmailTemplates();
  const deleteMutation = useDeleteEmailTemplate();

  async function handleDelete(id: number, name: string) {
    if (!confirm(`${m.deleteTemplateConfirm} (${name})`)) return;
    await deleteMutation.mutateAsync(id);
  }

  return (
    <>
      <PageHeader title={m.listTitle}>
        <button
          type="button"
          onClick={() => navigate("/email-templates/new")}
          className="flex items-center gap-2 h-9 px-4 border border-[var(--ds-btn-primary-border)] text-[var(--ds-btn-primary-text)] rounded-control text-sm font-medium hover:border-[var(--ds-btn-primary-hover-border)] hover:bg-[var(--ds-btn-primary-hover-bg)] transition-colors"
        >
          <PlusCircleIcon weight="duotone" className="w-3.5 h-3.5" />
          {m.newTemplate}
        </button>
      </PageHeader>

      {isLoading && (
        <div className="flex items-center justify-center h-32 text-[var(--ds-text-muted)] text-sm">
          {messages.common.loading}
        </div>
      )}

      {!isLoading && templates.length === 0 && (
        <ContentUnavailableView
          className="flex-1"
          icon={<EnvelopeOpenIcon weight="duotone" aria-hidden />}
          title={m.noTemplates}
          subtitle={m.noTemplatesHint}
        />
      )}

      {!isLoading && templates.length > 0 && (
        <Card className="overflow-hidden rounded-control">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[var(--ds-border)] text-xs font-medium text-[var(--ds-text-muted)] uppercase tracking-wide">
                <th className="text-left px-4 py-1.5">{m.templateName}</th>
                <th className="text-left px-4 py-1.5">{m.templateSubject}</th>
                <th className="text-left px-4 py-1.5">{m.tableCreated}</th>
                <th className="px-4 py-1.5" />
              </tr>
            </thead>
            <tbody>
              {templates.map((tpl) => (
                <tr
                  key={tpl.id}
                  className="border-b border-[var(--ds-border)] last:border-0 hover:bg-[var(--ds-surface-hover)] transition-colors"
                >
                  <td className="px-4 py-1.5 font-medium text-[var(--ds-text)]">
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => navigate(`/email-templates/${tpl.id}`)}
                        className="hover:underline text-left font-mono"
                      >
                        {tpl.name}
                      </button>
                      {tpl.isSystem && (
                        <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-xs bg-[var(--ds-surface-hover)] text-[var(--ds-text-muted)]">
                          <LockIcon weight="duotone" className="w-2.5 h-2.5" />
                          {m.systemBadge}
                        </span>
                      )}
                    </div>
                  </td>
                  <td className="px-4 py-1.5 text-[var(--ds-text-muted)] truncate max-w-xs">
                    {tpl.subject || "\u2014"}
                  </td>
                  <td className="px-4 py-1.5 text-[var(--ds-text-muted)] text-xs whitespace-nowrap">
                    {new Date(tpl.createdAt).toLocaleDateString(locale, {
                      day: "2-digit",
                      month: "2-digit",
                      year: "numeric",
                    })}
                  </td>
                  <td className="px-4 py-1.5 text-right">
                    <div className="flex items-center justify-end gap-2">
                      <button
                        type="button"
                        onClick={() => navigate(`/email-templates/${tpl.id}`)}
                        className="h-9 px-3 flex items-center gap-2 border border-[var(--ds-btn-neutral-border)] rounded-control text-[var(--ds-btn-neutral-text)] text-sm hover:border-[var(--ds-btn-neutral-hover-border)] hover:bg-[var(--ds-btn-neutral-hover-bg)] transition-colors"
                      >
                        <FileTextIcon weight="duotone" className="w-3.5 h-3.5" />
                        {messages.common.edit}
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDelete(tpl.id, tpl.name)}
                        disabled={deleteMutation.isPending || tpl.isSystem}
                        className="h-9 px-3 flex items-center gap-2 border border-[var(--ds-btn-danger-border)] rounded-control text-[var(--ds-btn-danger-text)] text-sm hover:border-[var(--ds-btn-danger-hover-border)] hover:bg-[var(--ds-btn-danger-hover-bg)] transition-colors disabled:opacity-40"
                      >
                        <TrashIcon weight="duotone" className="w-3.5 h-3.5" />
                        {m.deleteTemplate}
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}
    </>
  );
}
