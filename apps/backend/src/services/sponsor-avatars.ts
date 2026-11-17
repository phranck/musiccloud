/**
 * @file The copies of sponsors' pictures that musiccloud stores and serves
 * from its own origin.
 *
 * A copy is addressed by the SHA-256 of its bytes, so the same picture is
 * stored once and its address never changes. This is the part of the sponsor
 * avatar work lmaa.space does not have: lmaa stores the foreign address and a
 * visitor's browser fetches from the sponsor's host.
 */

import { createHash } from "node:crypto";
import { getDatabasePool } from "../db/pool.js";

/** The hash a copy's id is made from. */
const AVATAR_ID_HASH = "sha256";

/**
 * How long a copy no sponsor points at is kept: one day, so a card that
 * fetched a picture and has not been saved yet can still save it.
 */
const UNUSED_AVATAR_GRACE_INTERVAL = "1 day";

/**
 * Stores a picture and answers its id.
 *
 * The id is the SHA-256 of the bytes, so storing the same picture again finds
 * the row that is already there. `ON CONFLICT DO NOTHING` absorbs exactly that
 * case and no other, because two different pictures cannot share an id.
 *
 * @param png - PNG bytes the server encoded.
 * @returns The picture's id, 64 lowercase hex digits.
 */
export async function storeSponsorAvatar(png: Buffer): Promise<string> {
  const id = createHash(AVATAR_ID_HASH).update(png).digest("hex");
  await getDatabasePool().query("INSERT INTO sponsor_avatars (id, png) VALUES ($1, $2) ON CONFLICT (id) DO NOTHING", [
    id,
    png,
  ]);
  return id;
}

/**
 * Reads a stored picture.
 *
 * @param id - The picture's id.
 * @returns The PNG bytes, or `null` when no picture has that id.
 */
export async function readSponsorAvatar(id: string): Promise<Buffer | null> {
  const result = await getDatabasePool().query<{ png: Buffer }>("SELECT png FROM sponsor_avatars WHERE id = $1", [id]);
  return result.rows[0]?.png ?? null;
}

/**
 * Tells whether a picture is stored, so a sponsor only ever points at one that is.
 *
 * @param id - The picture's id.
 * @returns `true` when a picture has that id.
 */
export async function sponsorAvatarExists(id: string): Promise<boolean> {
  const result = await getDatabasePool().query("SELECT 1 FROM sponsor_avatars WHERE id = $1", [id]);
  return (result.rowCount ?? 0) > 0;
}

/**
 * Removes the copies no sponsor points at that are older than
 * {@link UNUSED_AVATAR_GRACE_INTERVAL}. Called after every sponsor write, which
 * is the only moment a copy can stop being used.
 */
export async function pruneUnusedSponsorAvatars(): Promise<void> {
  await getDatabasePool().query(
    `DELETE FROM sponsor_avatars a
      WHERE a.created_at < NOW() - $1::interval
        AND NOT EXISTS (SELECT 1 FROM sponsors s WHERE s.avatar_id = a.id)`,
    [UNUSED_AVATAR_GRACE_INTERVAL],
  );
}
