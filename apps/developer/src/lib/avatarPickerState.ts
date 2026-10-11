/**
 * @file The state of the picture on a developer's profile, before it is saved.
 *
 * A developer may hold three pictures at once and shows one of them, so the
 * three and the choice between them are one state rather than four. Nothing here writes: the card gathers what the developer wants and the
 * save is what puts it on the account, which is why an upload can be picked
 * and then abandoned without changing anything.
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
  /** What the account holds as its upload, as stored. */
  uploaded: string | null;
  /** A picture chosen in this session and not yet saved. */
  picked: string | null;
  /** Whether the stored upload is to be removed on save. */
  removed: boolean;
  /** What Gravatar answered, either as stored or as this session's lookup found. */
  gravatar: string | null;
  /** What an identity provider handed over. */
  provider: string | null;
  /** Which of the three is chosen. */
  source: AvatarSourceValue | null;
  /** Whether a lookup is in flight, which disables the controls. */
  busy: boolean;
  /** What went wrong, in the developer's words. */
  error: string | null;
}

/** What can happen to the picture before it is saved. */
export const AvatarActionType = {
  /** A file was chosen and read; it is shown but not stored. */
  Picked: "Picked",
  /** The picture is to be removed when the card is saved. */
  Removed: "Removed",
  /** A lookup went out. */
  Looking: "Looking",
  /** The lookup answered, with or without a picture. */
  Looked: "Looked",
  /** One of the three was chosen as the one to show. */
  Chose: "Chose",
  /** Something failed, and the message is for the developer. */
  Failed: "Failed",
  /** The save went through, so what was pending is now what is stored. */
  Saved: "Saved",
} as const;

/** One of the actions in {@link AvatarActionType}. */
export type AvatarAction =
  | { type: typeof AvatarActionType.Picked; dataUrl: string }
  | { type: typeof AvatarActionType.Removed }
  | { type: typeof AvatarActionType.Looking }
  | { type: typeof AvatarActionType.Looked; gravatarUrl: string | null }
  | { type: typeof AvatarActionType.Chose; source: AvatarSourceValue }
  | { type: typeof AvatarActionType.Failed; message: string }
  | { type: typeof AvatarActionType.Saved; account: AvatarAccount };

/**
 * The state this card starts in.
 *
 * @param account - The account as the page rendered it.
 * @returns The initial state.
 */
export function initialAvatarState(account: AvatarAccount): AvatarState {
  return {
    uploaded: account.uploadedAvatarUrl,
    picked: null,
    removed: false,
    gravatar: account.gravatarUrl,
    provider: account.providerAvatarUrl,
    source: isAvatarSource(account.avatarSource) ? account.avatarSource : null,
    busy: false,
    error: null,
  };
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
    case AvatarActionType.Picked:
      // Picking a picture is choosing it: nobody uploads one to keep looking
      // like whatever they looked like before.
      return {
        ...state,
        picked: action.dataUrl,
        removed: false,
        source: AvatarSource.Upload,
        error: null,
      };
    case AvatarActionType.Removed:
      return {
        ...state,
        picked: null,
        removed: true,
        source: state.source === AvatarSource.Upload ? null : state.source,
        error: null,
      };
    case AvatarActionType.Looking:
      return { ...state, busy: true, error: null };
    case AvatarActionType.Looked:
      return {
        ...state,
        busy: false,
        gravatar: action.gravatarUrl,
        source: action.gravatarUrl ? AvatarSource.Gravatar : state.source,
      };
    case AvatarActionType.Chose:
      return { ...state, source: action.source, error: null };
    case AvatarActionType.Failed:
      return { ...state, busy: false, error: action.message };
    case AvatarActionType.Saved:
      return initialAvatarState(action.account);
    default:
      return state;
  }
}

/**
 * The picture the card is showing, which is what a save would make current.
 *
 * @param state - The card's state.
 * @returns The picture, or `null` where there is none to show.
 */
export function shownPicture(state: AvatarState): string | null {
  const upload = state.picked ?? (state.removed ? null : state.uploaded);
  const chosen =
    state.source === AvatarSource.Upload
      ? upload
      : state.source === AvatarSource.Gravatar
        ? state.gravatar
        : state.source === AvatarSource.Provider
          ? state.provider
          : null;

  return chosen ?? upload ?? state.gravatar ?? state.provider;
}

/**
 * The pictures the card holds, in the order they are offered.
 *
 * @param state - The card's state.
 * @returns One entry per picture, which is what the chooser lists.
 */
export function heldPictures(state: AvatarState): { source: AvatarSourceValue; url: string }[] {
  const upload = state.picked ?? (state.removed ? null : state.uploaded);
  return [
    upload ? { source: AvatarSource.Upload, url: upload } : null,
    state.gravatar ? { source: AvatarSource.Gravatar, url: state.gravatar } : null,
    state.provider ? { source: AvatarSource.Provider, url: state.provider } : null,
  ].filter((entry): entry is { source: AvatarSourceValue; url: string } => entry !== null);
}

/** What a save has to send for the picture, or `null` where nothing changed. */
export interface AvatarChanges {
  /** A newly picked picture to store, where one was picked. */
  upload?: string;
  /** Whether the stored upload is to be removed. */
  remove?: boolean;
  /** What Gravatar answered, where a lookup found something new. */
  gravatarUrl?: string | null;
  /** Which of the three to show. */
  avatarSource?: AvatarSourceValue | null;
}

/**
 * What the card has to send when it is saved.
 *
 * Only what differs from the account as it was rendered, so a save that
 * touches the names alone carries nothing about the picture.
 *
 * @param state - The card's state.
 * @param account - The account as the page rendered it.
 * @returns The changes, empty where the picture was left alone.
 */
export function avatarChanges(state: AvatarState, account: AvatarAccount): AvatarChanges {
  const changes: AvatarChanges = {};

  if (state.picked) changes.upload = state.picked;
  else if (state.removed && account.uploadedAvatarUrl) changes.remove = true;

  if (state.gravatar !== account.gravatarUrl) changes.gravatarUrl = state.gravatar;

  const source = account.avatarSource;
  if (state.source !== (isAvatarSource(source) ? source : null)) changes.avatarSource = state.source;

  return changes;
}
