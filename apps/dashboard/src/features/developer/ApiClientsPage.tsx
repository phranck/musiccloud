import { DashboardButton, DashboardButtonVariant } from "@musiccloud/dashboard-ui";
import { PlusCircle as PlusCircleIcon } from "@phosphor-icons/react";
import { useState } from "react";
import { PageHeader } from "@/components/ui/PageHeader";
import { PageBody, PageLayout } from "@/components/ui/PageLayout";
import { useI18n } from "@/context/I18nContext";
import { ApiClientStatus, ApiTokenStatus } from "@/features/developer/domain";
import {
  useApiAccessOverview,
  useCreateToken,
  useRevokeToken,
  useRotateToken,
} from "@/features/developer/hooks/useDeveloperData";

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
    const cls =
      status === ApiClientStatus.Active
        ? "bg-emerald-500/10 text-emerald-400"
        : status === ApiClientStatus.Suspended
          ? "bg-amber-500/10 text-amber-400"
          : status === ApiClientStatus.Revoked
            ? "bg-red-500/10 text-red-400"
            : "bg-gray-500/10 text-gray-400";
    const label =
      status === ApiClientStatus.Active
        ? dm.statusActive
        : status === ApiClientStatus.Suspended
          ? dm.statusSuspended
          : status === ApiClientStatus.Revoked
            ? dm.statusRevoked
            : status;
    return <span className={`inline-flex px-2 py-0.5 rounded text-xs font-semibold ${cls}`}>{label}</span>;
  };

  return (
    <PageLayout>
      <PageHeader title={dm.clientsTitle} />
      <PageBody className="gap-4 p-4">
        {revealToken && (
          <div className="rounded-md border border-emerald-500/30 bg-[var(--ds-surface)] p-5 text-center">
            <p className="text-sm font-semibold text-amber-400 mb-1">{dm.tokenRevealTitle}</p>
            <p className="text-xs text-[var(--ds-text-muted)] mb-3">{dm.tokenRevealHint}</p>
            <div className="rounded border border-emerald-500/20 bg-[var(--ds-bg)] p-3 mb-3">
              <code className="text-xs text-emerald-400 break-all">{revealToken}</code>
            </div>
            <DashboardButton
              type="button"
              variant={DashboardButtonVariant.Primary}
              size="action"
              onClick={() => handleCopy(revealToken)}
            >
              {copied ? dm.copied : dm.tokenRevealCopy}
            </DashboardButton>
          </div>
        )}

        {isLoading && <p className="text-sm text-[var(--ds-text-muted)]">{messages.common.loading}</p>}

        {!isLoading && (!data || data.clients.length === 0) && (
          <p className="text-sm text-[var(--ds-text-muted)]">{dm.clientsEmpty}</p>
        )}

        {!isLoading && data && data.clients.length > 0 && (
          <div className="rounded-lg border border-[var(--ds-border)] bg-[var(--ds-surface)] px-4">
            {data.clients.map((client) => (
              <div key={client.id} className="border-b border-[var(--ds-border)] last:border-0 py-4">
                <div className="flex items-center gap-3 mb-2">
                  <h3 className="text-sm font-semibold">{client.appName}</h3>
                  {statusBadge(client.status)}
                  <span className="ml-auto text-xs text-[var(--ds-text-muted)]">{client.contactEmail}</span>
                </div>
                <div className="flex gap-4 text-xs text-[var(--ds-text-muted)] mb-3">
                  <span>{client.requestsPerMinute}/min</span>
                  <span>{client.requestsPerDay}/Tag</span>
                </div>
                <div className="border-t border-[var(--ds-border-subtle)] pt-3">
                  <p className="text-xs text-[var(--ds-text-muted)] uppercase tracking-wide mb-2">
                    {dm.clientsTokensLabel}
                  </p>
                  {client.tokens.length === 0 ? (
                    <p className="text-xs text-[var(--ds-text-muted)] mb-2">{dm.clientsNoTokens}</p>
                  ) : (
                    <div className="space-y-1.5 mb-3">
                      {client.tokens.map((token) => (
                        <div
                          key={token.id}
                          className="flex items-center gap-2 rounded bg-[var(--ds-bg)] px-3 py-2 text-xs"
                        >
                          <code className="text-[var(--ds-accent)]">{token.tokenPrefix}••••••••</code>
                          {token.status === ApiTokenStatus.Active && (
                            <span className="rounded px-1.5 py-0.5 text-[10px] font-semibold bg-emerald-500/10 text-emerald-400">
                              Active
                            </span>
                          )}
                          <span className="ml-auto text-[var(--ds-text-muted)]">
                            {token.createdAt ? new Date(token.createdAt).toLocaleDateString("de-AT") : ""}
                          </span>
                          <DashboardButton
                            type="button"
                            variant={DashboardButtonVariant.Neutral}
                            size="action"
                            onClick={() => revokeToken.mutate(token.id)}
                            disabled={token.status !== ApiTokenStatus.Active || revokeToken.isPending}
                          >
                            {dm.clientsRevokeToken}
                          </DashboardButton>
                          <DashboardButton
                            type="button"
                            variant={DashboardButtonVariant.Neutral}
                            size="action"
                            onClick={() =>
                              rotateToken.mutate(token.id, {
                                onSuccess: (res) => setRevealToken(res.token.rawToken),
                              })
                            }
                            disabled={token.status !== ApiTokenStatus.Active || rotateToken.isPending}
                          >
                            {dm.clientsRotateToken}
                          </DashboardButton>
                        </div>
                      ))}
                    </div>
                  )}
                  <DashboardButton
                    type="button"
                    variant={DashboardButtonVariant.Primary}
                    size="action"
                    leadingIcon={<PlusCircleIcon weight="duotone" className="size-3.5" />}
                    onClick={() =>
                      createToken.mutate(client.id, {
                        onSuccess: (res) => setRevealToken(res.token.rawToken),
                      })
                    }
                    disabled={createToken.isPending}
                  >
                    {dm.clientsCreateToken}
                  </DashboardButton>
                </div>
              </div>
            ))}
          </div>
        )}
      </PageBody>
    </PageLayout>
  );
}
