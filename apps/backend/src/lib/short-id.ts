import { nanoid } from "nanoid";

/** Generate a 21-character track ID */
export function generateTrackId(): string {
  return nanoid(21);
}

/** Generate a 5-character short URL ID */
export function generateShortId(): string {
  return nanoid(5);
}
