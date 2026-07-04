import { ArrowsClockwiseIcon, KeyIcon, PlusIcon, ProhibitIcon } from "@phosphor-icons/react";
import { useCallback, useEffect, useReducer } from "react";
import { StatusBadge } from "@/components/dashboard/StatusBadge";
import { TokenRevealBox } from "@/components/dashboard/TokenRevealBox";
import {
  type ApiAccessResult,
  type ApiClientDto,
  ApiClientStatus,
  type ApiTokenDto,
  ApiTokenStatus,
  createClientToken,
  listApiClients,
  maskToken,
  revokeClientToken,
  rotateClientToken,
} from "@/lib/apiAccessClient";
import {
  KEYS_PANEL_INITIAL_STATE,
  KeysPanelActionType,
  keysPanelReducer,
  mutationErrorMessage,
} from "@/lib/apiKeysPanelState";
import { formatDate } from "@/lib/formatDate";

/** Shared classes for the small inline action buttons on token rows. */
const ACTION_BUTTON_CLASS =
  "inline-flex items-center gap-1 rounded-button border border-border-strong px-2.5 py-1 text-nav font-medium text-fg hover:border-fg-subtle transition-colors disabled:cursor-not-allowed disabled:opacity-60";

/**
 * "API keys" dashboard island: the caller's approved clients, each with its
 * quota line and token list (masked prefix, status, created / last-used
 * dates), plus create / rotate / revoke actions. All state lives in
 * `keysPanelReducer` (`lib/apiKeysPanelState.ts`). A successful create or
 * rotate opens a one-time {@link TokenRevealBox}; revoking asks for an
 * inline confirmation first. After every successful mutation the list is
 * refetched so statuses and rotation chains stay authoritative.
 *
 * Rendered with `client:load` from `dashboard/api-keys.astro`.
 *
 * @returns The API-keys panel content.
 */
export function ApiKeysPanel() {
  const [state, dispatch] = useReducer(keysPanelReducer, KEYS_PANEL_INITIAL_STATE);
  const { clients, listError, busy, actionError, reveal, pendingRevokeId } = state;

  const refetch = useCallback(async (signal?: AbortSignal) => {
    const result = await listApiClients(signal);
    if (signal?.aborted) return;
    if (result.ok && result.data) {
      dispatch({ type: KeysPanelActionType.ClientsLoaded, clients: result.data.clients });
    } else {
      dispatch({ type: KeysPanelActionType.ClientsUnavailable });
    }
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    refetch(controller.signal);
    return () => controller.abort();
  }, [refetch]);

  /**
   * Runs one token mutation with shared busy/error handling and refetches
   * the list on success; create/rotate additionally open the reveal box.
   */
  const runMutation = useCallback(
    async (mutate: () => Promise<ApiAccessResult<{ token: ApiTokenDto }>>, appName?: string) => {
      dispatch({ type: KeysPanelActionType.MutationStarted });
      const result = await mutate();
      if (result.ok) {
        await refetch();
        const rawToken = result.data?.token.rawToken;
        dispatch({
          type: KeysPanelActionType.MutationSucceeded,
          reveal: appName && rawToken ? { rawToken, appName } : null,
        });
      } else {
        dispatch({ type: KeysPanelActionType.MutationFailed, message: mutationErrorMessage(result) });
      }
    },
    [refetch],
  );

  const onCreate = useCallback(
    (client: ApiClientDto) => runMutation(() => createClientToken(client.id), client.appName),
    [runMutation],
  );
  const onRotate = useCallback(
    (client: ApiClientDto, tokenId: string) => runMutation(() => rotateClientToken(tokenId), client.appName),
    [runMutation],
  );
  const onConfirmRevoke = useCallback(
    (tokenId: string) => runMutation(() => revokeClientToken(tokenId)),
    [runMutation],
  );
  const onDismissReveal = useCallback(() => dispatch({ type: KeysPanelActionType.RevealDismissed }), []);

  return (
    <div className="flex flex-col gap-6">
      {reveal ? (
        <TokenRevealBox rawToken={reveal.rawToken} appName={reveal.appName} onDismiss={onDismissReveal} />
      ) : null}
      {actionError ? (
        <p className="text-body text-red-400" role="alert">
          {actionError}
        </p>
      ) : null}

      {clients === null && !listError ? <p className="text-body text-fg-muted">Loading…</p> : null}
      {listError ? (
        <p className="text-body text-red-400">Could not load your API clients. Reload the page to try again.</p>
      ) : null}
      {clients !== null && clients.length === 0 ? (
        <section className="rounded-card border border-border bg-surface px-6 py-5">
          <h2 className="text-body font-medium text-fg mb-1">No API clients yet</h2>
          <p className="text-body text-fg-muted">
            Clients appear here once an access request has been approved.{" "}
            <a href="/dashboard/api-access" className="text-fg text-link">
              Request API access
            </a>{" "}
            to get started.
          </p>
        </section>
      ) : null}

      {(clients ?? []).map((client) => {
        const clientActive = client.status === ApiClientStatus.Active;
        return (
          <section key={client.id} className="rounded-card border border-border bg-surface px-6 py-5">
            <div className="flex items-center justify-between gap-3 mb-1">
              <h2 className="text-body font-medium text-fg truncate">{client.appName}</h2>
              <StatusBadge status={client.status} />
            </div>
            <p className="text-nav text-fg-subtle mb-4">
              {client.requestsPerMinute} requests/minute · {client.requestsPerDay.toLocaleString("en-US")} requests/day
            </p>

            {client.tokens.length === 0 ? (
              <p className="text-body text-fg-muted mb-4">No keys yet — create the first one below.</p>
            ) : (
              <ul className="flex flex-col divide-y divide-border mb-4">
                {client.tokens.map((token) => {
                  const tokenActive = token.status === ApiTokenStatus.Active;
                  const isPendingRevoke = pendingRevokeId === token.id;
                  return (
                    <li
                      key={token.id}
                      className="py-3 first:pt-0 last:pb-0 flex flex-wrap items-center gap-x-3 gap-y-2"
                    >
                      <code className="text-code font-mono text-code-fg">{maskToken(token.tokenPrefix)}</code>
                      <StatusBadge status={token.status} />
                      <span className="text-nav text-fg-subtle">
                        Created {formatDate(token.createdAt)} · last used{" "}
                        {token.lastUsedAt ? formatDate(token.lastUsedAt) : "never"}
                      </span>
                      {tokenActive && clientActive ? (
                        <span className="ml-auto flex items-center gap-2">
                          {isPendingRevoke ? (
                            <>
                              <span className="text-nav text-red-400">Revoke this key permanently?</span>
                              <button
                                type="button"
                                disabled={busy}
                                onClick={() => onConfirmRevoke(token.id)}
                                className={`${ACTION_BUTTON_CLASS} border-red-400/60 text-red-400 hover:border-red-400`}
                              >
                                Confirm revoke
                              </button>
                              <button
                                type="button"
                                disabled={busy}
                                onClick={() => dispatch({ type: KeysPanelActionType.RevokeDisarmed })}
                                className={ACTION_BUTTON_CLASS}
                              >
                                Cancel
                              </button>
                            </>
                          ) : (
                            <>
                              <button
                                type="button"
                                disabled={busy}
                                onClick={() => onRotate(client, token.id)}
                                className={ACTION_BUTTON_CLASS}
                              >
                                <ArrowsClockwiseIcon weight="duotone" className="size-4" aria-hidden="true" />
                                Rotate
                              </button>
                              <button
                                type="button"
                                disabled={busy}
                                onClick={() => dispatch({ type: KeysPanelActionType.RevokeArmed, tokenId: token.id })}
                                className={`${ACTION_BUTTON_CLASS} border-red-400/60 text-red-400 hover:border-red-400`}
                              >
                                <ProhibitIcon weight="duotone" className="size-4" aria-hidden="true" />
                                Revoke
                              </button>
                            </>
                          )}
                        </span>
                      ) : null}
                    </li>
                  );
                })}
              </ul>
            )}

            {clientActive ? (
              <button type="button" disabled={busy} onClick={() => onCreate(client)} className={ACTION_BUTTON_CLASS}>
                <PlusIcon weight="bold" className="size-4" aria-hidden="true" />
                Create key
              </button>
            ) : (
              <p className="text-nav text-fg-subtle flex items-center gap-1.5">
                <KeyIcon weight="duotone" className="size-4" aria-hidden="true" />
                Key management is unavailable while this client is {client.status}.
              </p>
            )}
          </section>
        );
      })}
    </div>
  );
}
