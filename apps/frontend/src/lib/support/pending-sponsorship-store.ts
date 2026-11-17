/**
 * @file The payment reference a visitor was given, kept in their browser until
 * they have paid or it lapses.
 *
 * Ported from lmaa.space (`apps/frontend/src/lib/pending-sponsorship-store.ts`).
 * Somebody who fills the form in leaves for their banking app and comes back to
 * a fresh page, so the reference has to survive that. It is theirs alone and
 * never leaves their browser, and the backend offers no route that reads back
 * what stands behind a reference, so what they entered is kept here too.
 *
 * {@link parseIssuedSponsorship} is pure, so the rules are tested without a
 * browser. The rest is the external store `useSyncExternalStore` reads.
 */

import { formatCreditorReference, normalizeSponsorshipReference, PENDING_SPONSORSHIP_DAYS } from "@musiccloud/shared";

/** Where the reference lives in `localStorage`, in the naming of the site's other stored values. */
export const PENDING_SPONSORSHIP_STORAGE_KEY = "musiccloud:pending-sponsorship:v1";

/** Milliseconds in a day, which the lifetime is counted in: 86,400,000. */
const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * What somebody said about themselves, as the form takes it.
 *
 * @property name - Their name, trimmed.
 * @property link - The one profile address they gave, trimmed.
 * @property claim - Their sentence, trimmed.
 * @property published - Whether they want to be named on the site.
 */
export interface AnnouncedSponsorship {
  name: string;
  link: string;
  claim: string;
  published: boolean;
}

/**
 * What the site remembers after somebody has announced a sponsorship.
 *
 * @property reference - The reference as it travels, without spaces, which is what the payment carries.
 * @property referenceFormatted - The same reference in groups of four, which is how it is shown.
 * @property issuedAt - When it was issued, in milliseconds since the epoch.
 * @property announced - What was sent, so correcting it starts from what was said.
 */
export interface IssuedSponsorship {
  reference: string;
  referenceFormatted: string;
  issuedAt: number;
  announced: AnnouncedSponsorship;
}

/**
 * What a correction of an entry stored without its details opens on: nothing
 * typed, and the switch for being named on.
 */
const NOTHING_ANNOUNCED: AnnouncedSponsorship = { name: "", link: "", claim: "", published: true };

/**
 * Reads back what was announced, taking only what is of the right shape.
 *
 * @param value - Whatever the storage held under `announced`.
 * @returns The announcement; a field of the wrong type reads as empty, and
 *   `published` is on unless it was stored as `false`.
 */
function parseAnnounced(value: unknown): AnnouncedSponsorship {
  if (typeof value !== "object" || value === null) return NOTHING_ANNOUNCED;
  const candidate = value as Partial<Record<keyof AnnouncedSponsorship, unknown>>;
  return {
    name: typeof candidate.name === "string" ? candidate.name : "",
    link: typeof candidate.link === "string" ? candidate.link : "",
    claim: typeof candidate.claim === "string" ? candidate.claim : "",
    published: candidate.published !== false,
  };
}

/**
 * Reads back what was stored, or nothing.
 *
 * An entry as old as the backend keeps a request is dropped, because the row it
 * points at is gone by then and a payment carrying it would arrive with nothing
 * to attach to. A reference that is not a sound musiccloud sponsorship
 * reference is dropped as well. The printed form is derived from the reference
 * rather than read back, so the two cannot disagree.
 *
 * @param raw - What the storage held, or `null` when it held nothing.
 * @param now - The current moment, in milliseconds since the epoch.
 * @returns The reference, or `null` when there is none worth showing.
 */
export function parseIssuedSponsorship(raw: string | null, now: number): IssuedSponsorship | null {
  if (!raw) return null;

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  if (typeof parsed !== "object" || parsed === null) return null;
  const candidate = parsed as Partial<Record<keyof IssuedSponsorship, unknown>>;

  const reference = typeof candidate.reference === "string" ? normalizeSponsorshipReference(candidate.reference) : null;
  if (!reference) return null;
  if (typeof candidate.issuedAt !== "number" || !Number.isFinite(candidate.issuedAt)) return null;
  if (now - candidate.issuedAt >= PENDING_SPONSORSHIP_DAYS * DAY_MS) return null;

  return {
    reference,
    referenceFormatted: formatCreditorReference(reference),
    issuedAt: candidate.issuedAt,
    announced: parseAnnounced(candidate.announced),
  };
}

/**
 * The value last read or written, so every reader is given the same object.
 * `useSyncExternalStore` compares snapshots by identity, so parsing afresh on
 * every call would never settle. `null` until the first subscriber reads it.
 */
let snapshot: IssuedSponsorship | null = null;

/** Whoever wants to hear that the reference has changed. Empty until a ladder subscribes. */
const listeners = new Set<() => void>();

/**
 * Reads the stored entry.
 *
 * @returns The entry, or `null` when there is none or the browser refuses storage.
 */
function readStorage(): IssuedSponsorship | null {
  try {
    return parseIssuedSponsorship(window.localStorage.getItem(PENDING_SPONSORSHIP_STORAGE_KEY), Date.now());
  } catch {
    // A browser that refuses storage still shows the form. It only cannot show
    // the reference again after a reload.
    return null;
  }
}

/**
 * Replaces the snapshot and tells every subscriber.
 *
 * @param next - The new entry, or `null` for none.
 */
function announce(next: IssuedSponsorship | null): void {
  snapshot = next;
  for (const listener of listeners) listener();
}

/**
 * Watches the reference, including when another tab of this site changes it.
 *
 * @param onChange - Called whenever the stored reference is not what it was.
 * @returns The function that stops watching.
 */
export function subscribeIssuedSponsorship(onChange: () => void): () => void {
  if (listeners.size === 0) snapshot = readStorage();
  listeners.add(onChange);

  const onStorage = (event: StorageEvent) => {
    if (event.key !== null && event.key !== PENDING_SPONSORSHIP_STORAGE_KEY) return;
    announce(readStorage());
  };
  window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(onChange);
    window.removeEventListener("storage", onStorage);
  };
}

/**
 * The reference as it stands, for a browser.
 *
 * @returns The current entry, or `null` when there is none.
 */
export function getIssuedSponsorship(): IssuedSponsorship | null {
  return snapshot;
}

/**
 * The reference as it stands on the server, which is none, because the page is
 * rendered before any browser is involved and nothing personal is part of it.
 *
 * @returns Always `null`.
 */
export function getServerIssuedSponsorship(): null {
  return null;
}

/**
 * Remembers a reference the site has just issued or confirmed.
 *
 * The entry is on screen at once and stored as well. Only the reference, the
 * moment and what was announced are stored, because the printed form is
 * derived when it is read back.
 *
 * @param issued - The reference, the moment it was given, and what was announced.
 */
export function rememberIssuedSponsorship(issued: IssuedSponsorship): void {
  announce(issued);
  try {
    const { reference, issuedAt, announced } = issued;
    window.localStorage.setItem(PENDING_SPONSORSHIP_STORAGE_KEY, JSON.stringify({ reference, issuedAt, announced }));
  } catch {
    // It is on screen either way, which is what the visitor needs right now.
  }
}
