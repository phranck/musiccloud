/**
 * @file Reducer + state model for the "API keys" dashboard panel.
 *
 * Client list, mutation busy-flag, one-time token reveal and the two-step
 * revoke confirmation form one finite state machine; its transitions live
 * here as a pure reducer per the project Doctor policy (group related state,
 * keep logic out of component files).
 */
import { type ApiAccessResult, type ApiClientDto, HTTP_STATUS_TOO_MANY_REQUESTS } from "@/lib/apiAccessClient";

/**
 * Action kinds for {@link keysPanelReducer}, as a PascalCase `as const`
 * namespace per the project domain-literals policy.
 */
export const KeysPanelActionType = {
  /** A list fetch delivered the caller's clients. */
  ClientsLoaded: "ClientsLoaded",
  /** The list fetch failed; the panel shows an error line. */
  ClientsUnavailable: "ClientsUnavailable",
  /** A token mutation started; all actions disable. */
  MutationStarted: "MutationStarted",
  /** A token mutation succeeded; optionally opens the one-time reveal. */
  MutationSucceeded: "MutationSucceeded",
  /** A token mutation failed; the message is shown inline. */
  MutationFailed: "MutationFailed",
  /** The developer dismissed the one-time reveal box. */
  RevealDismissed: "RevealDismissed",
  /** The developer clicked Revoke; the row asks for confirmation. */
  RevokeArmed: "RevokeArmed",
  /** The developer cancelled the pending revoke confirmation. */
  RevokeDisarmed: "RevokeDisarmed",
} as const;

/** A {@link KeysPanelActionType} member value. */
export type KeysPanelActionTypeValue = (typeof KeysPanelActionType)[keyof typeof KeysPanelActionType];

/** A freshly revealed raw token plus the app it belongs to (memory-only). */
export interface RevealedToken {
  /** The full secret token, available exactly once. */
  rawToken: string;
  /** Name of the app the token belongs to. */
  appName: string;
}

/** Full state of the API-keys panel. */
export interface KeysPanelState {
  /** The caller's clients with tokens; `null` while loading. */
  clients: ApiClientDto[] | null;
  /** Whether the list fetch failed. */
  listError: boolean;
  /** Whether a token mutation is in flight (all actions disabled). */
  busy: boolean;
  /** Inline mutation error, or `null`. */
  actionError: string | null;
  /** The one-time reveal content, or `null` when closed. */
  reveal: RevealedToken | null;
  /** Token id awaiting revoke confirmation, or `null`. */
  pendingRevokeId: string | null;
}

/** Discriminated union of every panel action. */
export type KeysPanelAction =
  | { type: typeof KeysPanelActionType.ClientsLoaded; clients: ApiClientDto[] }
  | { type: typeof KeysPanelActionType.ClientsUnavailable }
  | { type: typeof KeysPanelActionType.MutationStarted }
  | { type: typeof KeysPanelActionType.MutationSucceeded; reveal: RevealedToken | null }
  | { type: typeof KeysPanelActionType.MutationFailed; message: string }
  | { type: typeof KeysPanelActionType.RevealDismissed }
  | { type: typeof KeysPanelActionType.RevokeArmed; tokenId: string }
  | { type: typeof KeysPanelActionType.RevokeDisarmed };

/** Initial panel state: list loading, nothing armed or revealed. */
export const KEYS_PANEL_INITIAL_STATE: KeysPanelState = {
  clients: null,
  listError: false,
  busy: false,
  actionError: null,
  reveal: null,
  pendingRevokeId: null,
};

/**
 * Pure transition function for the API-keys panel.
 *
 * @param state - The current panel state.
 * @param action - The dispatched action.
 * @returns The next panel state.
 */
export function keysPanelReducer(state: KeysPanelState, action: KeysPanelAction): KeysPanelState {
  switch (action.type) {
    case KeysPanelActionType.ClientsLoaded:
      return { ...state, clients: action.clients, listError: false };
    case KeysPanelActionType.ClientsUnavailable:
      return { ...state, listError: true };
    case KeysPanelActionType.MutationStarted:
      return { ...state, busy: true, actionError: null, pendingRevokeId: null };
    case KeysPanelActionType.MutationSucceeded:
      return { ...state, busy: false, reveal: action.reveal ?? state.reveal };
    case KeysPanelActionType.MutationFailed:
      return { ...state, busy: false, actionError: action.message };
    case KeysPanelActionType.RevealDismissed:
      return { ...state, reveal: null };
    case KeysPanelActionType.RevokeArmed:
      return { ...state, pendingRevokeId: action.tokenId };
    case KeysPanelActionType.RevokeDisarmed:
      return { ...state, pendingRevokeId: null };
    default:
      return state;
  }
}

/**
 * Builds the user-facing error line for a failed token mutation. A `429`
 * (the backend throttles token mutations to 20/min per developer) becomes a
 * concrete retry hint instead of a generic failure.
 *
 * @param result - The failed mutation result.
 * @returns The message to render.
 */
export function mutationErrorMessage(result: ApiAccessResult<unknown>): string {
  if (result.status === HTTP_STATUS_TOO_MANY_REQUESTS) {
    const wait = result.retryAfterSeconds ? ` Try again in ${result.retryAfterSeconds}s.` : " Try again shortly.";
    return `Too many key operations in a row.${wait}`;
  }
  return result.message ?? "Something went wrong. Please try again.";
}
