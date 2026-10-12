/**
 * @file The one check behind every guard over a fixed list of values.
 *
 * Internal to the package: the vocabulary modules export their own named
 * guards, which call this, so a caller never names a list and a guard
 * separately.
 */

/**
 * Whether `value` is one of `values`, typed so a guard can narrow to the
 * list's union.
 *
 * @param values - The allowed values.
 * @param value - The candidate, typically straight off a request.
 * @returns `true` when the candidate is a string in the list.
 */
export function belongsTo<T extends string>(values: readonly T[], value: unknown): value is T {
  return typeof value === "string" && (values as readonly string[]).includes(value);
}
