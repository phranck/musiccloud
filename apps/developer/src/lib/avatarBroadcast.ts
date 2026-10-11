/**
 * @file How the profile page tells the header that the picture changed.
 *
 * The header is rendered once per document and the profile changes a fact it
 * shows, so one has to tell the other. An event rather than a reload, because
 * the page the developer is on is the one they are working in, and rather than
 * a second fetch, because the profile already holds the answer.
 *
 * The same shape fits the rest of what the rail and the header show, such as a
 * project's name, and that is what it is written for.
 */

/** The one event name, so a listener and a sender cannot drift apart. */
const AVATAR_EVENT = "mc-dev:avatar-changed";

/** What the event carries: the picture to show, or `null` for none. */
export interface AvatarAnnouncement {
  avatarUrl: string | null;
}

/**
 * Says which picture the account shows from now on.
 *
 * @param avatarUrl - The picture, or `null` where the account holds none.
 */
export function announceAvatar(avatarUrl: string | null): void {
  if (typeof document === "undefined") return;
  document.dispatchEvent(new CustomEvent<AvatarAnnouncement>(AVATAR_EVENT, { detail: { avatarUrl } }));
}

/**
 * Listens for the picture changing.
 *
 * @param handler - Called with the picture to show.
 * @returns A function that stops listening, for an effect's cleanup.
 */
export function onAvatarAnnounced(handler: (avatarUrl: string | null) => void): () => void {
  if (typeof document === "undefined") return () => undefined;

  const listener = (event: Event) => {
    const detail = (event as CustomEvent<AvatarAnnouncement>).detail;
    handler(detail?.avatarUrl ?? null);
  };

  document.addEventListener(AVATAR_EVENT, listener);
  return () => document.removeEventListener(AVATAR_EVENT, listener);
}
