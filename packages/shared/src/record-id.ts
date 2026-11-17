/**
 * @file The identifier of a record the server creates with `nanoid`, such as a
 * donation or a sponsor, as a route accepts it in a path or a body.
 */

/** Longest record id a route accepts: 64 characters, well above a nanoid's 21. */
export const RECORD_ID_MAX_LENGTH = 64;

/** The characters a nanoid uses, and the only ones a record id may contain. */
export const RECORD_ID_PATTERN = "^[A-Za-z0-9_-]+$";

/**
 * The JSON schema of a record id, for a route's `params` or a body field.
 *
 * Holding a path segment to these characters keeps `/`, `.` and `%` out of
 * it, so an id can never name another path.
 */
export const RECORD_ID_SCHEMA = {
  type: "string",
  minLength: 1,
  maxLength: RECORD_ID_MAX_LENGTH,
  pattern: RECORD_ID_PATTERN,
} as const;

/**
 * The `params` schema of a route addressed by one record id, `:id`.
 */
export const RECORD_ID_PARAMS_SCHEMA = {
  type: "object",
  required: ["id"],
  additionalProperties: false,
  properties: { id: RECORD_ID_SCHEMA },
} as const;
