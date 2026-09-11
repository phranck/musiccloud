/**
 * @file The state of the picture on a developer's profile.
 *
 * A developer may hold three pictures at once and shows one of them, so the
 * three, the choice, and what the last action said are one state rather than
 * five. Keeping it here rather than in the component means the transitions can
 * be read and tested without rendering anything.
 */

import { AvatarSource, type AvatarSourceValue, isAvatarSource } from "@/lib/avatarSource";

/** The picture fields as the account payload carries them. */
export interface AvatarAccount {
  avatarUrl: string | null;
  uploadedAvatarUrl: string | null;
  gravatarUrl: string | null;
  providerAvatarUrl: string | null;
  avatarSource: string | null;
}

/** What the card knows at any moment. */
export interface AvatarState {
  /** The picture being shown, or `null` where the account holds none. */
  shown: string | null;
  /** What the developer uploaded. */
  uploaded: string | null;
  /** What Gravatar last answered. */
  gravatar: string | null;
  /** What an identity provider handed over. */
  provider: string | null;
  /** Which of the three is chosen, or `null` for whatever the portal finds. */
  source: AvatarSourceValue | null;
  /** Whether a request is in flight, which disables the controls. */
  busy: boolean;
  /** What went wrong, in the developer's words. */
  error: string | null;
  /** What the last lookup found, which is not an error. */
  notice: string | null;
}

/** What can happen to the picture. */
export const AvatarActionType = {
  /** A request went out. */
  Started: "Started",
  /** The account came back, so every field is replaced by what is stored. */
  Stored: "Stored",
  /** The lookup answered, with or without a picture. */
  Looked: "Looked",
  /** Something failed, and the message is for the developer. */
  Failed: "Failed",
} as const;

/** One of the actions in {@link AvatarActionType}. */
export type AvatarAction =
  | { type: typeof AvatarActionType.Started }
  | { type: typeof AvatarActionType.Stored; account: AvatarAccount }
  | { type: typeof AvatarActionType.Looked; account: AvatarAccount; found: boolean }
  | { type: typeof AvatarActionType.Failed; message: string };

/**
 * The picture fields of an account, as this card holds them.
 *
 * @param account - The account payload.
 * @returns The four fields and the choice.
 */
function pictures(account: AvatarAccount) {
  return {
    shown: account.avatarUrl,
    uploaded: account.uploadedAvatarUrl,
    gravatar: account.gravatarUrl,
    provider: account.providerAvatarUrl,
    source: isAvatarSource(account.avatarSource) ? account.avatarSource : null,
  };
}

/**
 * The state this card starts in.
 *
 * @param account - The account as the page rendered it.
 * @returns The initial state.
 */
export function initialAvatarState(account: AvatarAccount): AvatarState {
  return { ...pictures(account), busy: false, error: null, notice: null };
}

/**
 * Applies one action to the picture state.
 *
 * @param state - Where the card is.
 * @param action - What happened.
 * @returns Where it goes.
 */
export function avatarReducer(state: AvatarState, action: AvatarAction): AvatarState {
  switch (action.type) {
    case AvatarActionType.Started:
      return { ...state, busy: true, error: null, notice: null };
    case AvatarActionType.Stored:
      return { ...state, ...pictures(action.account), busy: false, error: null };
    case AvatarActionType.Looked:
      return {
        ...state,
        ...pictures(action.account),
        busy: false,
        error: null,
        notice: action.found ? "Found one, and it is shown." : "No Gravatar for this address.",
      };
    case AvatarActionType.Failed:
      return { ...state, busy: false, error: action.message };
    default:
      return state;
  }
}

/**
 * The pictures the account actually holds, in the order they are offered.
 *
 * @param state - The card's state.
 * @returns One entry per picture held, which is what the chooser lists.
 */
export function heldPictures(state: AvatarState): { source: AvatarSourceValue; url: string }[] {
  return [
    state.uploaded ? { source: AvatarSource.Upload, url: state.uploaded } : null,
    state.gravatar ? { source: AvatarSource.Gravatar, url: state.gravatar } : null,
    state.provider ? { source: AvatarSource.Provider, url: state.provider } : null,
  ].filter((entry): entry is { source: AvatarSourceValue; url: string } => entry !== null);
}

/**
 * What the card shows once a source is chosen.
 *
 * @param state - The card's state.
 * @param source - The source being chosen.
 * @returns The state with that source shown.
 */
export function withChosenSource(state: AvatarState, source: AvatarSourceValue): AvatarState {
  const shown =
    source === AvatarSource.Upload
      ? state.uploaded
      : source === AvatarSource.Gravatar
        ? state.gravatar
        : state.provider;
  return { ...state, source, shown, busy: false };
}
