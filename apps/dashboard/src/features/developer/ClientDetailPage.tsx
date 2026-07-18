import { DashboardActionButton, DashboardActionId, DashboardInput } from "@musiccloud/dashboard-ui";
import { Code as CodeIcon, Copy as CopyIcon, SpinnerGap as SpinnerGapIcon } from "@phosphor-icons/react";
import { useState } from "react";
import { useNavigate, useParams } from "react-router";
import { DashboardSection } from "@/components/ui/DashboardSection";
import { HeaderBackButton } from "@/components/ui/HeaderBackButton";
import { PageHeader } from "@/components/ui/PageHeader";
import { PageLayout } from "@/components/ui/PageLayout";
import { dashboardCopy } from "@/copy/dashboard";
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
 * Rate-limit overrides as edited by the admin, kept separate from the loaded
 * client so unsaved edits survive re-renders without a sync effect. Values
 * are raw input strings: an empty field means "no override — inherit the
 * account tier's limit" and is submitted as `null` (MC-100).
 */
interface RateLimitDraft {
  min: string;
  day: string;
}

/**
 * Parses a rate-limit input value: an empty/blank field clears the override
 * (`null` = inherit from the tier), anything else is submitted numerically.
 */
function parseLimitInput(value: string): number | null {
  const trimmed = value.trim();
  return trimmed === "" ? null : Number(trimmed);
}

/**
 * Admin detail page for a single API client.
 *
 * Lets the admin set per-key rate-limit overrides (empty fields inherit the
 * owning account's tier limits — the placeholders show what applies), and
 * manage its token lifecycle (create, deactivate, reactivate). A client with
 * at least one override is marked "Custom". A freshly created token is
 * revealed exactly once in a copyable banner.
 *
 * Rate-limit inputs use a draft state that falls back to the loaded client
 * values until the admin edits them (derived state, no sync effect).
 */
export function ClientDetailPage() {
  const { id } = useParams<{ id: string }>();
  const messages = dashboardCopy;
  const dm = messages.developer;
  const navigate = useNavigate();
  const { data, isLoading } = useApiAccessOverview();
  const createToken = useCreateToken();
  const activateToken = useActivateToken();
  const deactivateToken = useDeactivateToken();
  const updateClient = useUpdateClient();
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
          <p className="text-sm text-[var(--ds-text-muted)]">Client not found.</p>
        </div>
      </PageLayout>
    );
  }

  const activeToken = client.tokens.find((t) => t.status === ApiTokenStatus.Active) ?? null;
  const revokedToken = client.tokens.find((t) => t.status === ApiTokenStatus.Revoked) ?? null;

  const limits = limitsDraft ?? {
    min: client.requestsPerMinute?.toString() ?? "",
    day: client.requestsPerDay?.toString() ?? "",
  };
  const hasOverride = client.requestsPerMinute != null || client.requestsPerDay != null;

  function handleSave() {
    updateClient.mutate(
      { id: id!, requestsPerMinute: parseLimitInput(limits.min), requestsPerDay: parseLimitInput(limits.day) },
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
      <DashboardSection className="overflow-hidden">
        <DashboardSection.Header
          icon={<CodeIcon weight="duotone" className="size-4" />}
          title={
            hasOverride ? (
              <span className="inline-flex items-center gap-2">
                {client.appName}
                <span className="rounded bg-violet-500/10 px-1.5 py-0.5 text-xs font-semibold text-violet-400 normal-case tracking-normal">
                  {dm.clientCustomBadge}
                </span>
              </span>
            ) : (
              client.appName
            )
          }
        />
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
                    min={1}
                    value={limits.min}
                    placeholder={String(client.tierRequestsPerMinute ?? client.effectiveRequestsPerMinute)}
                    onChange={(e) => setLimitsDraft({ ...limits, min: e.target.value })}
                  />
                </div>
                <div>
                  <label htmlFor="edit-day" className={labelClass}>
                    {dm.detailRateLimitDay}
                  </label>
                  <DashboardInput
                    id="edit-day"
                    type="number"
                    min={1}
                    value={limits.day}
                    placeholder={String(client.tierRequestsPerDay ?? client.effectiveRequestsPerDay)}
                    onChange={(e) => setLimitsDraft({ ...limits, day: e.target.value })}
                  />
                </div>
              </div>
              <p className="text-xs text-[var(--ds-text-muted)]">
                {dm.clientInheritsFrom.replace("{tier}", client.tierName ?? dm.tierNone)}
              </p>
            </div>
            <div>
              <div className={labelClass}>
                {dm.clientsTokensLabel}
                {(activeToken || revokedToken) && (
                  <span className="font-normal">, created: {formatDate((activeToken ?? revokedToken)!.createdAt)}</span>
                )}
              </div>
              {activeToken ? (
                <div className="flex items-start gap-2">
                  <code className="max-w-xs text-sm text-[var(--ds-accent)] break-all">
                    {activeToken.rawToken ?? activeToken.tokenPrefix}
                  </code>
                  {activeToken.rawToken && (
                    <button
                      type="button"
                      onClick={() => handleCopy(activeToken.rawToken!)}
                      aria-label={copied ? messages.common.copied : dm.tokenRevealCopy}
                      title={copied ? messages.common.copied : dm.tokenRevealCopy}
                      className="shrink-0 text-[var(--ds-text-muted)] hover:text-[var(--ds-accent)] transition-colors"
                    >
                      <CopyIcon weight="duotone" className="size-4" />
                    </button>
                  )}
                </div>
              ) : revokedToken ? (
                <code className="block max-w-xs text-sm text-[var(--ds-text-muted)] break-all">
                  {revokedToken.rawToken ?? revokedToken.tokenPrefix}
                </code>
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
              onClick={() => createToken.mutate(client.id)}
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
