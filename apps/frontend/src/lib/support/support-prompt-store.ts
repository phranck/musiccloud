/**
 * @file What the site remembers about the asks it has shown one reader.
 *
 * Ported from lmaa.space (`apps/frontend/src/lib/support-prompt-store.ts`). The
 * rules live here rather than in the dashboard, because they are behavior
 * derived from measured data: over 75 percent of people who give do so on the
 * first or second showing, and from the tenth on practically nobody does. A
 * ceiling set by hand would be invisible until the giving stopped.
 *
 * Everything in this module is pure. It reads a store, takes a decision, and
 * returns the next store, so the rules can be tested without a browser.
 *
 * One point deliberately differs from lmaa.space until lmaa's own fix lands.
 * lmaa measures every running quiet period against `snoozeDays`, which cuts the
 * quiet period after a dismissal back to the shorter period after a showing.
 * Here the store records which of the two is running, and a dismissal keeps
 * the prompt away for `dismissSnoozeDays`.
 */

import type { SupportPromptLimits, SupportPromptThresholdBasis } from "@musiccloud/shared";

/** Where the store lives, in the naming of the other stores on this site. */
export const SUPPORT_PROMPT_STORAGE_KEY = "musiccloud:support-prompt:v1";

/** One day in milliseconds, the unit every quiet period is set in. */
const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * What started the quiet period that is running, which decides the setting it
 * is measured against.
 *
 * - `Shown`: a prompt was shown, so the period is measured against `snoozeDays`.
 *   This is the default, and what a store that recorded no cause is read as.
 * - `Dismissed`: the reader closed a prompt, so the period is measured against
 *   `dismissSnoozeDays`.
 */
export const QuietPeriodCause = {
  Shown: "shown",
  Dismissed: "dismissed",
} as const;

/** One of the {@link QuietPeriodCause} values. */
export type QuietPeriodCause = (typeof QuietPeriodCause)[keyof typeof QuietPeriodCause];

/** What the site remembers about one prompt. */
export interface SupportPromptRecord {
  /** How often this prompt has been shown. */
  shown: number;
  /** How often the reader has closed it. */
  dismissed: number;
  /** Set once this prompt is done with, for whatever reason. */
  resolved: boolean;
}

/** What the site remembers about one reader. */
export interface SupportPromptStore {
  /** How often anything has been shown, across every prompt together. */
  shown: number;
  /** Nothing is shown before this moment, as milliseconds since the epoch. */
  snoozedUntil: number;
  /**
   * When that quiet period began, as milliseconds since the epoch.
   *
   * Kept so the period can be measured against the setting in force when it is
   * read rather than the one in force when it was written. Somebody who
   * shortens the setting expects that to hold for a quiet period already
   * running, not only for the next one. Zero where nothing is running, and for
   * a store written before this was recorded.
   */
  snoozedSince: number;
  /**
   * What started that quiet period, which decides whether it is measured
   * against `snoozeDays` or `dismissSnoozeDays`. {@link QuietPeriodCause.Shown}
   * by default, and for a store that recorded none.
   */
  snoozeCause: QuietPeriodCause;
  /** The last share page counted, by its short id, so a reload does not count twice. */
  lastShareId: string | null;
  /** How many share pages the reader has opened, a reload of the same one not counted. */
  shareViews: number;
  /** One record per prompt, keyed by its identifier. */
  prompts: Record<string, SupportPromptRecord>;
}

/**
 * The store of somebody the site has never asked.
 *
 * @returns A store with every count at zero and no quiet period.
 */
export function emptyStore(): SupportPromptStore {
  return {
    shown: 0,
    snoozedUntil: 0,
    snoozedSince: 0,
    snoozeCause: QuietPeriodCause.Shown,
    lastShareId: null,
    shareViews: 0,
    prompts: {},
  };
}

/**
 * The record of a prompt the site has not shown yet.
 *
 * @returns A record with every count at zero.
 */
function emptyRecord(): SupportPromptRecord {
  return { shown: 0, dismissed: 0, resolved: false };
}

/**
 * Reads a store back from what was stored, dropping anything unusable.
 *
 * Every readable record is kept, including those of prompts the site does not
 * deliver today. The site only ever learns which prompts are live, and a
 * prompt that is unpublished for a while, whose window lapses before it is
 * extended, or that a failed load leaves out is not a deleted one. Forgetting
 * its record would show a reader again what they had closed or followed.
 * Prompts are written by hand and few, so the records stay small. This differs
 * from lmaa.space, which drops the records of prompts it was not sent.
 *
 * @param raw - What the storage held, or `null` when it held nothing.
 * @returns A store that is safe to use, whatever was in the storage.
 */
export function parseStore(raw: string | null): SupportPromptStore {
  const store = emptyStore();
  if (!raw) return store;

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return store;
  }

  if (typeof parsed !== "object" || parsed === null) return store;
  const candidate = parsed as Partial<SupportPromptStore>;

  store.shown = Number.isFinite(candidate.shown) ? Number(candidate.shown) : 0;
  store.snoozedUntil = Number.isFinite(candidate.snoozedUntil) ? Number(candidate.snoozedUntil) : 0;
  store.snoozedSince = Number.isFinite(candidate.snoozedSince) ? Number(candidate.snoozedSince) : 0;
  store.snoozeCause =
    candidate.snoozeCause === QuietPeriodCause.Dismissed ? QuietPeriodCause.Dismissed : QuietPeriodCause.Shown;
  store.shareViews = Number.isFinite(candidate.shareViews) ? Number(candidate.shareViews) : 0;
  store.lastShareId = typeof candidate.lastShareId === "string" ? candidate.lastShareId : null;

  const records = candidate.prompts;
  if (records && typeof records === "object") {
    for (const [id, record] of Object.entries(records)) {
      if (typeof record !== "object" || record === null) continue;
      const entry = record as Partial<SupportPromptRecord>;
      store.prompts[id] = {
        shown: Number.isFinite(entry.shown) ? Number(entry.shown) : 0,
        dismissed: Number.isFinite(entry.dismissed) ? Number(entry.dismissed) : 0,
        resolved: entry.resolved === true,
      };
    }
  }

  return store;
}

/**
 * What a prompt needs to carry for the store to judge it.
 *
 * @property id - The prompt's identifier, which its record is keyed by.
 * @property threshold - From how many, counted by `thresholdBasis`, it may appear.
 * @property thresholdBasis - Which counter the threshold is measured against.
 * @property priority - Decides between two that both qualify; higher wins.
 */
export interface PromptCandidate {
  id: string;
  threshold: number;
  thresholdBasis: SupportPromptThresholdBasis;
  priority: number;
}

/** How far the reader has come, by each counter a threshold may read. */
export type ReaderProgress = Record<SupportPromptThresholdBasis, number>;

/**
 * When the current quiet period ends, measured against the setting in force.
 *
 * A period that was started under a longer setting is cut back to what the
 * setting allows now, counted from when it began. The setting is the one that
 * matches what started the period: `dismissSnoozeDays` after a dismissal and
 * `snoozeDays` after a showing. Where a store predates the recording of that
 * moment, the stored end stands, because there is nothing to measure against.
 *
 * @param store - What is remembered about this reader.
 * @param limits - The settings in force right now.
 * @returns The moment before which nothing is shown.
 */
function quietUntil(store: SupportPromptStore, limits: SupportPromptLimits): number {
  if (!store.snoozedSince) return store.snoozedUntil;
  const days = store.snoozeCause === QuietPeriodCause.Dismissed ? limits.dismissSnoozeDays : limits.snoozeDays;
  return Math.min(store.snoozedUntil, store.snoozedSince + days * DAY_MS);
}

/**
 * Picks the one prompt to show, or nothing.
 *
 * Checked in this order: the reader's own ceiling, the quiet period, then each
 * prompt's own state and its threshold. Among what is left the highest priority
 * wins, and the order the server sent decides a tie, because it already sorted
 * by age.
 *
 * @param candidates - The prompts for this slot, as the server sent them.
 * @param store - What the site remembers about this reader.
 * @param limits - What bounds the reader across every prompt together.
 * @param progress - How far the reader has come, by each counter.
 * @param now - The current moment, as milliseconds since the epoch.
 * @param alwaysShow - Whether every limit but the threshold is set aside, which the backend
 *   only ever allows in development and in tests. `false` by default.
 * @returns The prompt to show, or `null` when the reader has had enough.
 */
export function choosePrompt(
  candidates: readonly PromptCandidate[],
  store: SupportPromptStore,
  limits: SupportPromptLimits,
  progress: ReaderProgress,
  now: number,
  alwaysShow = false,
): PromptCandidate | null {
  // Whilst the limits are set aside, only the threshold still applies: that one
  // says which prompt belongs on this page, whereas the rest say how often one
  // reader may be asked. Whether they may be set aside at all is the backend's
  // answer, which is never yes outside development and tests.
  if (!alwaysShow) {
    if (store.shown >= limits.maxShown) return null;
    if (now < quietUntil(store, limits)) return null;
  }

  let best: PromptCandidate | null = null;
  for (const candidate of candidates) {
    // A basis that is missing or unknown falls back to the default counter
    // rather than to no counter. Reading an absent one would compare against
    // `undefined`, which is never less than the threshold, and the prompt would
    // slip past the very check it is measured by.
    const reached = progress[candidate.thresholdBasis] ?? progress.opened;
    if (reached < candidate.threshold) continue;
    if (!alwaysShow && store.prompts[candidate.id]?.resolved) continue;
    if (!best || candidate.priority > best.priority) best = candidate;
  }

  return best;
}

/**
 * Records that a prompt was shown, and puts the site to sleep for a while.
 *
 * @param store - The store before the showing.
 * @param id - The prompt that was shown.
 * @param limits - Where the quiet period comes from.
 * @param now - The current moment, as milliseconds since the epoch.
 * @returns The store afterwards.
 */
export function recordShown(
  store: SupportPromptStore,
  id: string,
  limits: SupportPromptLimits,
  now: number,
): SupportPromptStore {
  const record = store.prompts[id] ?? emptyRecord();
  return {
    ...store,
    shown: store.shown + 1,
    snoozedUntil: now + limits.snoozeDays * DAY_MS,
    snoozedSince: now,
    snoozeCause: QuietPeriodCause.Shown,
    prompts: { ...store.prompts, [id]: { ...record, shown: record.shown + 1 } },
  };
}

/**
 * Records that the reader followed the prompt.
 *
 * This prompt has done its work and never comes back.
 *
 * @param store - The store before.
 * @param id - The prompt that was followed.
 * @returns The store afterwards.
 */
export function recordResolved(store: SupportPromptStore, id: string): SupportPromptStore {
  const record = store.prompts[id] ?? emptyRecord();
  return { ...store, prompts: { ...store.prompts, [id]: { ...record, resolved: true } } };
}

/**
 * Records that the reader closed the prompt.
 *
 * Closing once says "not now" and pushes the next showing away by the quiet
 * period after a dismissal. Closing the same prompt as often as the limits
 * allow says "no", and it stops coming back.
 *
 * @param store - The store before.
 * @param id - The prompt that was closed.
 * @param limits - Where the quiet period and the number of dismissals come from.
 * @param now - The current moment, as milliseconds since the epoch.
 * @returns The store afterwards.
 */
export function recordDismissed(
  store: SupportPromptStore,
  id: string,
  limits: SupportPromptLimits,
  now: number,
): SupportPromptStore {
  const record = store.prompts[id] ?? emptyRecord();
  const dismissed = record.dismissed + 1;
  return {
    ...store,
    snoozedUntil: Math.max(store.snoozedUntil, now + limits.dismissSnoozeDays * DAY_MS),
    snoozedSince: now,
    snoozeCause: QuietPeriodCause.Dismissed,
    prompts: {
      ...store.prompts,
      [id]: { ...record, dismissed, resolved: dismissed >= limits.dismissalsUntilResolved },
    },
  };
}

/**
 * Counts a share page, but only when it is a different one.
 *
 * Reloading a page is not a second visit, and the difference decides whether
 * the third share page is really the third.
 *
 * @param store - The store before.
 * @param shareId - The short id of the share page being looked at.
 * @returns The store afterwards, unchanged when the short id is the last one.
 */
export function countShareView(store: SupportPromptStore, shareId: string): SupportPromptStore {
  if (store.lastShareId === shareId) return store;
  return { ...store, lastShareId: shareId, shareViews: store.shareViews + 1 };
}
