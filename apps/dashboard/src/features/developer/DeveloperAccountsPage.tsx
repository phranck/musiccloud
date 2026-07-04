import { PageHeader } from "@/components/ui/PageHeader";
import { PageLayout } from "@/components/ui/PageLayout";
import { useI18n } from "@/context/I18nContext";
import { useDeveloperAccounts } from "@/features/developer/hooks/useDeveloperData";
import { DeveloperAccountStatus } from "@/features/developer/domain";

export function DeveloperAccountsPage() {
  const { messages } = useI18n();
  const dm = messages.developer;
  const { data, isLoading } = useDeveloperAccounts();

  const statusBadge = (status: string) => {
    const map: Record<string, string> = {
      [DeveloperAccountStatus.Active]: "bg-emerald-500/10 text-emerald-400",
      [DeveloperAccountStatus.Suspended]: "bg-red-500/10 text-red-400",
    };
    const labelMap: Record<string, string> = {
      [DeveloperAccountStatus.Active]: dm.statusActive,
      [DeveloperAccountStatus.Suspended]: dm.statusSuspended,
    };
    const cls = map[status] ?? "bg-gray-500/10 text-gray-400";
    return (
      <span className={`inline-flex px-2 py-0.5 rounded text-xs font-semibold ${cls}`}>
        {labelMap[status] ?? status}
      </span>
    );
  };

  return (
    <PageLayout>
      <PageHeader title={dm.accountsTitle} />
      {isLoading ? (
        <div className="text-[var(--ds-text-muted)] text-sm">{messages.common.loading}</div>
      ) : (
        <div className="bg-[var(--ds-surface)] rounded-xl border border-[var(--ds-border-subtle)] overflow-hidden">
          <table className="w-full">
            <thead>
              <tr className="border-b border-[var(--ds-border-subtle)] text-xs text-[var(--ds-text-muted)] uppercase tracking-wide">
                <th className="text-left p-3 font-medium">{dm.colEmail}</th>
                <th className="text-left p-3 font-medium">{dm.colDisplayName}</th>
                <th className="text-left p-3 font-medium">{dm.colPlan}</th>
                <th className="text-left p-3 font-medium">{dm.colClients}</th>
                <th className="text-left p-3 font-medium">{dm.colStatus}</th>
                <th className="text-left p-3 font-medium">{dm.colRegistered}</th>
              </tr>
            </thead>
            <tbody>
              {(data?.accounts ?? []).map((a) => (
                <tr key={a.id} className="border-b border-[var(--ds-border-subtle)]">
                  <td className="p-3 text-sm font-medium">{a.email}</td>
                  <td className="p-3 text-sm text-[var(--ds-text-muted)]">
                    {a.displayName ?? "—"}
                  </td>
                  <td className="p-3 text-sm">{a.plan}</td>
                  <td className="p-3 text-sm">{a.clientCount}</td>
                  <td className="p-3">{statusBadge(a.status)}</td>
                  <td className="p-3 text-sm text-[var(--ds-text-muted)]">
                    {new Date(a.createdAt).toLocaleDateString("de-AT")}
                  </td>
                </tr>
              ))}
              {(!data || data.accounts.length === 0) && (
                <tr>
                  <td
                    colSpan={6}
                    className="p-6 text-center text-sm text-[var(--ds-text-muted)]"
                  >
                    Keine Developer Accounts
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </PageLayout>
  );
}
