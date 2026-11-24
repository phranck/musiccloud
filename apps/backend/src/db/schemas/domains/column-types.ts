import { type SQL, sql } from "drizzle-orm";
import { customType } from "drizzle-orm/pg-core";

/**
 * Postgres `bytea` column helper. Drizzle does not ship a first-party
 * bytea column type, so we declare one via `customType`. Values are read
 * and written as Node `Buffer` instances (the shape `pg` uses natively).
 */
export const bytea = customType<{ data: Buffer; notNull: false; default: false }>({
  dataType() {
    return "bytea";
  },
});

/**
 * The quoted list a check constraint compares a column against, such as
 * `'active', 'suspended'`.
 *
 * The values are the shared package's own constants and never request input,
 * so writing them into the SQL as text is safe. The constraint text comes out
 * exactly as it was written by hand, so moving a check onto a shared list
 * changes no migration.
 *
 * @param values - The allowed values.
 * @returns The list as raw SQL.
 */
export function sqlValueList(values: readonly string[]): SQL {
  return sql.raw(values.map((value) => `'${value}'`).join(", "));
}
