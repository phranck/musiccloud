import { DashboardActionButton, DashboardActionId, DashboardInput } from "@musiccloud/dashboard-ui";
import { Code as CodeIcon, SpinnerGap as SpinnerGapIcon } from "@phosphor-icons/react";
import { useState } from "react";
import { useNavigate, useParams } from "react-router";
import { DashboardSection } from "@/components/ui/DashboardSection";
import { HeaderBackButton } from "@/components/ui/HeaderBackButton";
import { PageHeader } from "@/components/ui/PageHeader";
import { PageLayout } from "@/components/ui/PageLayout";
import { useI18n } from "@/context/I18nContext";
import { ApiTokenStatus } from "@/features/developer/domain";
import {
  useActivateToken,
  useApiAccessOverview,
  useCreateToken,
  useDeactivateToken,
  useUpdateClient,
} from "@/features/developer/hooks/useDeveloperData";
import { formatDate } from "@/features/developer/lib";

const labelClass = "block text-xs font-medium text-[var(--ds-text-muted)] mb-1";

/**
 * Rate-limit values as edited by the admin, kept separate from the loaded
 * client so unsaved edits survive re-renders without a sync effect.
 */
interface RateLimitDraft {
  min: number;
  day: number;
}

/**
 * Admin detail page for a single API client.
 *
 * Lets the admin adjust the client's rate limits, and manage its token
 * lifecycle (create, deactivate, reactivate). A freshly created token is
 * revealed exactly once in a copyable banner.
 *
 * Rate-limit inputs use a draft state that falls back to the loaded client
 * values until the admin edits them (derived state, no sync effect).
 */
export function ClientDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { messages, locale } = useI18n();
  const dm = messages.developer;
  const navigate = useNavigate();
  const { data, isLoading } = useApiAccessOverview();
  const createToken = useCreateToken();
  const activateToken = useActivateToken();
  const deactivateToken = useDeactivateToken();
  const updateClient = useUpdateClient();
  const [revealToken, setRevealToken] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [limitsDraft, setLimitsDraft] = useState<RateLimitDraft | null>(null);
  const [saved, setSaved] = useState(false);

  const client = data?.clients.find((c) => c.id === id) ?? null;

  const handleCopy = async (raw: string) => {
    await navigator.clipboard.writeText(raw);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  if (isLoading || !data) {
    return (
      <PageLayout>
        <PageHeader
          title=""
          renderLeading={() => (
            <HeaderBackButton label={dm.clientsTitle} onClick={() => navigate("/developer/clients")} />
          )}
        />
        <div className="flex items-center justify-center py-12">
          <SpinnerGapIcon className="w-6 h-6 animate-spin text-[var(--ds-text-muted)]" />
        </div>
      </PageLayout>
    );
  }

  if (!client) {
    return (
      <PageLayout>
        <PageHeader
          title=""
          renderLeading={() => (
            <HeaderBackButton label={dm.clientsTitle} onClick={() => navigate("/developer/clients")} />
          )}
        />
        <div className="flex items-center justify-center py-12">
          <p className="text-sm text-[var(--ds-text-muted)]">Client nicht gefunden.</p>
        </div>
      </PageLayout>
    );
  }

  const activeToken = client.tokens.find((t) => t.status === ApiTokenStatus.Active) ?? null;
  const revokedToken = client.tokens.find((t) => t.status === ApiTokenStatus.Revoked) ?? null;

  const limits = limitsDraft ?? { min: client.requestsPerMinute, day: client.requestsPerDay };

  function handleSave() {
    updateClient.mutate(
      { id: id!, requestsPerMinute: limits.min, requestsPerDay: limits.day },
      {
        onSuccess: () => {
          setSaved(true);
          setTimeout(() => setSaved(false), 2000);
        },
      },
    );
  }

  return (
    <PageLayout>
      <PageHeader
        title={client.appName}
        renderLeading={() => (
          <HeaderBackButton label={dm.clientsTitle} onClick={() => navigate("/developer/clients")} />
        )}
      />
      {revealToken && (
        <div className="rounded-md border border-emerald-500/30 bg-[var(--ds-surface)] p-5 text-center mb-4">
          <p className="text-sm font-semibold text-amber-400 mb-1">{dm.tokenRevealTitle}</p>
          <p className="text-xs text-[var(--ds-text-muted)] mb-3">{dm.tokenRevealHint}</p>
          <div className="rounded border border-emerald-500/20 bg-[var(--ds-bg)] p-3 mb-3">
            <code className="text-xs text-emerald-400 break-all">{revealToken}</code>
          </div>
          <DashboardActionButton
            action={DashboardActionId.Copy}
            label={copied ? messages.common.copied : dm.tokenRevealCopy}
            onClick={() => handleCopy(revealToken)}
            type="button"
          />
        </div>
      )}
      <DashboardSection className="overflow-hidden">
        <DashboardSection.Header icon={<CodeIcon weight="duotone" className="size-4" />} title={client.appName} />
        <DashboardSection.Body>
          <div className="flex gap-6 items-start">
            <div className="space-y-3">
              <div className="flex items-end gap-4">
                <div>
                  <label htmlFor="edit-min" className={labelClass}>
                    {dm.detailRateLimitMinute}
                  </label>
                  <DashboardInput
                    id="edit-min"
                    type="number"
                    value={limits.min.toString()}
                    onChange={(e) => setLimitsDraft({ ...limits, min: Number(e.target.value) })}
                  />
                </div>
                <div>
                  <label htmlFor="edit-day" className={labelClass}>
                    {dm.detailRateLimitDay}
                  </label>
                  <DashboardInput
                    id="edit-day"
                    type="number"
                    value={limits.day.toString()}
                    onChange={(e) => setLimitsDraft({ ...limits, day: Number(e.target.value) })}
                  />
                </div>
              </div>
            </div>
            <div>
              <div className={labelClass}>
                {dm.clientsTokensLabel}
                {(activeToken || revokedToken) && (
                  <span className="font-normal">
                    , erstellt: {formatDate((activeToken ?? revokedToken)!.createdAt, locale)}
                  </span>
                )}
              </div>
              {activeToken ? (
                <code className="text-sm text-[var(--ds-accent)]">{activeToken.tokenPrefix}</code>
              ) : revokedToken ? (
                <code className="text-sm text-[var(--ds-text-muted)]">{revokedToken.tokenPrefix}</code>
              ) : (
                <p className="text-sm text-[var(--ds-text-muted)]">{dm.clientsNoTokens}</p>
              )}
            </div>
          </div>
        </DashboardSection.Body>
        <DashboardSection.Footer>
          {activeToken ? (
            <DashboardActionButton
              action={DashboardActionId.Reject}
              label={dm.accountDetailDeactivate}
              onClick={() => deactivateToken.mutate(activeToken.id)}
              disabled={deactivateToken.isPending}
              type="button"
            />
          ) : revokedToken ? (
            <DashboardActionButton
              action={DashboardActionId.Approve}
              label={dm.statusActive}
              onClick={() => activateToken.mutate(revokedToken.id)}
              disabled={activateToken.isPending}
              type="button"
            />
          ) : (
            <DashboardActionButton
              action={DashboardActionId.Create}
              label={dm.clientsCreateToken}
              onClick={() => createToken.mutate(client.id, { onSuccess: (res) => setRevealToken(res.token.rawToken) })}
              disabled={createToken.isPending}
              type="button"
            />
          )}
          <DashboardActionButton
            action={DashboardActionId.Save}
            label={saved ? messages.common.saved : messages.common.save}
            onClick={handleSave}
            disabled={updateClient.isPending}
            type="button"
          />
        </DashboardSection.Footer>
      </DashboardSection>
    </PageLayout>
  );
}
