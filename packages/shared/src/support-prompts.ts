/**
 * @file Support prompts, the short asks that appear inside the site rather than
 * on a page of their own.
 *
 * Ported from lmaa.space (`packages/contracts/src/support-prompts.ts`). A
 * prompt is content: it is written in the ordinary Markdown editor, it names
 * one of a fixed set of slots, and it carries the rules that decide when it may
 * appear. The rules that bound what one reader sees across all prompts together
 * live beside them as limits, because a ceiling that each prompt could raise
 * would bound nothing.
 *
 * This module holds what the backend, the dashboard and the site share: the
 * slots, the counters, the bounds and defaults of every field, the request
 * schemas the backend's routes are built from, the checks a schema cannot
 * express, and the reader for the stored limits.
 */

import { DAY_PATTERN, isCalendarDay } from "./donations.js";
import { isSafeConfiguredUrl } from "./safe-url.js";

/**
 * The places on the site that render a prompt.
 *
 * A slot is a contract a page honours, so a prompt cannot turn up somewhere
 * nobody planned for. Adding one is a line here plus the place in the page.
 *
 * - `share-page`: a share page, the page a resolved link leads to.
 * - `landing-page`: the landing page, where a link is pasted.
 */
export const SUPPORT_PROMPT_SLOTS = ["share-page", "landing-page"] as const;

/** One of the places a prompt may appear, a member of {@link SUPPORT_PROMPT_SLOTS}. */
export type SupportPromptSlot = (typeof SUPPORT_PROMPT_SLOTS)[number];

/**
 * Where a prompt's invitation stands in its card.
 *
 * - `leading`: at the start of the row.
 * - `center`: in the middle of the row.
 * - `trailing`: at the end of the row, the default.
 *
 * Named as the stacks name it, so one vocabulary covers everything on the site
 * that places something along an axis.
 */
export const SUPPORT_PROMPT_BUTTON_ALIGNMENTS = ["leading", "center", "trailing"] as const;

/** Where a prompt's invitation stands, a member of {@link SUPPORT_PROMPT_BUTTON_ALIGNMENTS}. */
export type SupportPromptButtonAlignment = (typeof SUPPORT_PROMPT_BUTTON_ALIGNMENTS)[number];

/**
 * Which of the reader's own counters a threshold is measured against.
 *
 * - `opened`: the share pages somebody has opened, once per share page rather
 *   than once per reload. The default.
 * - `resolved`: the links somebody has resolved on the site.
 *
 * Both live in the reader's browser and neither leaves it.
 */
export const SUPPORT_PROMPT_THRESHOLD_BASES = ["opened", "resolved"] as const;

/** Which counter a threshold reads, a member of {@link SUPPORT_PROMPT_THRESHOLD_BASES}. */
export type SupportPromptThresholdBasis = (typeof SUPPORT_PROMPT_THRESHOLD_BASES)[number];

/**
 * Bounds on every field of a prompt and of the limits.
 *
 * The backend's request schemas and the dashboard's inputs both read these, so
 * a value the form accepts is a value the route accepts.
 */
export const SUPPORT_PROMPT_LIMITS = {
  /** Longest internal name: 120 characters. */
  nameMaxLength: 120,
  /** Longest Markdown content: 20,000 characters. */
  contentMaxLength: 20_000,
  /** Longest button caption: 120 characters. */
  buttonLabelMaxLength: 120,
  /** Longest button destination: 500 characters. */
  buttonHrefMaxLength: 500,
  /** Smallest threshold: 0, which means at once. */
  thresholdMin: 0,
  /** Largest threshold: 500. */
  thresholdMax: 500,
  /** Smallest priority: 0. */
  priorityMin: 0,
  /** Largest priority: 1,000. */
  priorityMax: 1000,
  /** Fewest showings one reader may be allowed in total: 1. */
  maxShownMin: 1,
  /** Most showings one reader may be allowed in total: 20. */
  maxShownMax: 20,
  /** Shortest quiet period, after a showing or a dismissal: 0 days, which means none. */
  snoozeDaysMin: 0,
  /** Longest quiet period, after a showing or a dismissal: 365 days. */
  snoozeDaysMax: 365,
  /** Fewest dismissals until a prompt is settled: 1. */
  dismissalsUntilResolvedMin: 1,
  /** Most dismissals until a prompt is settled: 10. */
  dismissalsUntilResolvedMax: 10,
} as const;

/**
 * Everything an editor decides about one prompt.
 *
 * @property name - Internal, for the list in the dashboard. A visitor never sees it.
 *   1 to {@link SUPPORT_PROMPT_LIMITS.nameMaxLength} characters once trimmed.
 * @property slot - Where it appears.
 * @property content - Markdown, rendered through the same pipeline as a page. `{views}` and
 *   `{links}` are replaced by what the reader has actually done. Either may carry the two
 *   forms of the word that follows it, as `{views share|shares}`, so a text can name a count
 *   without knowing what it will be. At most {@link SUPPORT_PROMPT_LIMITS.contentMaxLength}
 *   characters. Empty by default.
 * @property buttonLabel - The invitation's caption, empty for no button. At most
 *   {@link SUPPORT_PROMPT_LIMITS.buttonLabelMaxLength} characters once trimmed.
 * @property buttonHref - Where the invitation leads: a path on this site or an `https`
 *   address. `/support-me` by default.
 * @property buttonAlignment - Where the invitation stands. `trailing` by default.
 * @property threshold - From how many, counted by `thresholdBasis`, the prompt may appear.
 *   {@link SUPPORT_PROMPT_LIMITS.thresholdMin} means at once. 3 by default.
 * @property thresholdBasis - Which counter the threshold reads. `opened` by default.
 * @property startsAt - The first day it may appear, `YYYY-MM-DD`, or `null` for no start.
 * @property endsAt - The last day it may appear, `YYYY-MM-DD`, or `null` for no end.
 * @property priority - Decides between two prompts that both qualify; higher wins. 0 by default.
 * @property published - Unpublished prompts are not delivered at all. A prompt is rendered in
 *   the reader's browser, so a draft that travelled with the page would be readable in the
 *   network traffic. `false` by default.
 */
export interface SupportPromptInput {
  name: string;
  slot: SupportPromptSlot;
  content: string;
  buttonLabel: string;
  buttonHref: string;
  buttonAlignment: SupportPromptButtonAlignment;
  threshold: number;
  thresholdBasis: SupportPromptThresholdBasis;
  startsAt: string | null;
  endsAt: string | null;
  priority: number;
  published: boolean;
}

/**
 * The fields a new prompt starts with, apart from its name and slot.
 *
 * The request schema fills an absent field from here, and the dashboard's new
 * prompt starts from here, so the two cannot disagree.
 */
export const SUPPORT_PROMPT_DEFAULTS: Omit<SupportPromptInput, "name" | "slot"> = {
  content: "",
  buttonLabel: "",
  buttonHref: "/support-me",
  buttonAlignment: "trailing",
  threshold: 3,
  thresholdBasis: "opened",
  startsAt: null,
  endsAt: null,
  priority: 0,
  published: false,
};

/**
 * A prompt as it is stored and read back.
 *
 * @property id - Stable for the life of the prompt, a nanoid. The reader's own counters are
 *   keyed by it, so renaming a prompt must never reset anybody.
 * @property updatedAt - When the prompt was last changed, ISO 8601.
 */
export interface SupportPrompt extends SupportPromptInput {
  id: string;
  updatedAt: string;
}

/**
 * What bounds one reader across every prompt together.
 *
 * The figure of four comes from Wikimedia's own measurement: over 75 per cent
 * of donors give on the first or second showing, and from the tenth on
 * practically nobody does. No prompt may raise these, which is why they live
 * here and not on a prompt.
 *
 * @property maxShown - How often anything may be shown to one reader, in total.
 *   {@link SUPPORT_PROMPT_LIMITS.maxShownMin} to {@link SUPPORT_PROMPT_LIMITS.maxShownMax}, 4 by default.
 * @property snoozeDays - How long the site stays quiet after a showing, in days. Zero means not
 *   at all. {@link SUPPORT_PROMPT_LIMITS.snoozeDaysMin} to {@link SUPPORT_PROMPT_LIMITS.snoozeDaysMax},
 *   14 by default.
 * @property dismissSnoozeDays - How long the site stays quiet after a reader closes a prompt, in
 *   days. Longer than the pause after a plain showing, because closing one is an answer rather
 *   than the absence of one. Same range as `snoozeDays`, 90 by default.
 * @property dismissalsUntilResolved - How often the same prompt may be closed before it stops
 *   coming back. Saying no once is "not now" and pushes the next showing away. Saying it this
 *   many times is "no", and that prompt is done.
 *   {@link SUPPORT_PROMPT_LIMITS.dismissalsUntilResolvedMin} to
 *   {@link SUPPORT_PROMPT_LIMITS.dismissalsUntilResolvedMax}, 3 by default.
 * @property devAlwaysShow - Whether to set every limit aside whilst working on a prompt. Stored
 *   like the others, but only ever acted on outside production. See
 *   {@link SupportPromptPayload.devAlwaysShow}. `false` by default.
 */
export interface SupportPromptLimits {
  maxShown: number;
  snoozeDays: number;
  dismissSnoozeDays: number;
  dismissalsUntilResolved: number;
  devAlwaysShow: boolean;
}

/** The limits in force when nothing has been configured. */
export const SUPPORT_PROMPT_LIMIT_DEFAULTS: SupportPromptLimits = {
  maxShown: 4,
  snoozeDays: 14,
  dismissSnoozeDays: 90,
  dismissalsUntilResolved: 3,
  devAlwaysShow: false,
};

/**
 * One prompt as the site receives it, ready to be drawn.
 *
 * The content arrives as HTML the backend rendered and sanitized, because
 * musiccloud renders Markdown in the backend. Nothing the site does not use
 * travels with it.
 *
 * @property name - The internal name, carried for the analytics events alone. A visitor never
 *   sees it. Without it a report names prompts by their identifier, which says nothing about
 *   which text or which place worked.
 * @property html - The content, rendered and sanitized, with its count placeholders still
 *   standing, because only the reader's browser knows the numbers.
 */
export interface PublicSupportPrompt {
  id: string;
  name: string;
  slot: SupportPromptSlot;
  html: string;
  buttonLabel: string;
  buttonHref: string;
  buttonAlignment: SupportPromptButtonAlignment;
  threshold: number;
  thresholdBasis: SupportPromptThresholdBasis;
  priority: number;
}

/**
 * What the site needs to decide what to show.
 *
 * @property prompts - Every published prompt whose window covers today, in the order the
 *   site should prefer them.
 * @property limits - What bounds one reader across every prompt together.
 * @property devAlwaysShow - Whether every limit is set aside, so a prompt shows on every page
 *   view. For working on a prompt: with the ordinary rules in force, seeing one twice means
 *   clearing the browser store and opening three share pages in between, which makes trying a
 *   change out slower than making it. The backend answers `false` in production whatever is
 *   stored, so this can never reach a reader. The decision is made there rather than in the
 *   browser because that is where the environment is known for certain.
 */
export interface SupportPromptPayload {
  prompts: PublicSupportPrompt[];
  limits: SupportPromptLimits;
  devAlwaysShow: boolean;
}

/**
 * The request schema of a prompt, for the backend's create and update routes.
 *
 * Built from {@link SUPPORT_PROMPT_LIMITS} and {@link SUPPORT_PROMPT_DEFAULTS}.
 * `name` and `slot` are required; every other field takes its default when it
 * is absent. Nothing else is accepted. What a schema cannot say, the trimmed
 * name, a safe destination and a window in order, is checked by
 * {@link normalizeSupportPromptInput}.
 */
export const SUPPORT_PROMPT_INPUT_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["name", "slot"],
  properties: {
    name: { type: "string", maxLength: SUPPORT_PROMPT_LIMITS.nameMaxLength },
    slot: { type: "string", enum: SUPPORT_PROMPT_SLOTS },
    content: {
      type: "string",
      maxLength: SUPPORT_PROMPT_LIMITS.contentMaxLength,
      default: SUPPORT_PROMPT_DEFAULTS.content,
    },
    buttonLabel: {
      type: "string",
      maxLength: SUPPORT_PROMPT_LIMITS.buttonLabelMaxLength,
      default: SUPPORT_PROMPT_DEFAULTS.buttonLabel,
    },
    buttonHref: {
      type: "string",
      maxLength: SUPPORT_PROMPT_LIMITS.buttonHrefMaxLength,
      default: SUPPORT_PROMPT_DEFAULTS.buttonHref,
    },
    buttonAlignment: {
      type: "string",
      enum: SUPPORT_PROMPT_BUTTON_ALIGNMENTS,
      default: SUPPORT_PROMPT_DEFAULTS.buttonAlignment,
    },
    threshold: {
      type: "integer",
      minimum: SUPPORT_PROMPT_LIMITS.thresholdMin,
      maximum: SUPPORT_PROMPT_LIMITS.thresholdMax,
      default: SUPPORT_PROMPT_DEFAULTS.threshold,
    },
    thresholdBasis: {
      type: "string",
      enum: SUPPORT_PROMPT_THRESHOLD_BASES,
      default: SUPPORT_PROMPT_DEFAULTS.thresholdBasis,
    },
    startsAt: {
      anyOf: [{ type: "string", pattern: DAY_PATTERN }, { type: "null" }],
      default: SUPPORT_PROMPT_DEFAULTS.startsAt,
    },
    endsAt: {
      anyOf: [{ type: "string", pattern: DAY_PATTERN }, { type: "null" }],
      default: SUPPORT_PROMPT_DEFAULTS.endsAt,
    },
    priority: {
      type: "integer",
      minimum: SUPPORT_PROMPT_LIMITS.priorityMin,
      maximum: SUPPORT_PROMPT_LIMITS.priorityMax,
      default: SUPPORT_PROMPT_DEFAULTS.priority,
    },
    published: { type: "boolean", default: SUPPORT_PROMPT_DEFAULTS.published },
  },
} as const;

/**
 * The request schema of the limits, for the backend's write route.
 *
 * Every field takes its default from {@link SUPPORT_PROMPT_LIMIT_DEFAULTS} when
 * it is absent, so an empty body stores the defaults. Nothing else is accepted.
 */
export const SUPPORT_PROMPT_LIMITS_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    maxShown: {
      type: "integer",
      minimum: SUPPORT_PROMPT_LIMITS.maxShownMin,
      maximum: SUPPORT_PROMPT_LIMITS.maxShownMax,
      default: SUPPORT_PROMPT_LIMIT_DEFAULTS.maxShown,
    },
    snoozeDays: {
      type: "integer",
      minimum: SUPPORT_PROMPT_LIMITS.snoozeDaysMin,
      maximum: SUPPORT_PROMPT_LIMITS.snoozeDaysMax,
      default: SUPPORT_PROMPT_LIMIT_DEFAULTS.snoozeDays,
    },
    dismissSnoozeDays: {
      type: "integer",
      minimum: SUPPORT_PROMPT_LIMITS.snoozeDaysMin,
      maximum: SUPPORT_PROMPT_LIMITS.snoozeDaysMax,
      default: SUPPORT_PROMPT_LIMIT_DEFAULTS.dismissSnoozeDays,
    },
    dismissalsUntilResolved: {
      type: "integer",
      minimum: SUPPORT_PROMPT_LIMITS.dismissalsUntilResolvedMin,
      maximum: SUPPORT_PROMPT_LIMITS.dismissalsUntilResolvedMax,
      default: SUPPORT_PROMPT_LIMIT_DEFAULTS.dismissalsUntilResolved,
    },
    devAlwaysShow: { type: "boolean", default: SUPPORT_PROMPT_LIMIT_DEFAULTS.devAlwaysShow },
  },
} as const;

/**
 * Why a prompt that passed {@link SUPPORT_PROMPT_INPUT_SCHEMA} was refused.
 *
 * - `BlankName`: the name is empty once trimmed.
 * - `ButtonWithoutDestination`: the button has a caption but nowhere to lead.
 * - `UnsafeDestination`: the button's destination is neither a path on this site nor an
 *   `https` address. An empty destination without a caption is refused this way, as lmaa's
 *   contract refuses it.
 * - `ImpossibleDay`: the first or the last day is written as a day but does not exist, such
 *   as `2026-02-30`.
 * - `WindowReversed`: the window ends before it starts.
 */
export const SupportPromptRefusal = {
  BlankName: "blank-name",
  ButtonWithoutDestination: "button-without-destination",
  UnsafeDestination: "unsafe-destination",
  ImpossibleDay: "impossible-day",
  WindowReversed: "window-reversed",
} as const;

/** A {@link SupportPromptRefusal} member value. */
export type SupportPromptRefusalValue = (typeof SupportPromptRefusal)[keyof typeof SupportPromptRefusal];

/** What {@link normalizeSupportPromptInput} decides: the prompt to store, or why it is refused. */
export type SupportPromptCheck =
  | { ok: true; input: SupportPromptInput }
  | { ok: false; refusal: SupportPromptRefusalValue };

/**
 * Brings a prompt that passed {@link SUPPORT_PROMPT_INPUT_SCHEMA} into the form
 * it is stored in, or refuses it.
 *
 * The name, the caption, the destination and the two days are trimmed, as
 * lmaa's contract trims them. It refuses exactly what lmaa's contract refuses,
 * plus a day that does not exist, which lmaa lets through. lmaa reports every
 * problem at once and this reports one, so where lmaa reports two the more
 * specific one is named: a caption with an empty destination is a button
 * without a destination rather than an unsafe one. The checks therefore run as
 * the name, the button against its destination, the destination, the days,
 * and the window.
 *
 * @param input - A prompt that already passed the request schema, defaults filled in.
 * @returns The prompt to store, or the first reason it is refused.
 */
export function normalizeSupportPromptInput(input: SupportPromptInput): SupportPromptCheck {
  const name = input.name.trim();
  const buttonLabel = input.buttonLabel.trim();
  const buttonHref = input.buttonHref.trim();
  const startsAt = input.startsAt?.trim() ?? null;
  const endsAt = input.endsAt?.trim() ?? null;

  if (name === "") return { ok: false, refusal: SupportPromptRefusal.BlankName };
  if (buttonLabel !== "" && buttonHref === "") {
    return { ok: false, refusal: SupportPromptRefusal.ButtonWithoutDestination };
  }
  if (!isSafeConfiguredUrl(buttonHref, { allowRelative: true })) {
    return { ok: false, refusal: SupportPromptRefusal.UnsafeDestination };
  }
  if ((startsAt && !isCalendarDay(startsAt)) || (endsAt && !isCalendarDay(endsAt))) {
    return { ok: false, refusal: SupportPromptRefusal.ImpossibleDay };
  }
  if (startsAt && endsAt && endsAt < startsAt) return { ok: false, refusal: SupportPromptRefusal.WindowReversed };

  return { ok: true, input: { ...input, name, buttonLabel, buttonHref, startsAt, endsAt } };
}

/** The names of the limits, derived from the defaults so a new limit is read the moment it is declared. */
const LIMIT_FIELDS = Object.keys(SUPPORT_PROMPT_LIMIT_DEFAULTS) as (keyof SupportPromptLimits)[];

/** One integer limit's schema entry, as {@link SUPPORT_PROMPT_LIMITS_SCHEMA} declares it. */
interface IntegerLimitSchema {
  type: "integer";
  minimum: number;
  maximum: number;
}

/**
 * Reads one stored limit, or answers that it cannot be read.
 *
 * A number stored as text is read as the number, as lmaa's contract coerces it.
 * The bounds come from {@link SUPPORT_PROMPT_LIMITS_SCHEMA}, so the reader and
 * the write route cannot disagree.
 *
 * @param field - The limit.
 * @param value - What was stored for it, present.
 * @returns The value, or `undefined` when it does not fit.
 */
function readLimit<K extends keyof SupportPromptLimits>(field: K, value: unknown): SupportPromptLimits[K] | undefined {
  const schema = SUPPORT_PROMPT_LIMITS_SCHEMA.properties[field];
  if (schema.type === "boolean") {
    return typeof value === "boolean" ? (value as SupportPromptLimits[K]) : undefined;
  }
  const bounds = schema as IntegerLimitSchema;
  const number = Number(value);
  if (!Number.isInteger(number) || number < bounds.minimum || number > bounds.maximum) return undefined;
  return number as SupportPromptLimits[K];
}

/**
 * What {@link parseSupportPromptLimits} read.
 *
 * @property limits - Every limit, each falling back to its own default.
 * @property dropped - One `field=value` entry per stored value that could not be read, in
 *   declaration order. A field that is simply absent is not dropped; it never had a value to lose.
 * @property unreadable - `true` when the stored text is not JSON at all, in which case every
 *   limit is its default.
 */
export interface SupportPromptLimitsReading {
  limits: SupportPromptLimits;
  dropped: string[];
  unreadable: boolean;
}

/**
 * Reads the stored limits back.
 *
 * A value that can no longer be read is replaced by its own default and the
 * others are kept. Falling back to every default instead would discard settings
 * nobody complained about, which is what somebody sees as their choice silently
 * reverting.
 *
 * @param raw - The stored JSON, or `null` when nothing has been saved.
 * @returns The limits, what was dropped, and whether the text was readable at all.
 */
export function parseSupportPromptLimits(raw: string | null): SupportPromptLimitsReading {
  if (!raw) return { limits: SUPPORT_PROMPT_LIMIT_DEFAULTS, dropped: [], unreadable: false };

  let stored: unknown;
  try {
    stored = JSON.parse(raw);
  } catch {
    return { limits: SUPPORT_PROMPT_LIMIT_DEFAULTS, dropped: [], unreadable: true };
  }

  const fields = stored && typeof stored === "object" ? (stored as Record<string, unknown>) : {};
  const dropped: string[] = [];
  const limits = Object.fromEntries(
    LIMIT_FIELDS.map((field) => {
      const value = fields[field];
      if (value === undefined) return [field, SUPPORT_PROMPT_LIMIT_DEFAULTS[field]];
      const read = readLimit(field, value);
      if (read !== undefined) return [field, read];
      dropped.push(`${field}=${JSON.stringify(value)}`);
      return [field, SUPPORT_PROMPT_LIMIT_DEFAULTS[field]];
    }),
  ) as unknown as SupportPromptLimits;

  return { limits, dropped, unreadable: false };
}
