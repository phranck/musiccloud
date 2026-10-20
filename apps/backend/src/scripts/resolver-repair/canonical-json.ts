import { createHash } from "node:crypto";

/** A value that serializes to JSON and parses back unchanged. */
export type JsonValue = string | number | boolean | null | JsonValue[] | { [key: string]: JsonValue };

/**
 * Orders object keys at every depth, so equal content serializes to equal text on every machine.
 * Array order carries meaning and stays as it is.
 *
 * @param value - JSON-compatible content, including PostgreSQL `Date` objects.
 * @returns The same content with sorted keys and dates as ISO strings.
 * @throws {Error} With the message `NON_JSON_VALUE` for anything that has no single JSON form, such as `undefined`,
 *   a function or a non-finite number. Such a value would serialize differently in a checksum than in the file it describes.
 */
export function canonicalValue(value: unknown): unknown {
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) return value.map(canonicalValue);
  if (value !== null && typeof value === "object" && Object.getPrototypeOf(value) === Object.prototype) {
    return Object.fromEntries(
      Object.entries(value)
        .sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0))
        .map(([key, item]) => [key, canonicalValue(item)]),
    );
  }
  if (
    value === null ||
    typeof value === "string" ||
    typeof value === "boolean" ||
    (typeof value === "number" && Number.isFinite(value))
  )
    return value;
  throw new Error("NON_JSON_VALUE");
}

/**
 * Serializes content in its canonical form.
 *
 * @param value - JSON-compatible content.
 * @returns Compact JSON text with sorted keys.
 */
export function canonicalJson(value: unknown): string {
  return JSON.stringify(canonicalValue(value));
}

/**
 * Hashes text with SHA-256.
 *
 * @param text - Exact characters to identify.
 * @returns A lowercase hexadecimal digest that contains none of the text.
 */
export function sha256Hex(text: string): string {
  return createHash("sha256").update(text).digest("hex");
}
