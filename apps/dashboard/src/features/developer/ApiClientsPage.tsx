import { useState } from "react";
import { PageHeader } from "@/components/ui/PageHeader";
import { PageLayout } from "@/components/ui/PageLayout";
import { useI18n } from "@/context/I18nContext";
import {
  useApiAccessOverview,
  useCreateToken,
  useRevokeToken,
  useRotateToken,
} from "@/features/developer/hooks/useDeveloperData";
import { ApiClientStatus, ApiTokenStatus } from "@/features/developer/domain";

export function ApiClientsPage() {
  const { messages } = useI18n();
  const dm = messages.developer;
  const { data, isLoading } = useApiAccessOverview();
  const createToken = useCreateToken();
  const revokeToken = useRevokeToken();
  const rotateToken = useRotateToken();
  const [revealToken, setRevealToken] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const handleCopy = async (raw: string) => {
    await navigator.clipboard.writeText(raw);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const statusBadge = (status: string) => {
    const map: Record<string, string> = {
      [ApiClientStatus.Active]: "bg-emerald-500/10 text-emerald-400",
      [ApiClientStatus.Suspended]: "bg-amber-500/10 text-amber-400",
      [ApiClientStatus.Revoked]: "bg-red-500/10 text-red-400",
    };
    const labelMap: Record<string, string> = {
      [ApiClientStatus.Active]: dm.statusActive,
      [ApiClientStatus.Suspended]: dm.statusSuspended,
      [ApiClientStatus.Revoked]: dm.statusRevoked,
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
      <PageHeader title={dm.clientsTitle} />

      {revealToken && (
        <div className="bg-[var(--ds-surface)] rounded-xl border border-emerald-500/30 p-5 mb-6 text-center">
          <div className="text-sm font-semibold text-amber-400 mb-1">
            {dm.tokenRevealTitle}
          </div>
          <div className="text-xs text-[var(--ds-text-muted)] mb-3">
            {dm.tokenRevealHint}
          </div>
          <div className="bg-[var(--ds-bg)] border border-emerald-500/20 rounded p-3 mb-3">
            <code className="text-xs text-emerald-400 break-all">{revealToken}</code>
          </div>
          <button
            type="button"
            onClick={() => handleCopy(revealToken)}
            className="px-4 py-1.5 rounded bg-[var(--ds-accent)] text-black text-xs font-semibold"
          >
            {copied ? "Kopiert!" : dm.tokenRevealCopy}
          </button>
        </div>
      )}

      {isLoading ? (
        <div className="text-[var(--ds-text-muted)] text-sm">{messages.common.loading}</div>
      ) : !data || data.clients.length === 0 ? (
        <div className="text-[var(--ds-text-muted)] text-sm">{dm.clientsEmpty}</div>
      ) : (
        <div className="space-y-4">
          {data.clients.map((client) => (
            <div
              key={client.id}
              className="bg-[var(--ds-surface)] rounded-xl border border-[var(--ds-border-subtle)] p-4"
            >
              <div className="flex items-center gap-3 mb-3">
                <h3 className="text-sm font-semibold">{client.appName}</h3>
                {statusBadge(client.status)}
                <span className="ml-auto text-xs text-[var(--ds-text-muted)]">
                  {client.contactEmail}
                </span>
              </div>
              <div className="flex gap-4 text-xs text-[var(--ds-text-muted)] mb-4">
                <span>{client.requestsPerMinute}/min</span>
                <span>{client.requestsPerDay}/Tag</span>
              </div>
              <div className="border-t border-[var(--ds-border-subtle)] pt-3">
                <div className="text-xs text-[var(--ds-text-muted)] uppercase tracking-wide mb-2">
                  {dm.clientsTokensLabel}
                </div>
                {client.tokens.length === 0 ? (
                  <div className="text-xs text-[var(--ds-text-muted)]">{dm.clientsNoTokens}</div>
                ) : (
                  <div className="space-y-1.5 mb-3">
                    {client.tokens.map((token) => (
                      <div
                        key={token.id}
                        className="flex items-center gap-2 bg-[var(--ds-bg)] rounded px-3 py-2 text-xs"
                      >
                        <code className="text-[var(--ds-accent)]">
                          {token.tokenPrefix}••••••••
                        </code>
                        {token.status === ApiTokenStatus.Active && (
                          <span className="px-1.5 py-0.5 rounded text-[10px] font-semibold bg-emerald-500/10 text-emerald-400">
                            Active
                          </span>
                        )}
                        <span className="ml-auto text-[var(--ds-text-muted)]">
                          {token.createdAt
                            ? new Date(token.createdAt).toLocaleDateString("de-AT")
                            : ""}
                        </span>
                        <button
                          type="button"
                          onClick={() => revokeToken.mutate(token.id)}
                          disabled={
                            token.status !== ApiTokenStatus.Active || revokeToken.isPending
                          }
                          className="px-2 py-0.5 rounded border border-[var(--ds-border)] text-[10px] text-[var(--ds-text-muted)] hover:text-red-400 disabled:opacity-30"
                        >
                          {dm.clientsRevokeToken}
                        </button>
                        <button
                          type="button"
                          onClick={() =>
                            rotateToken.mutate(token.id, {
                              onSuccess: (res) => setRevealToken(res.token.rawToken),
                            })
                          }
                          disabled={
                            token.status !== ApiTokenStatus.Active || rotateToken.isPending
                          }
                          className="px-2 py-0.5 rounded border border-[var(--ds-border)] text-[10px] text-[var(--ds-text-muted)] hover:text-[var(--ds-text)] disabled:opacity-30"
                        >
                          {dm.clientsRotateToken}
                        </button>
                      </div>
                    ))}
                  </div>
                )}
                <button
                  type="button"
                  onClick={() =>
                    createToken.mutate(client.id, {
                      onSuccess: (res) => setRevealToken(res.token.rawToken),
                    })
                  }
                  disabled={createToken.isPending}
                  className="px-3 py-1 rounded bg-[var(--ds-accent)] text-black text-xs font-semibold disabled:opacity-40"
                >
                  {dm.clientsCreateToken}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </PageLayout>
  );
}
