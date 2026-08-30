import { useCallback, useReducer, useRef } from "react";
import { SubmitButton } from "@/components/auth/SubmitButton";
import { ApiFailureNotice } from "@/components/dashboard/ApiFailureNotice";
import { StatusBadge } from "@/components/dashboard/StatusBadge";
import { TokenRevealBox } from "@/components/dashboard/TokenRevealBox";
import {
  type ApiTokenDto,
  ApiTokenStatus,
  createClientToken,
  maskToken,
  revokeClientToken,
  rotateClientToken,
} from "@/lib/apiAccessClient";
import { ButtonVariant } from "@/lib/buttonVariant";
import { formatDate } from "@/lib/formatDate";
import {
  initialRegistrationTokensState,
  RegistrationTokensActionType,
  registrationTokensReducer,
  toTokenFailure,
} from "@/lib/registrationTokensState";

/**
 * Props for {@link RegistrationTokens}.
 */
export interface RegistrationTokensProps {
  /** The registration these keys belong to. */
  registrationId: string;
  /** The registration's name, shown with the one-time reveal for context. */
  registrationName: string;
  /** The tokens the registration was loaded with. */
  tokens: readonly ApiTokenDto[];
  /** Whether the registration can currently hold a working key. */
  registrationActive: boolean;
}

/** Said before a rotation, so the consequence is known before it happens. */
const ROTATE_WARNING =
  "Rotating issues a new key and stops the current one immediately. Anything still using the old key fails from that moment, so put the new one in place first.";
/** Said before a revocation. */
const REVOKE_WARNING = "Revoking stops this key at once. Every request still using it fails until you issue a new one.";

/**
 * The keys belonging to one registration: what exists, and how to issue,
 * rotate and stop one.
 *
 * Keys live here rather than in a flat account-wide list, because a key that
 * is not shown under its registration stops saying which application it
 * belongs to, and that is the property the whole registration model exists to
 * provide.
 *
 * A newly issued key is shown exactly once. Focus moves to the reveal so a
 * keyboard user lands on it, and returns to the button that opened it when the
 * reveal is dismissed.
 *
 * @param props - See {@link RegistrationTokensProps}.
 * @returns The key list for this registration.
 */
export function RegistrationTokens({
  registrationId,
  registrationName,
  tokens,
  registrationActive,
}: RegistrationTokensProps) {
  const [state, dispatch] = useReducer(registrationTokensReducer, tokens, initialRegistrationTokensState);
  const createButtonRef = useRef<HTMLDivElement>(null);

  const onCreate = useCallback(async () => {
    dispatch({ type: RegistrationTokensActionType.MutationStarted });
    const result = await createClientToken(registrationId);
    if (result.ok && result.data) {
      dispatch({ type: RegistrationTokensActionType.TokenCreated, token: result.data.token });
      return;
    }
    dispatch({ type: RegistrationTokensActionType.MutationFailed, failure: toTokenFailure(result) });
  }, [registrationId]);

  const onRotate = useCallback(async (tokenId: string) => {
    dispatch({ type: RegistrationTokensActionType.MutationStarted });
    const result = await rotateClientToken(tokenId);
    if (result.ok && result.data) {
      dispatch({
        type: RegistrationTokensActionType.TokenRotated,
        previousTokenId: tokenId,
        token: result.data.token,
      });
      return;
    }
    dispatch({ type: RegistrationTokensActionType.MutationFailed, failure: toTokenFailure(result) });
  }, []);

  const onRevoke = useCallback(async (tokenId: string) => {
    dispatch({ type: RegistrationTokensActionType.MutationStarted });
    const result = await revokeClientToken(tokenId);
    if (result.ok && result.data) {
      dispatch({ type: RegistrationTokensActionType.TokenRevoked, token: result.data.token });
      return;
    }
    dispatch({ type: RegistrationTokensActionType.MutationFailed, failure: toTokenFailure(result) });
  }, []);

  const onDismissReveal = useCallback(() => {
    dispatch({ type: RegistrationTokensActionType.RevealDismissed });
    // The reveal took focus on mount, so it hands it back rather than dropping
    // a keyboard user at the top of the document.
    createButtonRef.current?.querySelector("button")?.focus();
  }, []);

  const { tokens: current, busy, failure, revealedToken, pendingRevokeId } = state;
  const activeToken = current.find((token) => token.status === ApiTokenStatus.Active) ?? null;

  return (
    <div className="flex flex-col gap-3 mt-3" data-registration-tokens>
      <p className="text-nav text-fg-subtle">Keys</p>

      {revealedToken && (
        <TokenRevealBox rawToken={revealedToken} appName={registrationName} onDismiss={onDismissReveal} />
      )}

      {failure && <ApiFailureNotice {...failure} />}

      {current.length === 0 && <p className="text-nav text-fg-subtle">No key yet.</p>}

      {current.length > 0 && (
        <ul className="flex flex-col gap-2">
          {current.map((token) => (
            <li key={token.id} className="flex flex-col gap-1">
              <div className="flex items-center gap-2 flex-wrap">
                <code className="text-code font-mono text-code-fg">{maskToken(token.tokenPrefix)}</code>
                <StatusBadge status={token.status} />
                <span className="text-nav text-fg-subtle">
                  created {formatDate(token.createdAt)} ·{" "}
                  {token.lastUsedAt ? `last used ${formatDate(token.lastUsedAt)}` : "never used"}
                </span>
              </div>

              {token.status === ApiTokenStatus.Active && (
                <>
                  {pendingRevokeId === token.id ? (
                    <div className="flex flex-col gap-2">
                      <p className="text-nav text-gold">{REVOKE_WARNING}</p>
                      <div className="flex gap-3">
                        <div className="sm:max-w-xs flex-1">
                          <SubmitButton
                            variant={ButtonVariant.Danger}
                            type="button"
                            loading={busy}
                            onClick={() => onRevoke(token.id)}
                          >
                            Revoke this key
                          </SubmitButton>
                        </div>
                        <div className="sm:max-w-xs flex-1">
                          <SubmitButton
                            variant={ButtonVariant.Secondary}
                            type="button"
                            onClick={() => dispatch({ type: RegistrationTokensActionType.RevokeDisarmed })}
                          >
                            Keep it
                          </SubmitButton>
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="flex flex-wrap gap-3">
                      <button
                        type="button"
                        onClick={() => onRotate(token.id)}
                        disabled={busy}
                        title={ROTATE_WARNING}
                        className="button button--secondary text-body"
                      >
                        Rotate
                      </button>
                      <button
                        type="button"
                        onClick={() => dispatch({ type: RegistrationTokensActionType.RevokeArmed, tokenId: token.id })}
                        disabled={busy}
                        className="button button--danger text-body"
                      >
                        Revoke
                      </button>
                    </div>
                  )}
                  {pendingRevokeId !== token.id && <p className="text-nav text-fg-subtle">{ROTATE_WARNING}</p>}
                </>
              )}
            </li>
          ))}
        </ul>
      )}

      {registrationActive && !activeToken && (
        <div ref={createButtonRef} className="sm:max-w-xs">
          <SubmitButton type="button" loading={busy} onClick={onCreate}>
            Create a key
          </SubmitButton>
        </div>
      )}

      {!registrationActive && (
        <p className="text-nav text-fg-subtle">
          This registration is not active, so it cannot hold a working key. Reactivate it first.
        </p>
      )}
    </div>
  );
}
