import { useState } from "react";
import { useNavigate } from "react-router";
import { PageHeader } from "@/components/ui/PageHeader";
import { PageLayout } from "@/components/ui/PageLayout";
import { useI18n } from "@/context/I18nContext";
import { useApiAccessOverview } from "@/features/developer/hooks/useDeveloperData";
import { ApiAccessRequestStatus } from "@/features/developer/domain";

export function ApiAccessRequestsPage() {
  const { messages } = useI18n();
  const dm = messages.developer;
  const [filter, setFilter] = useState<string | undefined>(undefined);
  const { data, isLoading } = useApiAccessOverview(filter);
  const navigate = useNavigate();

  const filters = [
    { key: undefined, label: dm.requestsFilterAll },
    { key: ApiAccessRequestStatus.Pending, label: dm.requestsFilterPending },
    { key: ApiAccessRequestStatus.Approved, label: dm.requestsFilterApproved },
    { key: ApiAccessRequestStatus.Rejected, label: dm.requestsFilterRejected },
  ];

  const statusBadge = (status: string) => {
    const map: Record<string, string> = {
      [ApiAccessRequestStatus.Pending]: "bg-amber-500/10 text-amber-400",
      [ApiAccessRequestStatus.Approved]: "bg-emerald-500/10 text-emerald-400",
      [ApiAccessRequestStatus.Rejected]: "bg-red-500/10 text-red-400",
    };
    const labelMap: Record<string, string> = {
      [ApiAccessRequestStatus.Pending]: dm.statusPending,
      [ApiAccessRequestStatus.Approved]: dm.statusApproved,
      [ApiAccessRequestStatus.Rejected]: dm.statusRejected,
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
      <PageHeader title={dm.requestsTitle} />
      <div className="flex gap-2 mb-4">
        {filters.map((f) => (
          <button
            key={f.key ?? "__all"}
            type="button"
            onClick={() => setFilter(f.key)}
            className={`px-3 py-1.5 rounded text-xs font-medium transition-colors ${
              filter === f.key
                ? "bg-[var(--ds-accent)] text-black"
                : "bg-[var(--ds-surface)] text-[var(--ds-text-muted)] hover:text-[var(--ds-text)]"
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>
      {isLoading ? (
        <div className="text-[var(--ds-text-muted)] text-sm">{messages.common.loading}</div>
      ) : (
        <div className="bg-[var(--ds-surface)] rounded-xl border border-[var(--ds-border-subtle)] overflow-hidden">
          <table className="w-full">
            <thead>
              <tr className="border-b border-[var(--ds-border-subtle)] text-xs text-[var(--ds-text-muted)] uppercase tracking-wide">
                <th className="text-left p-3 font-medium">{dm.colApp}</th>
                <th className="text-left p-3 font-medium">{dm.colDeveloper}</th>
                <th className="text-left p-3 font-medium">{dm.colTraffic}</th>
                <th className="text-left p-3 font-medium">{dm.colSubmitted}</th>
                <th className="text-left p-3 font-medium">{dm.colStatus}</th>
              </tr>
            </thead>
            <tbody>
              {(data?.requests ?? []).map((r) => (
                <tr
                  key={r.id}
                  onClick={() => navigate(`/developer/requests/${r.id}`)}
                  className="border-b border-[var(--ds-border-subtle)] hover:bg-[var(--ds-nav-hover-bg)] cursor-pointer transition-colors"
                >
                  <td className="p-3 text-sm font-medium">{r.appName}</td>
                  <td className="p-3 text-sm text-[var(--ds-text-muted)]">{r.contactEmail}</td>
                  <td className="p-3 text-sm">~{r.estimatedRequestsPerDay} / Tag</td>
                  <td className="p-3 text-sm text-[var(--ds-text-muted)]">
                    {new Date(r.submittedAt).toLocaleDateString("de-AT")}
                  </td>
                  <td className="p-3">{statusBadge(r.status)}</td>
                </tr>
              ))}
              {(!data || data.requests.length === 0) && (
                <tr>
                  <td colSpan={5} className="p-6 text-center text-sm text-[var(--ds-text-muted)]">
                    Keine Requests
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
