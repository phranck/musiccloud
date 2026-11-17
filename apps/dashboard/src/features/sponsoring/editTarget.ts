/**
 * @file Which row a sponsoring screen's edit card shows.
 */

/**
 * What the edit card shows.
 *
 * - `Closed`: no card.
 * - `New`: the card for a row not yet recorded.
 * - `Existing`: the card for a stored row.
 */
export const EditTargetKind = {
  Closed: "closed",
  New: "new",
  Existing: "existing",
} as const;

/**
 * Which row the edit card shows, by {@link EditTargetKind}.
 *
 * @typeParam Row - The kind of row the screen lists, such as a donation or a sponsor.
 */
export type EditTarget<Row> =
  | { kind: typeof EditTargetKind.Closed }
  | { kind: typeof EditTargetKind.New }
  | { kind: typeof EditTargetKind.Existing; row: Row };
