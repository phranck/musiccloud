import { DashboardActionButton, DashboardActionId } from "@musiccloud/dashboard-ui";
import { Code as CodeIcon } from "@phosphor-icons/react";
import { useState } from "react";
import { DashboardSection } from "@/components/ui/DashboardSection";
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

const labelClass = "block text-xs font-medium text-[var(--ds-text-muted)] mb-1";

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
    if (status === ApiClientStatus.Active) {
      return (
        <span className="inline-flex px-2 py-0.5 rounded text-xs font-semibold bg-emerald-500/10 text-emerald-400">
          {dm.statusActive}
        </span>
      );
    }
    if (status === ApiClientStatus.Suspended) {
      return (
        <span className="inline-flex px-2 py-0.5 rounded text-xs font-semibold bg-amber-500/10 text-amber-400">
          {dm.statusSuspended}
        </span>
      );
    }
    return (
      <span className="inline-flex px-2 py-0.5 rounded text-xs font-semibold bg-red-500/10 text-red-400">
        {dm.statusRevoked}
      </span>
    );
  };

  return (
    <PageLayout>
      <PageHeader title={dm.clientsTitle} />
      <PageBody className="gap-4">
        {revealToken && (
          <div className="rounded-md border border-emerald-500/30 bg-[var(--ds-surface)] p-5 text-center">
            <p className="text-sm font-semibold text-amber-400 mb-1">{dm.tokenRevealTitle}</p>
            <p className="text-xs text-[var(--ds-text-muted)] mb-3">{dm.tokenRevealHint}</p>
            <div className="rounded border border-emerald-500/20 bg-[var(--ds-bg)] p-3 mb-3">
              <code className="text-xs text-emerald-400 break-all">{revealToken}</code>
            </div>
            <DashboardActionButton
              action={DashboardActionId.Copy}
              label={copied ? dm.copied : dm.tokenRevealCopy}
              onClick={() => handleCopy(revealToken)}
              type="button"
            />
          </div>
        )}

        {isLoading && <p className="text-sm text-[var(--ds-text-muted)]">{messages.common.loading}</p>}

        {!isLoading && (!data || data.clients.length === 0) && (
          <p className="text-sm text-[var(--ds-text-muted)]">{dm.clientsEmpty}</p>
        )}

        {!isLoading &&
          data?.clients.map((client) => (
            <DashboardSection key={client.id} className="overflow-hidden">
              <DashboardSection.Header
                icon={<CodeIcon weight="duotone" className="size-4" />}
                title={client.appName}
                addOn={statusBadge(client.status)}
              />
              <DashboardSection.Body>
                <div className="flex gap-6 items-start">
                  <div>
                    <div className={labelClass}>{dm.colDeveloper}</div>
                    <a href={`mailto:${client.contactEmail}`} className="text-sm text-[var(--ds-text)] hover:underline">
                      {client.contactEmail}
                    </a>
                  </div>
                  <div>
                    <div className={labelClass}>{dm.colTraffic}</div>
                    <div className="text-sm">
                      {client.requestsPerMinute}
                      {dm.perMinute} &middot; {client.requestsPerDay}
                      {dm.perDay}
                    </div>
                  </div>
                  <div className="flex-1">
                    <div className={labelClass}>{dm.descriptionLabel}</div>
                    <p className="text-sm">{client.description || "—"}</p>
                  </div>
                </div>

                <div className="border-t border-[var(--ds-border-subtle)] pt-3">
                  <h3 className="text-xs font-semibold uppercase tracking-wider text-[var(--ds-text-muted)] mb-2">
                    {dm.clientsTokensLabel}
                  </h3>
                  {client.tokens.length === 0 ? (
                    <p className="text-xs text-[var(--ds-text-muted)]">{dm.clientsNoTokens}</p>
                  ) : (
                    <div className="space-y-1.5 mb-3">
                      {client.tokens.map((token) => (
                        <div
                          key={token.id}
                          className="flex items-center gap-3 rounded bg-[var(--ds-bg)] px-3 py-2 text-xs"
                        >
                          <code className="text-[var(--ds-accent)]">{token.tokenPrefix}••••••••</code>
                          {token.status === ApiTokenStatus.Active && (
                            <span className="rounded px-1.5 py-0.5 text-[10px] font-semibold bg-emerald-500/10 text-emerald-400">
                              Active
                            </span>
                          )}
                          <span className="flex-1 text-[var(--ds-text-muted)] text-right">
                            {token.createdAt ? new Date(token.createdAt).toLocaleDateString("de-AT") : ""}
                          </span>
                          <DashboardActionButton
                            action={DashboardActionId.Delete}
                            label={dm.clientsRevokeToken}
                            onClick={() => revokeToken.mutate(token.id)}
                            disabled={token.status !== ApiTokenStatus.Active || revokeToken.isPending}
                            size="action"
                            type="button"
                          />
                          <DashboardActionButton
                            action={DashboardActionId.Edit}
                            label={dm.clientsRotateToken}
                            onClick={() =>
                              rotateToken.mutate(token.id, {
                                onSuccess: (res) => setRevealToken(res.token.rawToken),
                              })
                            }
                            disabled={token.status !== ApiTokenStatus.Active || rotateToken.isPending}
                            size="action"
                            type="button"
                          />
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </DashboardSection.Body>
              <DashboardSection.Footer>
                <DashboardActionButton
                  action={DashboardActionId.Create}
                  label={dm.clientsCreateToken}
                  onClick={() =>
                    createToken.mutate(client.id, {
                      onSuccess: (res) => setRevealToken(res.token.rawToken),
                    })
                  }
                  disabled={createToken.isPending}
                  type="button"
                />
              </DashboardSection.Footer>
            </DashboardSection>
          ))}
      </PageBody>
    </PageLayout>
  );
}
