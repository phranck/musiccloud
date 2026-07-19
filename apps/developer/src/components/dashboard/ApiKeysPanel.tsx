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
  DeveloperProjectStatus,
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
import { AddIcon, ForbiddenIcon, KeyIcon, Refresh2Icon } from "@/lib/icons";

/** Shared classes for the small inline action buttons on token rows. */
const ACTION_BUTTON_CLASS = "button button--subtle text-nav";
const DANGER_ACTION_BUTTON_CLASS = "button button--danger text-nav";

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
        <p className="card-content-inset field__message field__message--error" role="alert">
          {actionError}
        </p>
      ) : null}

      {clients === null && !listError ? <p className="card-content-inset text-body text-fg-muted">Loading…</p> : null}
      {listError ? (
        <p className="card-content-inset field__message field__message--error">
          Could not load your client registrations. Reload the page to try again.
        </p>
      ) : null}
      {clients !== null && clients.length === 0 ? (
        <section className="surface-card px-6 py-5">
          <h2 className="text-body font-medium text-fg mb-1">No client registrations yet</h2>
          <p className="text-body text-fg-muted">
            Clients appear here once an access request has been approved.{" "}
            <a href="/dashboard/api-access" className="content-link text-fg">
              Request API access
            </a>{" "}
            to get started.
          </p>
        </section>
      ) : null}

      {(clients ?? []).map((client) => {
        const clientActive =
          client.status === ApiClientStatus.Active && client.projectStatus === DeveloperProjectStatus.Active;
        const displayedStatus =
          client.projectStatus === DeveloperProjectStatus.Active ? client.status : client.projectStatus;
        return (
          <section key={client.id} className="surface-card px-6 py-5">
            <div className="flex items-center justify-between gap-3 mb-1">
              <div className="min-w-0">
                <h2 className="text-body font-medium text-fg truncate">{client.projectDisplayName}</h2>
                <p className="text-nav text-fg-subtle truncate">
                  {client.appName} · {client.registrationType} · {client.publicClientId}
                </p>
              </div>
              <StatusBadge status={displayedStatus} />
            </div>
            <p className="text-nav text-fg-subtle mb-4">
              {client.requestsPerMinute} requests/minute · {client.requestsPerDay.toLocaleString("en-US")} requests/day
            </p>

            {client.tokens.length === 0 ? (
              <p className="text-body text-fg-muted mb-4">No keys yet. Create the first one below.</p>
            ) : (
              <ul className="flex flex-col divide-y divide-border mb-4">
                {client.tokens.map((token) => {
                  const tokenActive = token.status === ApiTokenStatus.Active;
                  const isPendingRevoke = pendingRevokeId === token.id;
                  return (
                    <li key={token.id} className="dashboard-token-row py-3 first:pt-0 last:pb-0">
                      <code className="text-code font-mono text-code-fg">{maskToken(token.tokenPrefix)}</code>
                      <StatusBadge status={token.status} />
                      <span className="text-nav text-fg-subtle">
                        Created {formatDate(token.createdAt)} · last used{" "}
                        {token.lastUsedAt ? formatDate(token.lastUsedAt) : "never"}
                      </span>
                      {tokenActive && clientActive ? (
                        <span className="dashboard-token-actions">
                          {isPendingRevoke ? (
                            <>
                              <span className="text-nav text-red-400">Revoke this key permanently?</span>
                              <button
                                type="button"
                                disabled={busy}
                                onClick={() => onConfirmRevoke(token.id)}
                                className={DANGER_ACTION_BUTTON_CLASS}
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
                                <Refresh2Icon className="size-4" aria-hidden="true" />
                                Rotate
                              </button>
                              <button
                                type="button"
                                disabled={busy}
                                onClick={() => dispatch({ type: KeysPanelActionType.RevokeArmed, tokenId: token.id })}
                                className={DANGER_ACTION_BUTTON_CLASS}
                              >
                                <ForbiddenIcon className="size-4" aria-hidden="true" />
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
                <AddIcon className="size-4" aria-hidden="true" />
                Create key
              </button>
            ) : (
              <p className="icon-text-first-line text-nav text-fg-subtle gap-1.5">
                <span className="icon-text-first-line__icon">
                  <KeyIcon aria-hidden="true" />
                </span>
                Key management is unavailable while this client is {client.status}.
              </p>
            )}
          </section>
        );
      })}
    </div>
  );
}
