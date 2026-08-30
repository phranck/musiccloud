/**
 * @file Reducer and state model for the tokens of one registration.
 *
 * Creating, rotating and revoking a token, plus the one-time reveal and the
 * revoke confirmation, are one finite state machine. It lives here as a pure
 * reducer so every transition can be exercised without rendering, and so the
 * component holds no logic of its own.
 *
 * The raw token appears in exactly one field of this state, and only after a
 * create or a rotation. Nothing else in the model carries it, which is what a
 * test asserts rather than a comment claiming it.
 */
import { type ApiAccessResult, type ApiTokenDto, HTTP_STATUS_TOO_MANY_REQUESTS } from "@/lib/apiAccessClient";
import type { PanelFailure } from "@/lib/projectsPanelState";

/** Action kinds for {@link registrationTokensReducer}. */
export const RegistrationTokensActionType = {
  /** A create or a rotation is in flight. */
  MutationStarted: "MutationStarted",
  /** A token was created; it is prepended and revealed once. */
  TokenCreated: "TokenCreated",
  /** A token was rotated; the replacement is prepended and revealed once. */
  TokenRotated: "TokenRotated",
  /** A token was revoked; it replaces its entry in the list. */
  TokenRevoked: "TokenRevoked",
  /** The backend refused the last action. */
  MutationFailed: "MutationFailed",
  /** The developer dismissed the reveal, which is the last sight of the value. */
  RevealDismissed: "RevealDismissed",
  /** The developer asked to revoke and is being asked to confirm. */
  RevokeArmed: "RevokeArmed",
  /** The developer backed out of the confirmation. */
  RevokeDisarmed: "RevokeDisarmed",
} as const;

/** A {@link RegistrationTokensActionType} member value. */
export type RegistrationTokensActionTypeValue =
  (typeof RegistrationTokensActionType)[keyof typeof RegistrationTokensActionType];

/** Full state of one registration's token list. */
export interface RegistrationTokensState {
  /** The tokens, newest first. */
  tokens: ApiTokenDto[];
  /** Whether a create, rotation or revocation is in flight. */
  busy: boolean;
  /** Why the last action was refused, or `null`. */
  failure: PanelFailure | null;
  /**
   * The key being shown once and the token it belongs to, or `null`. The only
   * place an issued value lives, and it is dropped as soon as that token stops
   * being the active one.
   */
  reveal: { tokenId: string; value: string } | null;
  /** The token awaiting a revoke confirmation, or `null`. */
  pendingRevokeId: string | null;
}

/** Discriminated union of every action. */
export type RegistrationTokensAction =
  | { type: typeof RegistrationTokensActionType.MutationStarted }
  | { type: typeof RegistrationTokensActionType.TokenCreated; token: ApiTokenDto }
  | { type: typeof RegistrationTokensActionType.TokenRotated; previousTokenId: string; token: ApiTokenDto }
  | { type: typeof RegistrationTokensActionType.TokenRevoked; token: ApiTokenDto }
  | { type: typeof RegistrationTokensActionType.MutationFailed; failure: PanelFailure }
  | { type: typeof RegistrationTokensActionType.RevealDismissed }
  | { type: typeof RegistrationTokensActionType.RevokeArmed; tokenId: string }
  | { type: typeof RegistrationTokensActionType.RevokeDisarmed };

/**
 * Drops the issued value from a token before it joins the list.
 *
 * The response to a create or a rotation carries the key itself. It belongs in
 * the reveal and nowhere else, so the list entry is built without it: once the
 * reveal is dismissed the value is gone from the page rather than sitting in a
 * field nobody renders.
 *
 * @param token - The token as the backend returned it.
 * @returns The same token without its issued value.
 */
function withoutIssuedValue(token: ApiTokenDto): ApiTokenDto {
  const { rawToken: _rawToken, ...metadata } = token;
  return metadata;
}

/**
 * The state a registration's token list starts in.
 *
 * @param tokens - The tokens the registration was loaded with.
 * @returns The initial state.
 */
export function initialRegistrationTokensState(tokens: readonly ApiTokenDto[]): RegistrationTokensState {
  return { tokens: [...tokens], busy: false, failure: null, reveal: null, pendingRevokeId: null };
}

/**
 * Reduces a failed token mutation to what the failure notice shows.
 *
 * A `429` is the per-developer token throttle rather than a fault, so its
 * retry window travels with it and the notice says how long to wait.
 *
 * @param result - Any failed result from a token route.
 * @returns The failure to display.
 */
export function toTokenFailure(result: ApiAccessResult<unknown>): PanelFailure {
  return {
    code: result.code,
    message:
      result.status === HTTP_STATUS_TOO_MANY_REQUESTS
        ? (result.message ?? "Too many key operations in a row.")
        : result.message,
    errorId: result.errorId,
    retryAfterSeconds: result.retryAfterSeconds,
  };
}

/**
 * Pure transition function for one registration's tokens.
 *
 * A rotation replaces the old token's entry with what the backend returned for
 * it and prepends the replacement, so the list matches the server without
 * being fetched again.
 *
 * @param state - The current state.
 * @param action - The dispatched action.
 * @returns The next state.
 */
export function registrationTokensReducer(
  state: RegistrationTokensState,
  action: RegistrationTokensAction,
): RegistrationTokensState {
  switch (action.type) {
    case RegistrationTokensActionType.MutationStarted:
      return { ...state, busy: true, failure: null, pendingRevokeId: null };
    case RegistrationTokensActionType.TokenCreated:
      return {
        ...state,
        busy: false,
        tokens: [withoutIssuedValue(action.token), ...state.tokens],
        reveal: action.token.rawToken ? { tokenId: action.token.id, value: action.token.rawToken } : null,
        failure: null,
      };
    case RegistrationTokensActionType.TokenRotated:
      return {
        ...state,
        busy: false,
        tokens: [
          withoutIssuedValue(action.token),
          ...state.tokens.map((token) =>
            token.id === action.previousTokenId ? { ...token, status: "rotated" } : token,
          ),
        ],
        reveal: action.token.rawToken ? { tokenId: action.token.id, value: action.token.rawToken } : null,
        failure: null,
      };
    case RegistrationTokensActionType.TokenRevoked:
      return {
        ...state,
        busy: false,
        tokens: state.tokens.map((token) => (token.id === action.token.id ? withoutIssuedValue(action.token) : token)),
        // A revoked key must not stay on screen with a quickstart telling
        // somebody to use it.
        reveal: state.reveal?.tokenId === action.token.id ? null : state.reveal,
        pendingRevokeId: null,
        failure: null,
      };
    case RegistrationTokensActionType.MutationFailed:
      return { ...state, busy: false, failure: action.failure, pendingRevokeId: null };
    case RegistrationTokensActionType.RevealDismissed:
      return { ...state, reveal: null };
    case RegistrationTokensActionType.RevokeArmed:
      return { ...state, pendingRevokeId: action.tokenId, failure: null };
    case RegistrationTokensActionType.RevokeDisarmed:
      return { ...state, pendingRevokeId: null };
    default:
      return state;
  }
}
