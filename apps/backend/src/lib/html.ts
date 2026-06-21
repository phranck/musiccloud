const ESCAPE_MAP: Record<string, string> = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#39;",
};

const ESCAPE_RE = /[&<>"']/g;

export function escapeHtml(value: string): string {
  return value.replace(ESCAPE_RE, (ch) => ESCAPE_MAP[ch]);
}

const NAMED_ENTITY_MAP: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: " ",
};

const ENTITY_RE = /&(#x[0-9a-f]+|#[0-9]+|[a-z][a-z0-9]*);/gi;

/**
 * Decodes the HTML character entities that upstream APIs leave in
 * human-readable text — notably Jamendo, which returns e.g. `R&amp;B` and
 * `it&#39;s` raw. Handles the named entities in {@link NAMED_ENTITY_MAP} plus
 * decimal (`&#39;`) and hex (`&#x27;`) numeric references. Unknown or
 * out-of-range entities are returned verbatim, so a literal `&` in
 * already-clean text is never mangled. Single-pass: not intended to unwind
 * double-encoded input.
 *
 * Use this on display text only (titles, names) — never on URLs, where an
 * `&amp;` may be a legitimate, already-correct query separator encoding.
 *
 * @param value - Possibly entity-encoded text.
 * @returns The text with recognised entities decoded.
 */
export function decodeHtmlEntities(value: string): string {
  return value.replace(ENTITY_RE, (match, entity: string) => {
    const e = entity.toLowerCase();
    if (e[0] === "#") {
      const code = e[1] === "x" ? Number.parseInt(e.slice(2), 16) : Number.parseInt(e.slice(1), 10);
      if (Number.isNaN(code) || code < 0 || code > 0x10ffff) return match;
      return String.fromCodePoint(code);
    }
    return NAMED_ENTITY_MAP[e] ?? match;
  });
}
