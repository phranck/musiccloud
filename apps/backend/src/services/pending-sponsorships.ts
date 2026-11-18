/**
 * @file Sponsorship requests: what somebody says about themselves before they
 * pay, the reference their transfer carries, and the takeover into a sponsor.
 *
 * Ported from lmaa.space (`apps/backend/src/services/pending-sponsorships.ts`).
 * One thing differs on purpose: the takeover writes the sponsor, the payment and
 * the removal of the request in one transaction, so a failure leaves nothing
 * half written. Every removal of a request keeps its reference in
 * `retired_sponsorship_references`, so the bank import can tell a reference
 * musiccloud issued from one somebody built.
 */

import { randomBytes } from "node:crypto";
import {
  DAY_MS,
  DonationProvider,
  formatCreditorReference,
  formatEuroCents,
  issueSponsorshipReference,
  normalizePendingSponsorshipInput,
  normalizeSocialMediaValue,
  normalizeSponsorshipReference,
  PENDING_SPONSORSHIP_DAYS,
  type PendingSponsorship,
  type PendingSponsorshipInput,
  type PendingSponsorshipTakeover,
  pendingSponsorshipCutoff,
  type SocialMediaLink,
  type SocialMediaLinks,
  type Sponsor,
  WEBSITE_PLATFORM,
} from "@musiccloud/shared";
import type { FastifyBaseLogger } from "fastify";
import { nanoid } from "nanoid";
import { type DatabaseQueryable, getDatabasePool, withDatabaseTransaction } from "../db/pool.js";
import { log } from "../lib/infra/logger.js";
import { detectPlatformFromHost } from "../lib/preview-image.js";
import { insertDonation } from "./donations.js";
import { resolveSponsorAvatar } from "./sponsor-avatar.js";
import { copySponsorAvatar } from "./sponsor-avatar-copy.js";
import { pruneUnusedSponsorAvatars } from "./sponsor-avatars.js";
import { getSponsoringConfig } from "./sponsoring-config.js";
import { insertSponsor } from "./sponsors.js";

/** The component every log line of this module names. */
const LOG_COMPONENT = "PendingSponsorships";

/**
 * How many times a taken reference is redrawn before the request is refused: 3.
 *
 * At 60 bits a collision is a fault rather than an event, so this is no
 * probability calculation. It is what stops a broken draw, such as one that
 * returns a constant, from spinning against the database.
 */
const REFERENCE_ATTEMPTS = 3;

/** The unique index that holds one request per reference, which a collision runs into. */
const REFERENCE_UNIQUE_INDEX = "uq_pending_sponsorships_reference";

/** PostgreSQL's SQLSTATE for a unique violation. */
const PG_UNIQUE_VIOLATION = "23505";

/**
 * How often the expired requests are looked for: once a day, and once at
 * start-up, so a service restarted more often than daily still clears them.
 */
const EXPIRY_INTERVAL_MS = DAY_MS;

/** The columns every read selects, with the moment as an ISO string. */
const REQUEST_COLUMNS = "id, reference, name, links, claim, amount_cents, published, created_at";

/** Why a form is refused before anything is stored. */
export const SponsorshipRefusal = {
  /** The announced amount is below the sponsoring settings' minimum. */
  AmountTooLow: "amount_too_low",
  /** A text is blank once trimmed, or the address sorts into no platform. */
  Unusable: "unusable",
  /** Every drawn reference was taken, which means the draw is broken. */
  ReferenceUnavailable: "reference_unavailable",
  /** No request carries that reference or id. */
  NotFound: "not_found",
} as const;

/** A {@link SponsorshipRefusal} member value. */
export type SponsorshipRefusalValue = (typeof SponsorshipRefusal)[keyof typeof SponsorshipRefusal];

/** The outcome of a write: the value, or the reason it was refused. */
export type SponsorshipOutcome<Value> = { ok: true; value: Value } | { ok: false; reason: SponsorshipRefusalValue };

/** One `pending_sponsorships` row as `pg` returns it. */
interface RequestRow {
  id: string;
  reference: string;
  name: string;
  links: SocialMediaLinks;
  claim: string;
  amount_cents: number;
  published: boolean;
  created_at: Date;
}

/** The fields a validated form is stored as, as `normalizePendingSponsorshipInput` returns them. */
type StoredFields = NonNullable<ReturnType<typeof normalizePendingSponsorshipInput>>;

/**
 * Turns a row into what the dashboard lists.
 *
 * @param row - The row as read.
 * @returns The request.
 */
function toPendingSponsorship(row: RequestRow): PendingSponsorship {
  return {
    id: row.id,
    reference: row.reference,
    name: row.name,
    socialMedia: row.links,
    claim: row.claim,
    amountCents: row.amount_cents,
    published: row.published,
    createdAt: new Date(row.created_at).toISOString(),
  };
}

/**
 * Brings a validated form into the columns of a row, or says why it cannot.
 *
 * Shared by announcing and correcting, so both are measured against the same
 * minimum and sort an address the same way. The minimum is the one the
 * operator stored in the sponsoring settings; the form checks it too, but the
 * browser belongs to the caller, so this comparison decides.
 *
 * @param input - A body that passed `PENDING_SPONSORSHIP_INPUT_SCHEMA`.
 * @returns The fields, or `amount_too_low` or `unusable`, with the minimum for the message.
 */
async function toStoredFields(
  input: PendingSponsorshipInput,
): Promise<{ ok: true; fields: StoredFields } | { ok: false; reason: SponsorshipRefusalValue; minimumCents: number }> {
  const { sponsorMinimumCents } = await getSponsoringConfig();
  if (input.amountCents < sponsorMinimumCents) {
    return { ok: false, reason: SponsorshipRefusal.AmountTooLow, minimumCents: sponsorMinimumCents };
  }
  const fields = normalizePendingSponsorshipInput(input);
  if (!fields) return { ok: false, reason: SponsorshipRefusal.Unusable, minimumCents: sponsorMinimumCents };
  const socialMedia = await Promise.all(fields.socialMedia.map(refineWebsite));
  return { ok: true, fields: { ...fields, socialMedia } };
}

/**
 * Asks the page what it is, where its address could not say.
 *
 * A service anybody can host sits on a domain of its own and its profiles are a
 * single path segment, which is what a personal website looks like too. So an
 * address on one of them sorts into `website`, and only the host can put that
 * right, by saying through NodeInfo which software it runs.
 *
 * A host that answers nothing, or that runs something not known here, is left
 * as the website it was taken for.
 *
 * @param classified - What the address sorted into by its shape alone.
 * @returns The same, or the service the page turned out to belong to.
 */
async function refineWebsite(classified: SocialMediaLink): Promise<SocialMediaLink> {
  if (classified.platform !== WEBSITE_PLATFORM) return classified;

  const named = await detectPlatformFromHost(classified.url);
  if (!named) return classified;

  const url = normalizeSocialMediaValue(named, classified.url);
  return url ? { platform: named, url } : classified;
}

/**
 * Says whether an error is the unique violation of the reference index.
 *
 * @param error - What the driver threw.
 * @returns `true` only for a collision of two references.
 */
function isReferenceCollision(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    error.code === PG_UNIQUE_VIOLATION &&
    "constraint" in error &&
    error.constraint === REFERENCE_UNIQUE_INDEX
  );
}

/**
 * Renders the minimum a refusal names, such as `€40`.
 *
 * @param minimumCents - The sponsoring settings' minimum, in cents.
 * @returns The amount as the site prints it.
 */
export function formatSponsorshipMinimum(minimumCents: number): string {
  return formatEuroCents(minimumCents);
}

/**
 * Stores a request and answers with its reference.
 *
 * The reference is drawn by {@link issueSponsorshipReference} from
 * `randomBytes`; a collision is redrawn up to {@link REFERENCE_ATTEMPTS} times
 * and the row is read back through `RETURNING`, so the caller is told what was
 * stored rather than what was meant.
 *
 * @param input - A body that passed the request schema.
 * @returns The stored request, or why it was refused; `minimumCents` comes with `amount_too_low`.
 */
export async function createPendingSponsorship(
  input: PendingSponsorshipInput,
): Promise<SponsorshipOutcome<PendingSponsorship> & { minimumCents?: number }> {
  const prepared = await toStoredFields(input);
  if (!prepared.ok) return prepared;
  const { fields } = prepared;

  for (let attempt = 1; attempt <= REFERENCE_ATTEMPTS; attempt++) {
    try {
      const result = await getDatabasePool().query<RequestRow>(
        `INSERT INTO pending_sponsorships (id, reference, name, links, claim, amount_cents, published)
         VALUES ($1, $2, $3, $4::jsonb, $5, $6, $7)
         RETURNING ${REQUEST_COLUMNS}`,
        [
          nanoid(),
          issueSponsorshipReference((size) => new Uint8Array(randomBytes(size))),
          fields.name,
          JSON.stringify(fields.socialMedia),
          fields.claim,
          fields.amountCents,
          fields.published,
        ],
      );
      return { ok: true, value: toPendingSponsorship(result.rows[0] as RequestRow) };
    } catch (error) {
      if (!isReferenceCollision(error)) throw error;
      // Neither the reference nor anything the caller typed goes into the line.
      log.deviation({
        component: LOG_COMPONENT,
        errorCode: "MC-SYS-0004",
        operation: "pending_sponsorship_create",
        outcome: "reference_taken",
        attempt,
      });
    }
  }
  return { ok: false, reason: SponsorshipRefusal.ReferenceUnavailable };
}

/**
 * Rewrites the request a reference was issued for, keeping the reference.
 *
 * Whoever holds the reference may change what stands behind it: it is not
 * guessable and addresses nothing but its own row. The reference itself never
 * changes, because by now it may stand in a banking app.
 *
 * A correction restarts the request's `PENDING_SPONSORSHIP_DAYS`: `created_at`
 * is set to the moment of the correction, the same moment the browser starts
 * counting from when it stores the corrected receipt, so the daily sweep never
 * deletes a request whose reference a page still shows.
 *
 * @param reference - The reference as it arrived, spaces and any case allowed.
 * @param input - A body that passed the request schema.
 * @returns The request afterwards, or why it was refused.
 */
export async function updatePendingSponsorship(
  reference: string,
  input: PendingSponsorshipInput,
): Promise<SponsorshipOutcome<PendingSponsorship> & { minimumCents?: number }> {
  const stored = normalizeSponsorshipReference(reference);
  if (!stored) return { ok: false, reason: SponsorshipRefusal.NotFound };

  const prepared = await toStoredFields(input);
  if (!prepared.ok) return prepared;
  const { fields } = prepared;

  const result = await getDatabasePool().query<RequestRow>(
    `UPDATE pending_sponsorships
        SET name = $2, links = $3::jsonb, claim = $4, amount_cents = $5, published = $6, created_at = now()
      WHERE reference = $1
      RETURNING ${REQUEST_COLUMNS}`,
    [stored, fields.name, JSON.stringify(fields.socialMedia), fields.claim, fields.amountCents, fields.published],
  );
  const row = result.rows[0];
  return row ? { ok: true, value: toPendingSponsorship(row) } : { ok: false, reason: SponsorshipRefusal.NotFound };
}

/**
 * Lists every request nobody has taken over yet, oldest first, because that
 * one is the likeliest to have been paid and the closest to expiring.
 *
 * @returns The requests.
 */
export async function listPendingSponsorships(): Promise<PendingSponsorship[]> {
  const result = await getDatabasePool().query<RequestRow>(
    `SELECT ${REQUEST_COLUMNS} FROM pending_sponsorships ORDER BY created_at ASC, id ASC`,
  );
  return result.rows.map(toPendingSponsorship);
}

/** Selects one request by its id, `$1`. */
const REQUEST_BY_ID = "id = $1";

/** Selects every request made before a moment, `$1`. */
const REQUESTS_CREATED_BEFORE = "created_at < $1";

/**
 * Removes the requests a condition selects and keeps their references.
 *
 * Every way a request leaves goes through here, the takeover, the operator's
 * removal and the expiry, so no reference musiccloud issued is forgotten. The
 * caller runs it inside a transaction: a request never goes without its
 * reference being kept, and a reference is never kept for a request that
 * stayed. A reference retired once already is left as it stands, because the
 * row records that it was issued and a second write could only say the same.
 *
 * @param client - The open transaction's client.
 * @param condition - {@link REQUEST_BY_ID} or {@link REQUESTS_CREATED_BEFORE}, never request input.
 * @param params - The condition's one parameter.
 * @returns How many requests were removed.
 */
async function retirePendingSponsorships(
  client: DatabaseQueryable,
  condition: typeof REQUEST_BY_ID | typeof REQUESTS_CREATED_BEFORE,
  params: unknown[],
): Promise<number> {
  const removed = await client.query<{ reference: string }>(
    `DELETE FROM pending_sponsorships WHERE ${condition} RETURNING reference`,
    params,
  );
  if (removed.rows.length > 0) {
    await client.query(
      `INSERT INTO retired_sponsorship_references (reference)
       SELECT unnest($1::text[])
       ON CONFLICT (reference) DO NOTHING`,
      [removed.rows.map((row) => row.reference)],
    );
  }
  return removed.rows.length;
}

/**
 * Says whether musiccloud issued a reference, whatever became of its request.
 *
 * @param reference - The reference as it is stored, upper case and without spaces.
 * @returns `true` when a request still carries it or it was retired with one,
 *   `false` when musiccloud never issued it.
 *
 * @remarks
 * Anybody can build a reference in musiccloud's form whose check digits hold, so
 * the form alone books nothing. This lookup is what the bank import makes
 * before it books a payment under one.
 */
export async function wasSponsorshipReferenceIssued(reference: string): Promise<boolean> {
  const result = await getDatabasePool().query<{ issued: boolean }>(
    `SELECT EXISTS (SELECT 1 FROM pending_sponsorships WHERE reference = $1)
         OR EXISTS (SELECT 1 FROM retired_sponsorship_references WHERE reference = $1) AS issued`,
    [reference],
  );
  return result.rows[0]?.issued === true;
}

/**
 * Turns the request a reference was issued for into a sponsor, as
 * {@link takeOverPendingSponsorship} does from the operator's side.
 *
 * @param reference - The reference as a transfer carried it, spaces and any case allowed.
 * @param payment - What arrived and the day it did, as the statement says.
 * @param externalRef - The bank's own key of the entry, `sepa:<entry reference>`.
 * @returns The sponsor as stored, or `not_found` when no request carries that
 *   reference. That is the ordinary case for a reference already taken over or
 *   expired, so the caller treats it as nothing to take over rather than as a fault.
 */
export async function takeOverPendingSponsorshipByReference(
  reference: string,
  payment: PendingSponsorshipTakeover,
  externalRef: string,
): Promise<SponsorshipOutcome<Sponsor>> {
  const stored = normalizeSponsorshipReference(reference);
  if (!stored) return { ok: false, reason: SponsorshipRefusal.NotFound };

  const found = await getDatabasePool().query<{ id: string }>(
    "SELECT id FROM pending_sponsorships WHERE reference = $1",
    [stored],
  );
  const id = found.rows[0]?.id;
  if (!id) return { ok: false, reason: SponsorshipRefusal.NotFound };

  return takeOverPendingSponsorship(id, payment, externalRef);
}

/**
 * Removes one request and keeps its reference, so a transfer that still
 * arrives under it is recognized as one musiccloud issued.
 *
 * @param id - The request's id.
 * @returns `true` when a row was removed, `false` when none has that id.
 */
export async function deletePendingSponsorship(id: string): Promise<boolean> {
  const removed = await withDatabaseTransaction(
    (client) => retirePendingSponsorships(client, REQUEST_BY_ID, [id]),
    "pending_sponsorship_delete",
  );
  return removed > 0;
}

/**
 * Turns one request into a sponsor and a donation, and removes the request.
 *
 * The picture is looked for first, outside the transaction, because only now
 * has an operator read the request and seen the money arrive; the public route
 * never fetches what a stranger names. The sponsor, the payment linked to them
 * and the removal of the request are then one transaction: a failure in any of
 * them leaves the request standing and writes nothing, so the operator can try
 * again without a sponsor or a payment counted twice.
 *
 * What the request says about the person is taken as given. What arrived and
 * when is not in the request and comes from the statement. The donation's own
 * consent stays withheld, because what the person agreed to is the Sponsor
 * Wall, which the sponsor's `published` governs.
 *
 * The request's reference is kept in `retired_sponsorship_references` in the
 * same transaction, so a later transfer under it is still recognized as one
 * musiccloud issued.
 *
 * @param id - The request's id.
 * @param payment - What arrived, in cents, and the day it did.
 * @param externalRef - The bank's own key of the entry, `sepa:<entry reference>`, for a
 *   payment the bank import read; `null`, the default, for one the operator entered. The
 *   ledger's unique index on it is what keeps a second read of the same entry from
 *   booking it again, which then fails this whole transaction rather than half of it.
 * @returns The sponsor as stored, or `not_found` when no request has that id.
 */
export async function takeOverPendingSponsorship(
  id: string,
  payment: PendingSponsorshipTakeover,
  externalRef: string | null = null,
): Promise<SponsorshipOutcome<Sponsor>> {
  const before = await getDatabasePool().query<RequestRow>(
    `SELECT ${REQUEST_COLUMNS} FROM pending_sponsorships WHERE id = $1`,
    [id],
  );
  const request = before.rows[0];
  if (!request) return { ok: false, reason: SponsorshipRefusal.NotFound };

  const pictureUrl = await resolveSponsorAvatar(request.links);
  const avatarId = pictureUrl ? await copySponsorAvatar(pictureUrl) : null;

  const sponsor = await withDatabaseTransaction(async (client) => {
    // Locked and read again inside the transaction, so two operators taking the
    // same request over cannot both write a sponsor.
    const locked = await client.query<RequestRow>(
      `SELECT ${REQUEST_COLUMNS} FROM pending_sponsorships WHERE id = $1 FOR UPDATE`,
      [id],
    );
    const current = locked.rows[0];
    if (!current) return null;

    const created = await insertSponsor(client, {
      name: current.name,
      socialMedia: current.links,
      avatarId,
      claim: current.claim,
      published: current.published,
      paidOn: payment.paidOn,
    });
    await insertDonation(
      client,
      {
        name: current.name,
        published: false,
        amountCents: payment.amountCents,
        receivedOn: payment.paidOn,
        provider: DonationProvider.BankTransfer,
        note: `Sponsorship ${formatCreditorReference(current.reference)}`,
        sponsorId: created.id,
      },
      externalRef,
    );
    await retirePendingSponsorships(client, REQUEST_BY_ID, [id]);
    return { ...created, amountCents: payment.amountCents };
  }, "pending_sponsorship_takeover");

  if (!sponsor) return { ok: false, reason: SponsorshipRefusal.NotFound };
  await pruneUnusedSponsorAvatars();
  return { ok: true, value: sponsor };
}

/**
 * Removes the requests nobody took over within {@link PENDING_SPONSORSHIP_DAYS}.
 *
 * They hold a name, an address and a sentence given for a payment that never
 * arrived, so there is no reason left to keep them. Their references are kept,
 * because a payment can still arrive after its request expired, and the
 * reference alone names nobody.
 *
 * @param now - The moment to measure against. Defaults to now.
 * @returns How many were removed.
 */
export async function expirePendingSponsorships(now: Date = new Date()): Promise<number> {
  return withDatabaseTransaction(
    (client) => retirePendingSponsorships(client, REQUESTS_CREATED_BEFORE, [pendingSponsorshipCutoff(now)]),
    "pending_sponsorship_expiry",
  );
}

/**
 * Starts the daily sweep of expired requests and runs one at once.
 *
 * @param logger - Where a sweep that removed something says how many, such as
 *   the Fastify logger. The count and nothing else is logged, because what was
 *   in those rows is what is being got rid of.
 * @returns The timer, unreferenced so it never keeps the process alive, for
 *   shutdown to clear.
 */
export function startPendingSponsorshipExpiry(logger: Pick<FastifyBaseLogger, "info">): NodeJS.Timeout {
  const sweep = () => {
    void expirePendingSponsorships()
      .then((removed) => {
        if (removed > 0) {
          logger.info({ component: LOG_COMPONENT, operation: "pending_sponsorship_expiry", removed }, "expired");
        }
      })
      .catch((error) =>
        log.deviation(
          {
            component: LOG_COMPONENT,
            errorCode: "MC-DB-0004",
            operation: "pending_sponsorship_expiry",
            outcome: "sweep_failed",
          },
          error,
        ),
      );
  };
  sweep();
  const timer = setInterval(sweep, EXPIRY_INTERVAL_MS);
  timer.unref();
  return timer;
}
