/**
 * @file Reads and writes the annual sponsors.
 *
 * What a sponsor gave is summed from the donations linked to them on every
 * read, because the ledger is the only place a payment is recorded. A sponsor
 * who renewed carries several payments, and the sum is their total.
 */

import type { Sponsor, SponsorInput } from "@musiccloud/shared";
import { nanoid } from "nanoid";
import { getDatabasePool } from "../db/pool.js";

/** One `sponsors` row as the reads below return it, with the linked amount summed. */
interface SponsorQueryRow {
  id: string;
  name: string;
  links: string[];
  claim: string;
  published: boolean;
  paid_on: string;
  amount_cents: string;
  created_at: Date;
  updated_at: Date;
}

/**
 * The columns every read selects from a source aliased `s`, with the day as
 * text so no time zone can move it, and the amount summed from the ledger.
 */
const SPONSOR_SELECT = `s.id, s.name, s.links, s.claim, s.published, to_char(s.paid_on, 'YYYY-MM-DD') AS paid_on,
  s.created_at, s.updated_at,
  COALESCE((SELECT SUM(d.amount_cents) FROM donations d WHERE d.sponsor_id = s.id), 0) AS amount_cents`;

/**
 * Turns a row into what the API returns.
 *
 * @param row - The row as read.
 * @returns The sponsor.
 */
function toSponsor(row: SponsorQueryRow): Sponsor {
  return {
    id: row.id,
    name: row.name,
    links: row.links,
    claim: row.claim,
    published: row.published,
    paidOn: row.paid_on,
    amountCents: Number(row.amount_cents),
    createdAt: new Date(row.created_at).toISOString(),
    updatedAt: new Date(row.updated_at).toISOString(),
  };
}

/**
 * Lists every sponsor, current or past, the most recent payment first.
 *
 * @returns The sponsors with the amount linked to each.
 */
export async function listSponsors(): Promise<Sponsor[]> {
  const result = await getDatabasePool().query<SponsorQueryRow>(
    `SELECT ${SPONSOR_SELECT} FROM sponsors s ORDER BY s.paid_on DESC, s.created_at DESC`,
  );
  return result.rows.map(toSponsor);
}

/**
 * Tells whether a sponsor exists, so a donation is only ever linked to one
 * that does.
 *
 * @param id - The sponsor's id.
 * @returns `true` when a sponsor has that id.
 */
export async function sponsorExists(id: string): Promise<boolean> {
  const result = await getDatabasePool().query("SELECT 1 FROM sponsors WHERE id = $1", [id]);
  return (result.rowCount ?? 0) > 0;
}

/**
 * Records a sponsor.
 *
 * @param input - The validated sponsor.
 * @returns The stored sponsor. Its amount is zero, because nothing can be
 *   linked to a sponsor that did not exist a moment ago.
 */
export async function createSponsor(input: SponsorInput): Promise<Sponsor> {
  const result = await getDatabasePool().query<SponsorQueryRow>(
    `WITH s AS (
       INSERT INTO sponsors (id, name, links, claim, published, paid_on)
       VALUES ($1, $2, $3::jsonb, $4, $5, $6)
       RETURNING *
     )
     SELECT ${SPONSOR_SELECT} FROM s`,
    [nanoid(), input.name, JSON.stringify(input.links), input.claim, input.published, input.paidOn],
  );
  return toSponsor(result.rows[0] as SponsorQueryRow);
}

/**
 * Changes a sponsor. The linked payments are not part of the input; they are
 * changed on the donation.
 *
 * @param id - The sponsor to change.
 * @param input - The validated new values.
 * @returns The stored sponsor with the amount linked to them, or `null` when
 *   no sponsor has that id.
 */
export async function updateSponsor(id: string, input: SponsorInput): Promise<Sponsor | null> {
  const result = await getDatabasePool().query<SponsorQueryRow>(
    `WITH s AS (
       UPDATE sponsors
          SET name = $2, links = $3::jsonb, claim = $4, published = $5, paid_on = $6, updated_at = NOW()
        WHERE id = $1
        RETURNING *
     )
     SELECT ${SPONSOR_SELECT} FROM s`,
    [id, input.name, JSON.stringify(input.links), input.claim, input.published, input.paidOn],
  );
  const row = result.rows[0];
  return row ? toSponsor(row) : null;
}

/**
 * Removes a sponsor. The payments linked to them stay in the ledger as free
 * donations, because the foreign key sets their `sponsor_id` to `NULL`.
 *
 * @param id - The sponsor to remove.
 * @returns `true` when a row was removed, `false` when no sponsor has that id.
 */
export async function deleteSponsor(id: string): Promise<boolean> {
  const result = await getDatabasePool().query("DELETE FROM sponsors WHERE id = $1", [id]);
  return (result.rowCount ?? 0) > 0;
}
