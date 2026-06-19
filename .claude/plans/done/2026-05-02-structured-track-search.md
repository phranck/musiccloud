# Structured Track Search Implementation Plan

Plan-Nr.: MC-013

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a structured-search query shape (`title:`, `artist:`, `album:`, `count:`) to the resolve endpoints, routed through the existing disambiguation flow, and document the complete query-shape catalog (URL, free text, genre, structured) end-to-end in both the OpenAPI/ReDoc descriptions and the bilingual resolver-flow LaTeX.

**Architecture:** New `services/structured-search/` subsystem (parser + detector + index, mirroring `services/genre-search/`) produces a `SearchQuery` and an optional `candidateLimit`, both fed into the existing `resolveTextSearchWithDisambiguation` via two new optional parameters. Routing is a new detect-branch between the existing `genre:` branches and the `selectedCandidate`/URL branches. User-facing documentation is extended in two surfaces — ReDoc API descriptions (rendered from OpenAPI strings in `routes/resolve.ts:113-117` and `resolve-public-get.ts:68`) and the bilingual `docs/resolve-flow/{de,en}/resolve-flow.tex`.

**Tech Stack:** TypeScript (Node.js 20), Fastify, vitest. Workspace package manager: npm. Backend tests via `npm run test --workspace=apps/backend`. LaTeX rendering via `make docs` (xelatex on PATH per `WHATS-NEXT.md`; targets `docs-de` and `docs-en` in the repo Makefile).

---

## Status

**Implementation plan ready 2026-05-01** — brainstorming complete, design approved (see Decisions block), all code references re-verified against HEAD `6dc1178d`. Ready for execution via `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans`.

## Context

Today the resolve endpoint accepts three query shapes (URL, free text, `genre:` discovery). For free text, the search query string is passed verbatim into `searchTrackWithCandidates({ title: query, artist: query })` — the same string is fed into both fields, leaving the adapter to fuzzy-match.

Users want a structured alternative for the common case where they know exactly what they are looking for:

```
title: The Killing Moon, artist: Echo & The Bunnymen
title: Karma Police, artist: Radiohead, album: OK Computer, count: 5
artist: Radiohead
```

The new format produces a precise lookup (title, artist, and optionally album scored independently by adapters that support field operators) instead of relying on a free-text guess. It mirrors the existing `genre: …, tracks: 20` syntax users already know. `count:` caps the disambiguation list when the top match is below the auto-select threshold.

## Spec / Goal

Add a structured-search query shape to `POST /api/v1/resolve` and `GET /api/v1/resolve` that lives parallel to the existing genre-search subsystem. Route inputs that begin with `title:`/`artist:`/`album:` through a new parser into the existing `resolveTextSearchWithDisambiguation` flow. Provide an optional `count:` modifier that caps the disambiguation candidate list (capped server-side at `MAX_CANDIDATES`).

### Mode

**Resolver mode only** — single-track lookup with disambiguation when confidence is below `AUTO_SELECT_THRESHOLD`. No discovery semantics (no listing, no top-N browsing).

### Tier

**Tier 1 fields only** — `title`, `artist`, `album`. Fields universally supported by every track-search adapter, either natively (Spotify `track:/artist:/album:`, Deezer `artist:"…" track:"…"`, MusicBrainz Lucene `recording: artist: release:`) or via term-concatenation (Apple Music, Tidal, KKBOX, JioSaavn, Napster, NetEase, Qobuz, YouTube, plus the scraper adapters).

`year:`, `genre:`, `label:`, `duration:`, `bpm:` are out of scope (Tier 2/3) — they require either a post-filter layer or are single-vendor.

## Design

### Grammar

```
<query>   := <field> ("," <field>)*
<field>   := ("title" | "artist" | "album" | "count") ":" <value>
```

- Keys case-insensitive, values preserve original case.
- Whitespace around `:` and `,` is collapsed.
- Auto-comma insertion: regex `(?<!,)\s+(title|artist|album|count)\s*:` rewrites `title: X artist: Y` to `title: X, artist: Y`. Mirrors the genre parser's auto-comma at `services/genre-search/parser.ts:78`.
- At least one of `title:` / `artist:` MUST be present. `album:` alone → 400 (album-by-text is a separate resolver path that does not exist today; would be a future spec).
- `count:` is optional, positive integer 1-10. Server clamps to `MAX_CANDIDATES`.
- Duplicate keys, unknown keys, and empty values → hard error (same discipline as the genre parser at `services/genre-search/parser.ts:147,151,156`).
- Genre-search-specific keys (`genre`, `tracks`, `albums`, `artists`, `vibe`) → hard error with a directive message: `"'tracks' is only valid in genre: queries. Allowed here: title, artist, album, count"`. Other unknown keys → generic `"Unknown field 'X'. Allowed: title, artist, album, count"`.
- Comma inside a value is not supported (the comma is the field separator).

### Files to add

- `apps/backend/src/services/structured-search/parser.ts` — parser, detector, error class. Exports `parseStructuredSearchQuery(input) → ParsedStructuredQuery`, `isStructuredSearchQuery(query) → boolean`, `StructuredSearchQueryParseError`.
- `apps/backend/src/services/structured-search/__tests__/parser.test.ts` — unit tests, analogous to `services/genre-search/__tests__/parser.test.ts`.
- `apps/backend/src/services/structured-search/index.ts` — re-exports the public API plus the detector. Mirrors the layout of `services/genre-search/index.ts`.

### Parser output

```ts
export interface ParsedStructuredQuery {
  /** SearchQuery shape ready for adapter calls. Reuses services/types.ts:234 type. */
  search: SearchQuery;
  /** From `count:`, capped 1..10 by parser. Resolver clamps further to MAX_CANDIDATES. */
  candidateLimit?: number;
  /** Non-fatal observations. Empty for clean queries. Future-proofing. */
  warnings: string[];
}
```

### Files to modify

#### `apps/backend/src/services/resolver.ts:637-747` — `resolveTextSearchWithDisambiguation`

Extend signature:

```ts
export async function resolveTextSearchWithDisambiguation(
  query: string,
  structured?: SearchQuery,
  candidateLimit?: number,
): Promise<TextSearchResult>
```

- `query` remains the cache-key / log-label (string form unchanged).
- When `structured` is set, pass it to `adapter.searchTrackWithCandidates(structured)` and the fallback `adapter.searchTrack(structured)` instead of `{ title: query, artist: query }`.
- When `candidateLimit` is set, replace the slice at line 692:

```ts
// Before:
.slice(0, MAX_CANDIDATES)
// After:
.slice(0, Math.min(MAX_CANDIDATES, Math.max(1, candidateLimit ?? MAX_CANDIDATES)))
```

#### `apps/backend/src/services/resolver.ts:580-617` — `resolveTextSearch`

**Not modified.** Caller analysis (2026-05-01): only invoked from `resolveQuery` at lines 436 and 447, which itself is reached from URL-resolution flows and a Last.fm fallback path — neither encounters structured queries.

#### `apps/backend/src/routes/resolve.ts:113-117` — OpenAPI description (user-facing)

The description string is rendered by ReDoc as the canonical API documentation surface. After the change it must walk a user through **every** query shape the endpoint accepts, with examples and "when to use" guidance. Concretely the description becomes a four-bullet list (current shape order preserved):

1. **Streaming-service URL** — `https://open.spotify.com/track/...`, `https://music.apple.com/...`, etc. Returns unified cross-service metadata. Use when the user already has a link.
2. **Free-text query** — any string that is not a URL and does not start with a structured prefix. Returns either a resolved match or a disambiguation list (follow up with `selectedCandidate` to pick one). Use when the user only knows roughly what they want.
3. **Genre-discovery query** — starts with `genre:`. Two sub-modes:
   - `genre: ?` → browse grid of popular genres (no other fields allowed).
   - `genre: <name>[|<name>...]<, modifier>*` → discovery results. Modifiers: `tracks`/`albums`/`artists` (1–50 each, default 10 of each when none specified), `count` (1–50, sets all three to the same value, mutually exclusive with the per-type modifiers), `vibe` (`hot` for top-N, `mixed` for stratified random sample). `|` inside a value is OR (`genre: jazz|r&b`).
   - Example: `genre: jazz|r&b, tracks: 20, vibe: mixed`.
4. **Structured search query** — starts with `title:`, `artist:`, or `album:`. Returns either a resolved track or a disambiguation list, same as free-text but with adapter-side field operators (Spotify, Deezer, MusicBrainz) for higher precision. Supported fields:
   - `title:` and `artist:` — at least one required.
   - `album:` — optional, refines the match. `album:` alone (without `title:` or `artist:`) is rejected with 400.
   - `count:` — optional, 1–10, caps the disambiguation list.
   - Examples: `title: The Killing Moon, artist: Echo & The Bunnymen` · `artist: Radiohead` · `title: Karma Police, artist: Radiohead, album: OK Computer, count: 5`.

Plus a one-line note that `selectedCandidate` is the follow-up shape (already documented in the body schema; cross-reference here so users see the full picture in one place).

#### `apps/backend/src/routes/resolve.ts` — new structured detect-branch

Insert between the `isGenreSearchQuery` block (ends around line 223) and the `selectedCandidate` block (line 225):

```ts
if (query && isStructuredSearchQuery(query)) {
  let parsed: ParsedStructuredQuery;
  try {
    parsed = parseStructuredSearchQuery(query);
  } catch (err) {
    if (err instanceof StructuredSearchQueryParseError) {
      return reply.status(400).send(jsonError("INVALID_URL", err.message));
    }
    throw err;
  }
  const result = await resolveTextSearchWithDisambiguation(query, parsed.search, parsed.candidateLimit);
  if (result.kind === "resolved" && result.result) {
    return reply.send(await persistTrackAndRespond(result.result, origin));
  }
  return reply.send({ status: "disambiguation", candidates: result.candidates });
}
```

Mirrors the shape of the genre-search 400 path at `routes/resolve.ts:212`.

#### `apps/backend/src/routes/resolve-public-get.ts:68` — description (user-facing)

The GET endpoint cannot disambiguate over a stateless one-shot, so its description is shorter than the POST equivalent — but it still needs to enumerate every accepted shape with a one-line example each. Target form:

> Unauthenticated companion to POST `/api/v1/resolve`, designed for scripting consumers (Apple Shortcuts, curl, bookmarklets). Accepts:
>
> - **Streaming-service URL** (e.g. `https://open.spotify.com/track/...`)
> - **Free-text query** (e.g. `bohemian rhapsody queen`)
> - **Genre-discovery query** (e.g. `genre: jazz, tracks: 5`) — same modifiers as POST.
> - **Structured search query** (e.g. `title: Bohemian Rhapsody, artist: Queen`) — supported fields: `title`, `artist`, `album`, `count` (1–10).
>
> Returns the resolved track (200) or 400 if the query is ambiguous, malformed, or can't be resolved. Rate-limited per client IP.

#### `apps/backend/src/routes/resolve-public-get.ts:137-150` — new structured detect-branch

Insert at the top of the `else` block (before the existing free-text branch):

```ts
} else if (isStructuredSearchQuery(query)) {
  let parsed: ParsedStructuredQuery;
  try {
    parsed = parseStructuredSearchQuery(query);
  } catch (err) {
    if (err instanceof StructuredSearchQueryParseError) {
      return reply.status(400).send(jsonError("INVALID_URL", err.message));
    }
    throw err;
  }
  const textResult = await resolveTextSearchWithDisambiguation(query, parsed.search, parsed.candidateLimit);
  if (textResult.kind === "resolved" && textResult.result) {
    result = textResult.result;
  } else {
    return reply.status(400).send(jsonError("INVALID_URL", "Structured query was ambiguous; use POST endpoint for disambiguation."));
  }
} else {
  // existing free-text branch (resolveTextSearchWithDisambiguation(query))
  …
}
```

#### `apps/backend/src/services/types.ts:234` — `SearchQuery`

**Not modified.** The existing `{ title, artist, album? }` shape is exactly what the parser produces.

#### `docs/resolve-flow/de/resolve-flow.tex` and `docs/resolve-flow/en/resolve-flow.tex` — bilingual user-facing chapter

The LaTeX resolver-flow doc is bilingual (DE 961 lines, EN 917 lines, kept in parity per `64503aa9`). Today it has dedicated sections for the technical resolver internals plus a "Genre-Discovery" section with browse + search sub-modes. **Two changes:**

1. **Add a new top-level section "Strukturierte Suche" / "Structured search"** placed parallel to "Genre-Discovery" (between "Der Weg einer Textsuche" and "Genre-Discovery", or right after "Genre-Discovery" — whichever reads more naturally with the existing narrative). Content from a user's perspective:
   - **Wozu / What it's for** — why a user would pick this over free text (precision when title and artist are both known; useful when free-text disambiguation keeps picking the wrong track).
   - **Form / Syntax** — `title:`, `artist:`, `album:` (case-insensitive keys, comma-separated, auto-comma when missing), `count:` modifier (1–10, optional cap). At least one of `title`/`artist` required; `album` alone rejected.
   - **Beispiele / Examples** — three to five concrete queries showing each combination (single field, two fields, three fields, with `count:`, error cases).
   - **Was kommt zurück / What comes back** — single resolved track (high confidence) vs. disambiguation list capped at `count` or `MAX_CANDIDATES`. Tie back to the existing "Konfidenz-Schwellwerte" section.
   - **Modifier discipline** — `genre:`/`tracks:`/`vibe:`/etc. are rejected here with a directive error message. Cross-reference "Genre-Discovery" for those.

2. **Update the existing "Genre-Discovery" section** to add a one-paragraph cross-reference at the top: "Wenn Sie nach einem konkreten Track suchen, schauen Sie in 'Strukturierte Suche'. Hier geht es um Stöbern nach Genre." — same paragraph in EN. Keeps users from going down the wrong section when they want something specific rather than discovery.

Both `.tex` files MUST stay in DE/EN parity (every section in DE has an EN counterpart and vice versa). Per `WHATS-NEXT.md` operational note, the LaTeX is the single source of truth for the rendered PDFs (`make docs` produces `de/resolve-flow.pdf` and `en/resolve-flow.pdf`).

#### `docs/resolve-flow/VERSION` — version bump

Bump the semantic version stamp (current value visible in `docs/resolve-flow/VERSION`, single-line file). Documents the doc change in the rendered PDF header per `docs/resolve-flow/README.md`.

### Routing order in resolve.ts

```
1. genre browse        (genre:?)                    — existing
2. genre search        (genre:…)                    — existing
3. structured search   (title:/artist:/album:)      — NEW
4. selectedCandidate                                — existing
5. URL                                              — existing
6. free text                                        — existing
```

Structured detection runs after the genre branches (so `genre: rock, title: foo` is intercepted as malformed-genre, not silently routed elsewhere) and before URL detection (`title:` is not a URL anyway, but explicit ordering avoids any future ambiguity).

## Implementation

Seven tasks. Each task is self-contained and committable on its own. Tasks 1-2 build the new parser + resolver plumbing; tasks 3-4 wire the routes; task 5 extends two adapters to use the `album` field; task 6 updates the bilingual user-facing documentation; task 7 verifies in production.

### Task 1: Parser, detector, index, and unit tests (TDD)

**Files:**
- Create: `apps/backend/src/services/structured-search/parser.ts`
- Create: `apps/backend/src/services/structured-search/__tests__/parser.test.ts`
- Create: `apps/backend/src/services/structured-search/index.ts`

- [x] **Step 1: Write the failing test file**

```ts
// apps/backend/src/services/structured-search/__tests__/parser.test.ts
import { describe, expect, it } from "vitest";

import {
  isStructuredSearchQuery,
  parseStructuredSearchQuery,
  StructuredSearchQueryParseError,
} from "../parser.js";

describe("isStructuredSearchQuery", () => {
  it("matches title: prefix", () => {
    expect(isStructuredSearchQuery("title: Bohemian Rhapsody")).toBe(true);
  });
  it("matches artist: prefix", () => {
    expect(isStructuredSearchQuery("artist: Radiohead")).toBe(true);
  });
  it("matches album: prefix", () => {
    expect(isStructuredSearchQuery("album: OK Computer")).toBe(true);
  });
  it("is case-insensitive", () => {
    expect(isStructuredSearchQuery("TITLE: foo")).toBe(true);
    expect(isStructuredSearchQuery("Artist: foo")).toBe(true);
  });
  it("does not match free text", () => {
    expect(isStructuredSearchQuery("bohemian rhapsody")).toBe(false);
  });
  it("does not match genre:", () => {
    expect(isStructuredSearchQuery("genre: jazz")).toBe(false);
  });
  it("does not match URL", () => {
    expect(isStructuredSearchQuery("https://open.spotify.com/track/abc")).toBe(false);
  });
  it("does not match count: alone", () => {
    expect(isStructuredSearchQuery("count: 5")).toBe(false);
  });
});

describe("parseStructuredSearchQuery — happy path", () => {
  it("parses title + artist", () => {
    const r = parseStructuredSearchQuery("title: Karma Police, artist: Radiohead");
    expect(r.search).toEqual({ title: "Karma Police", artist: "Radiohead" });
    expect(r.candidateLimit).toBeUndefined();
    expect(r.warnings).toEqual([]);
  });
  it("parses title + artist + album + count", () => {
    const r = parseStructuredSearchQuery(
      "title: Karma Police, artist: Radiohead, album: OK Computer, count: 5",
    );
    expect(r.search).toEqual({
      title: "Karma Police",
      artist: "Radiohead",
      album: "OK Computer",
    });
    expect(r.candidateLimit).toBe(5);
  });
  it("parses title alone", () => {
    const r = parseStructuredSearchQuery("title: Bohemian Rhapsody");
    expect(r.search).toEqual({ title: "Bohemian Rhapsody", artist: "" });
  });
  it("parses artist alone", () => {
    const r = parseStructuredSearchQuery("artist: Radiohead");
    expect(r.search).toEqual({ title: "", artist: "Radiohead" });
  });
  it("preserves value case but lowercases keys", () => {
    const r = parseStructuredSearchQuery("Title: Bohemian Rhapsody, ARTIST: Queen");
    expect(r.search.title).toBe("Bohemian Rhapsody");
    expect(r.search.artist).toBe("Queen");
  });
  it("collapses whitespace around : and ,", () => {
    const r = parseStructuredSearchQuery("  title  :   foo  ,  artist  :  bar  ");
    expect(r.search).toEqual({ title: "foo", artist: "bar" });
  });
  it("auto-inserts missing comma between fields", () => {
    const r = parseStructuredSearchQuery("title: foo artist: bar");
    expect(r.search).toEqual({ title: "foo", artist: "bar" });
  });
  it("accepts ampersand and special chars in values", () => {
    const r = parseStructuredSearchQuery("artist: Echo & The Bunnymen");
    expect(r.search.artist).toBe("Echo & The Bunnymen");
  });
});

describe("parseStructuredSearchQuery — error path", () => {
  it("rejects empty input", () => {
    expect(() => parseStructuredSearchQuery("")).toThrow(StructuredSearchQueryParseError);
  });
  it("rejects album: alone", () => {
    expect(() => parseStructuredSearchQuery("album: OK Computer")).toThrow(
      /at least one of: title, artist/,
    );
  });
  it("rejects count: alone", () => {
    expect(() => parseStructuredSearchQuery("count: 5")).toThrow(/at least one of: title, artist/);
  });
  it("rejects unknown key", () => {
    expect(() => parseStructuredSearchQuery("title: foo, foo: bar")).toThrow(
      /Unknown field 'foo'\. Allowed: title, artist, album, count/,
    );
  });
  it("rejects 'tracks' with directive message pointing to genre:", () => {
    expect(() => parseStructuredSearchQuery("title: foo, tracks: 5")).toThrow(
      /'tracks' is only valid in genre: queries\. Allowed here: title, artist, album, count/,
    );
  });
  it("rejects 'vibe' with directive message", () => {
    expect(() => parseStructuredSearchQuery("title: foo, vibe: hot")).toThrow(
      /'vibe' is only valid in genre: queries/,
    );
  });
  it("rejects 'genre' as a key inside structured search", () => {
    expect(() => parseStructuredSearchQuery("title: foo, genre: rock")).toThrow(
      /'genre' is only valid in genre: queries/,
    );
  });
  it("rejects duplicate keys", () => {
    expect(() => parseStructuredSearchQuery("title: foo, title: bar")).toThrow(
      /Duplicate field 'title'/,
    );
  });
  it("rejects empty value", () => {
    expect(() => parseStructuredSearchQuery("title: , artist: foo")).toThrow(
      /Missing value for 'title'/,
    );
  });
  it("rejects count below 1", () => {
    expect(() => parseStructuredSearchQuery("title: foo, count: 0")).toThrow(
      /'count' must be at least 1/,
    );
  });
  it("rejects count above 10", () => {
    expect(() => parseStructuredSearchQuery("title: foo, count: 11")).toThrow(
      /'count' must be at most 10/,
    );
  });
  it("rejects non-numeric count", () => {
    expect(() => parseStructuredSearchQuery("title: foo, count: abc")).toThrow(
      /'count' must be a positive integer/,
    );
  });
  it("rejects segment without colon", () => {
    expect(() => parseStructuredSearchQuery("title: foo, garbage")).toThrow(
      /Expected 'key: value'/,
    );
  });
});
```

- [x] **Step 2: Run tests to verify they fail**

Run: `npm run test --workspace=apps/backend -- structured-search`
Expected: FAIL with `Cannot find module '../parser.js'` (parser file does not exist yet).

- [x] **Step 3: Implement the parser**

```ts
// apps/backend/src/services/structured-search/parser.ts
/**
 * @file Parser for structured-search queries.
 *
 * Accepts strings of the form
 *
 *   title: Bohemian Rhapsody, artist: Queen
 *   title: Karma Police, artist: Radiohead, album: OK Computer, count: 5
 *   artist: Radiohead
 *
 * Mirrors the bauform of services/genre-search/parser.ts. Produces a
 * SearchQuery (services/types.ts:234) plus an optional candidateLimit
 * for the disambiguation cap. Resolver-mode only — discovery semantics
 * live in services/genre-search/.
 *
 * Genre-search-specific keys (genre, tracks, albums, artists, vibe) are
 * rejected here with a directive error message so users know to use the
 * genre: query shape instead.
 */

import type { SearchQuery } from "../types.js";

export interface ParsedStructuredQuery {
  /** SearchQuery shape ready for adapter calls. */
  search: SearchQuery;
  /** From `count:`, parser-validated 1..10. Resolver further clamps to MAX_CANDIDATES. */
  candidateLimit?: number;
  /** Non-fatal observations. Empty for clean queries. Future-proofing parity with genre-search. */
  warnings: string[];
}

export class StructuredSearchQueryParseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "StructuredSearchQueryParseError";
  }
}

const VALID_KEYS = ["title", "artist", "album", "count"] as const;
type ValidKey = (typeof VALID_KEYS)[number];

const GENRE_ONLY_KEYS = ["genre", "tracks", "albums", "artists", "vibe"] as const;

const COUNT_MIN = 1;
const COUNT_MAX = 10;

const AUTO_COMMA_REGEX = new RegExp(`(?<!,)\\s+(${VALID_KEYS.join("|")})\\s*:`, "gi");
const STRUCTURED_PREFIX_REGEX = /^\s*(title|artist|album)\s*:/i;

function insertMissingCommas(input: string): string {
  return input.replace(AUTO_COMMA_REGEX, ", $1:");
}

function isValidKey(value: string): value is ValidKey {
  return (VALID_KEYS as readonly string[]).includes(value);
}

function isGenreOnlyKey(value: string): boolean {
  return (GENRE_ONLY_KEYS as readonly string[]).includes(value);
}

/** True iff the query starts with `title:`, `artist:`, or `album:`. */
export function isStructuredSearchQuery(input: string): boolean {
  return STRUCTURED_PREFIX_REGEX.test(input);
}

/**
 * Parse a structured-search query string.
 *
 * @throws {StructuredSearchQueryParseError} when the input is syntactically invalid.
 */
export function parseStructuredSearchQuery(input: string): ParsedStructuredQuery {
  const trimmed = input.trim();
  if (trimmed === "") {
    throw new StructuredSearchQueryParseError("Query is empty");
  }

  const segments = insertMissingCommas(trimmed)
    .split(",")
    .map((s) => s.trim())
    .filter((s) => s.length > 0);

  let title: string | null = null;
  let artist: string | null = null;
  let album: string | null = null;
  let candidateLimit: number | null = null;
  const seenKeys = new Set<ValidKey>();

  for (const segment of segments) {
    const colonIdx = segment.indexOf(":");
    if (colonIdx === -1) {
      throw new StructuredSearchQueryParseError(`Expected 'key: value' in segment '${segment}'`);
    }

    const rawKey = segment.slice(0, colonIdx).trim();
    const rawValue = segment.slice(colonIdx + 1).trim();

    if (rawKey === "") {
      throw new StructuredSearchQueryParseError(`Missing key before ':' in segment '${segment}'`);
    }

    const key = rawKey.toLowerCase();

    if (isGenreOnlyKey(key)) {
      throw new StructuredSearchQueryParseError(
        `'${rawKey}' is only valid in genre: queries. Allowed here: title, artist, album, count`,
      );
    }

    if (!isValidKey(key)) {
      throw new StructuredSearchQueryParseError(
        `Unknown field '${rawKey}'. Allowed: title, artist, album, count`,
      );
    }

    if (seenKeys.has(key)) {
      throw new StructuredSearchQueryParseError(`Duplicate field '${rawKey}'`);
    }
    seenKeys.add(key);

    if (rawValue === "") {
      throw new StructuredSearchQueryParseError(`Missing value for '${rawKey}'`);
    }

    switch (key) {
      case "title":
        title = rawValue;
        break;
      case "artist":
        artist = rawValue;
        break;
      case "album":
        album = rawValue;
        break;
      case "count":
        candidateLimit = parseCount(rawValue);
        break;
    }
  }

  if (title === null && artist === null) {
    throw new StructuredSearchQueryParseError(
      "Structured query needs at least one of: title, artist",
    );
  }

  const search: SearchQuery = {
    title: title ?? "",
    artist: artist ?? "",
    ...(album !== null ? { album } : {}),
  };

  return {
    search,
    ...(candidateLimit !== null ? { candidateLimit } : {}),
    warnings: [],
  };
}

function parseCount(raw: string): number {
  if (!/^\d+$/.test(raw)) {
    throw new StructuredSearchQueryParseError(
      `'count' must be a positive integer (got '${raw}')`,
    );
  }
  const n = Number.parseInt(raw, 10);
  if (n < COUNT_MIN) {
    throw new StructuredSearchQueryParseError(`'count' must be at least ${COUNT_MIN} (got ${n})`);
  }
  if (n > COUNT_MAX) {
    throw new StructuredSearchQueryParseError(`'count' must be at most ${COUNT_MAX} (got ${n})`);
  }
  return n;
}
```

- [x] **Step 4: Run tests to verify they pass**

Run: `npm run test --workspace=apps/backend -- structured-search`
Expected: PASS — all 29 parser/detector tests green (8 detector + 8 happy + 13 error).

- [x] **Step 5: Implement the index re-export**

```ts
// apps/backend/src/services/structured-search/index.ts
/**
 * @file Public entry point for the structured-search feature.
 *
 * Mirrors the bauform of services/genre-search/index.ts. Re-exports the
 * parser, detector, and error class for use from routes and the resolver
 * layer. Keep imports stable so callers do not need to know whether the
 * symbol lives in parser.ts or somewhere else.
 */

export type { ParsedStructuredQuery } from "./parser.js";
export {
  StructuredSearchQueryParseError,
  isStructuredSearchQuery,
  parseStructuredSearchQuery,
} from "./parser.js";
```

- [x] **Step 6: Run full backend suite to confirm no regression**

Run: `npm run test --workspace=apps/backend`
Expected: previous 852 tests + 29 new = 881 tests pass; 19 skipped unchanged.

- [x] **Step 7: Commit**

```bash
git add apps/backend/src/services/structured-search/
git commit -m "$(cat <<'EOF'
Feat: Add structured-search parser, detector, and index

- New `services/structured-search/parser.ts` exports `parseStructuredSearchQuery`, `isStructuredSearchQuery`, and `StructuredSearchQueryParseError`. Grammar mirrors the existing genre-search parser: comma-separated `key:value`, case-insensitive keys, auto-comma insertion when commas are missing, hard errors on duplicate/unknown/empty values.
- Genre-search-specific keys (`genre`, `tracks`, `albums`, `artists`, `vibe`) are explicitly rejected with a directive message that points to the `genre:` query shape.
- `count:` modifier (1–10) caps the disambiguation candidate list. At least one of `title:` or `artist:` is required; `album:` alone is rejected.
- 29 unit tests covering the detector (8), happy path (8), and error path (13).
- New `index.ts` re-exports the public API.
EOF
)"
```

---

### Task 2: Extend `resolveTextSearchWithDisambiguation` to accept structured query and candidate limit (TDD)

**Files:**
- Modify: `apps/backend/src/services/resolver.ts:637` (signature) and `:692` (slice)
- Modify: `apps/backend/src/__tests__/resolver.test.ts` — extend the existing `describe("resolveTextSearchWithDisambiguation", ...)` block at line 231.

- [x] **Step 1: Append failing tests inside the existing `describe("resolveTextSearchWithDisambiguation", ...)` block**

Append after the existing tests (after line 358, before the closing `});`):

```ts
  it("passes structured SearchQuery to adapter instead of duplicating the free-text string", async () => {
    const track = createMockTrack();
    const searchSpy = vi.fn().mockResolvedValue({
      bestMatch: { found: true, track, confidence: 0.95, matchMethod: "search" },
      candidates: [{ track, confidence: 0.95 }],
    } satisfies SearchResultWithCandidates);

    const spotifyAdapter = createMockAdapter({
      id: "spotify",
      displayName: "Spotify",
      searchTrackWithCandidates: searchSpy,
    });
    vi.mocked(getActiveAdapters).mockResolvedValue([spotifyAdapter]);

    await resolveTextSearchWithDisambiguation("title: Karma Police, artist: Radiohead", {
      title: "Karma Police",
      artist: "Radiohead",
    });

    expect(searchSpy).toHaveBeenCalledWith({ title: "Karma Police", artist: "Radiohead" });
  });

  it("passes structured SearchQuery including album when provided", async () => {
    const track = createMockTrack();
    const searchSpy = vi.fn().mockResolvedValue({
      bestMatch: { found: true, track, confidence: 0.95, matchMethod: "search" },
      candidates: [{ track, confidence: 0.95 }],
    } satisfies SearchResultWithCandidates);

    const spotifyAdapter = createMockAdapter({
      id: "spotify",
      searchTrackWithCandidates: searchSpy,
    });
    vi.mocked(getActiveAdapters).mockResolvedValue([spotifyAdapter]);

    await resolveTextSearchWithDisambiguation(
      "title: Karma Police, artist: Radiohead, album: OK Computer",
      { title: "Karma Police", artist: "Radiohead", album: "OK Computer" },
    );

    expect(searchSpy).toHaveBeenCalledWith({
      title: "Karma Police",
      artist: "Radiohead",
      album: "OK Computer",
    });
  });

  it("falls back to {title: query, artist: query} when no structured arg is provided", async () => {
    const track = createMockTrack();
    const searchSpy = vi.fn().mockResolvedValue({
      bestMatch: { found: true, track, confidence: 0.95, matchMethod: "search" },
      candidates: [{ track, confidence: 0.95 }],
    } satisfies SearchResultWithCandidates);

    const spotifyAdapter = createMockAdapter({
      id: "spotify",
      searchTrackWithCandidates: searchSpy,
    });
    vi.mocked(getActiveAdapters).mockResolvedValue([spotifyAdapter]);

    await resolveTextSearchWithDisambiguation("Bohemian Rhapsody Queen");

    expect(searchSpy).toHaveBeenCalledWith({
      title: "Bohemian Rhapsody Queen",
      artist: "Bohemian Rhapsody Queen",
    });
  });

  it("caps the disambiguation list at candidateLimit when set below MAX_CANDIDATES", async () => {
    const tracks = Array.from({ length: 8 }, (_, i) =>
      createMockTrack({ sourceId: `t${i}`, title: `Track ${i}`, webUrl: `https://x/${i}` }),
    );
    const candidates = tracks.map((track) => ({ track, confidence: 0.6 }));

    const spotifyAdapter = createMockAdapter({
      id: "spotify",
      searchTrackWithCandidates: vi.fn().mockResolvedValue({
        bestMatch: { found: true, track: tracks[0], confidence: 0.6, matchMethod: "search" },
        candidates,
      } satisfies SearchResultWithCandidates),
    });
    vi.mocked(getActiveAdapters).mockResolvedValue([spotifyAdapter]);

    const result = await resolveTextSearchWithDisambiguation(
      "title: foo",
      { title: "foo", artist: "" },
      3,
    );

    expect(result.kind).toBe("disambiguation");
    expect(result.candidates?.length).toBe(3);
  });

  it("clamps candidateLimit to MAX_CANDIDATES (8) when caller asks for more", async () => {
    const tracks = Array.from({ length: 12 }, (_, i) =>
      createMockTrack({ sourceId: `t${i}`, title: `Track ${i}`, webUrl: `https://x/${i}` }),
    );
    const candidates = tracks.map((track) => ({ track, confidence: 0.6 }));

    const spotifyAdapter = createMockAdapter({
      id: "spotify",
      searchTrackWithCandidates: vi.fn().mockResolvedValue({
        bestMatch: { found: true, track: tracks[0], confidence: 0.6, matchMethod: "search" },
        candidates,
      } satisfies SearchResultWithCandidates),
    });
    vi.mocked(getActiveAdapters).mockResolvedValue([spotifyAdapter]);

    const result = await resolveTextSearchWithDisambiguation(
      "title: foo",
      { title: "foo", artist: "" },
      99, // ridiculous, must clamp to 8
    );

    expect(result.kind).toBe("disambiguation");
    expect(result.candidates?.length).toBeLessThanOrEqual(8);
  });
```

- [x] **Step 2: Run tests to verify they fail**

Run: `npm run test --workspace=apps/backend -- resolver`
Expected: 5 new FAIL: signature mismatch (`resolveTextSearchWithDisambiguation` only accepts one arg) and the spy assertions fail because the function still passes `{title: query, artist: query}` regardless.

- [x] **Step 3: Update the function signature and adapter calls in `resolver.ts:637-747`**

Replace the function signature at line 637:

```ts
// Before:
export async function resolveTextSearchWithDisambiguation(query: string): Promise<TextSearchResult> {

// After:
export async function resolveTextSearchWithDisambiguation(
  query: string,
  structured?: SearchQuery,
  candidateLimit?: number,
): Promise<TextSearchResult> {
```

Replace both adapter-call argument objects in the function body (the two places where `{ title: query, artist: query }` is passed):

- At ~line 647 (inside the `if (adapter.searchTrackWithCandidates)` branch):

```ts
// Before:
const searchResult = await adapter.searchTrackWithCandidates({
  title: query,
  artist: query,
});

// After:
const searchResult = await adapter.searchTrackWithCandidates(
  structured ?? { title: query, artist: query },
);
```

- At ~line 707 (the `searchTrack` fallback):

```ts
// Before:
const result = await adapter.searchTrack({
  title: query,
  artist: query,
});

// After:
const result = await adapter.searchTrack(structured ?? { title: query, artist: query });
```

Replace the slice at line 692:

```ts
// Before:
const candidates: SearchCandidate[] = searchResult.candidates
  .filter((c) => c.confidence >= CANDIDATE_MIN_CONFIDENCE)
  .slice(0, MAX_CANDIDATES)

// After:
const cap = candidateLimit !== undefined
  ? Math.min(MAX_CANDIDATES, Math.max(1, candidateLimit))
  : MAX_CANDIDATES;
const candidates: SearchCandidate[] = searchResult.candidates
  .filter((c) => c.confidence >= CANDIDATE_MIN_CONFIDENCE)
  .slice(0, cap)
```

Add the import at the top of `resolver.ts` (next to existing service-type imports):

```ts
import type { SearchQuery } from "./types.js";
```

(verify it isn't already imported; if it is, skip this line.)

- [x] **Step 4: Run tests to verify they pass**

Run: `npm run test --workspace=apps/backend -- resolver`
Expected: all 5 new tests pass + all existing `describe("resolveTextSearchWithDisambiguation", ...)` tests still pass (backward compat verified by the third new test).

- [x] **Step 5: Run full backend suite**

Run: `npm run test --workspace=apps/backend`
Expected: 881 + 5 = 886 tests pass; 19 skipped unchanged.

- [x] **Step 6: Commit**

```bash
git add apps/backend/src/services/resolver.ts apps/backend/src/__tests__/resolver.test.ts
git commit -m "$(cat <<'EOF'
Refactor: Resolver text search accepts pre-parsed SearchQuery and candidate limit

- `resolveTextSearchWithDisambiguation` signature gains two optional parameters: `structured?: SearchQuery` and `candidateLimit?: number`. Backward-compatible: existing callers (free-text path) continue to pass only the raw query string.
- When `structured` is set, the adapter calls (`searchTrackWithCandidates` and the `searchTrack` fallback) receive the structured query directly instead of `{ title: query, artist: query }`. Free-text adapter behaviour is unchanged.
- `candidateLimit` clamps the disambiguation list at `Math.min(MAX_CANDIDATES, candidateLimit)`. Defaults to `MAX_CANDIDATES` when unset.
- 5 new tests cover: structured pass-through (with and without album), backward-compat, candidateLimit cap below MAX_CANDIDATES, and clamp above MAX_CANDIDATES.
EOF
)"
```

---

### Task 3: Wire structured-search detect-branch into POST `/api/v1/resolve`

**Files:**
- Modify: `apps/backend/src/routes/resolve.ts:113-117` (OpenAPI description string)
- Modify: `apps/backend/src/routes/resolve.ts` (insert detect-branch between line 223 end-of-genre-block and line 225 selectedCandidate-block)

No new tests in this task — the parser is unit-tested (Task 1), the resolver is unit-tested (Task 2), and end-to-end verification happens in Task 7.

- [x] **Step 1: Replace the OpenAPI description at lines 113-117**

```ts
// Before:
description:
  "Accepts one of three query shapes:\n" +
  "1. A streaming-service URL (e.g. `https://open.spotify.com/track/...`) — returns unified cross-service metadata.\n" +
  "2. A free-text query — returns either a resolved match or a disambiguation list (follow up with `selectedCandidate` to complete).\n" +
  "3. A genre-discovery query starting with `genre:` (e.g. `genre: jazz|r&b, tracks: 20, vibe: mixed`) — returns up to three parallel candidate lists (tracks, albums, artists) sourced from Deezer's chart API. Supported fields: `genre` (required, `|` = OR), `tracks`/`albums`/`artists` (1–50), `count` (1–50, shorthand for the same count across all three types; mutually exclusive with the per-type fields), `vibe` (`hot` or `mixed`).",

// After:
description:
  "Accepts four query shapes. Pick the one that matches what the user knows:\n\n" +
  "**1. Streaming-service URL** — e.g. `https://open.spotify.com/track/...`, `https://music.apple.com/...`. Returns unified cross-service metadata. Use when the user already has a link.\n\n" +
  "**2. Free-text query** — any string that is not a URL and does not start with a structured prefix. Returns a resolved match or a disambiguation list (follow up with `selectedCandidate` to pick one). Use when the user only knows roughly what they want.\n\n" +
  "**3. Genre-discovery query** — starts with `genre:`. Two sub-modes:\n" +
  "  - `genre: ?` → browse grid of popular genres (no other fields allowed).\n" +
  "  - `genre: <name>[|<name>...]<, modifier>*` → discovery results. Modifiers: `tracks`/`albums`/`artists` (1–50 each, default 10 of each when none specified), `count` (1–50, sets all three to the same value, mutually exclusive with per-type modifiers), `vibe` (`hot` for top-N, `mixed` for stratified random sample). `|` inside a value is OR.\n" +
  "  - Example: `genre: jazz|r&b, tracks: 20, vibe: mixed`.\n\n" +
  "**4. Structured search query** — starts with `title:`, `artist:`, or `album:`. Returns either a resolved track or a disambiguation list, same outcome as free-text but with adapter-side field operators (Spotify, Deezer, MusicBrainz) for higher precision. Supported fields:\n" +
  "  - `title:` and `artist:` — at least one is required.\n" +
  "  - `album:` — optional, refines the match. Cannot be used alone.\n" +
  "  - `count:` — optional, 1–10, caps the disambiguation list.\n" +
  "  - Examples: `title: The Killing Moon, artist: Echo & The Bunnymen` · `artist: Radiohead` · `title: Karma Police, artist: Radiohead, album: OK Computer, count: 5`.\n\n" +
  "After a disambiguation response, send the picked candidate's id back as `selectedCandidate` to complete the resolve.",
```

- [x] **Step 2: Add the structured-search import alongside the existing genre imports near the top of `routes/resolve.ts`**

Locate the existing `import { isGenreBrowseQuery, isGenreSearchQuery, runGenreBrowse, runGenreSearch, NoGenreSearchAdapterError, GenreQueryParseError } from "../services/genre-search/index.js";` (or however it's currently grouped) and add a sibling line:

```ts
import {
  isStructuredSearchQuery,
  parseStructuredSearchQuery,
  StructuredSearchQueryParseError,
  type ParsedStructuredQuery,
} from "../services/structured-search/index.js";
```

- [x] **Step 3: Insert the new detect-branch between the genre-search block and the `selectedCandidate` block**

Locate the existing `if (selectedCandidate) {` line (currently at `routes/resolve.ts:225`). Immediately before it (after the closing `}` of the `if (query && isGenreSearchQuery(query)) { ... }` block), insert:

```ts
        // Flow 0.5: structured search (`title:`/`artist:`/`album:`). Routes
        // through the existing `resolveTextSearchWithDisambiguation` flow with
        // a parsed `SearchQuery` so adapters can use field operators where
        // supported (Spotify, Deezer, MusicBrainz). Disambiguation is returned
        // as the standard discriminated-union response.
        if (query && isStructuredSearchQuery(query)) {
          let parsed: ParsedStructuredQuery;
          try {
            parsed = parseStructuredSearchQuery(query);
          } catch (err) {
            if (err instanceof StructuredSearchQueryParseError) {
              return reply.status(400).send(jsonError("INVALID_URL", err.message));
            }
            throw err;
          }
          const textResult = await resolveTextSearchWithDisambiguation(
            query,
            parsed.search,
            parsed.candidateLimit,
          );
          if (textResult.kind === "resolved" && textResult.result) {
            return reply.send(await persistTrackAndRespond(textResult.result, origin));
          }
          const disambiguationBody: ResolveDisambiguationResponse = {
            status: "disambiguation",
            candidates: textResult.candidates ?? [],
          };
          return reply.send(disambiguationBody);
        }
```

The disambiguation response is typed `ResolveDisambiguationResponse` and uses `?? []` to mirror the existing free-text disambiguation path at `routes/resolve.ts:308-312` exactly. `ResolveDisambiguationResponse` is already imported at `routes/resolve.ts:55`. `resolveTextSearchWithDisambiguation` is also already imported (line 86 at HEAD `496cd29c`); no new resolver import needed.

- [x] **Step 4: Run typescript check + full backend suite to confirm no regression**

Run: `npm run typecheck --workspace=apps/backend && npm run test --workspace=apps/backend`
Expected: tsc clean; 886 tests pass; 19 skipped unchanged.

- [x] **Step 5: Commit**

```bash
git add apps/backend/src/routes/resolve.ts
git commit -m "$(cat <<'EOF'
Feat: Wire structured-search detect-branch into POST /api/v1/resolve

- New detect-branch between genre-search and selectedCandidate flows: when query starts with title:/artist:/album:, parse it and route through resolveTextSearchWithDisambiguation with the parsed SearchQuery and optional count: cap.
- Parser errors return 400 INVALID_URL with the parser's message (same shape as the genre-search 400 path).
- OpenAPI description rewritten as a four-shape user-facing walkthrough (URL, free text, genre, structured) with examples and "when to use" guidance per shape. Rendered by ReDoc as the canonical API documentation.
EOF
)"
```

---

### Task 4: Wire structured-search detect-branch into GET `/api/v1/resolve`

**Files:**
- Modify: `apps/backend/src/routes/resolve-public-get.ts:68` (description)
- Modify: `apps/backend/src/routes/resolve-public-get.ts:137-150` (free-text else-block becomes a chained if/else-if)

No new tests — same rationale as Task 3.

- [x] **Step 1: Replace the description at line 68**

```ts
// Before:
description:
  "Unauthenticated companion to POST `/api/v1/resolve`, designed for scripting consumers (Apple Shortcuts, curl, bookmarklets). Rate-limited per client IP. Returns a resolved track or errors on ambiguous text searches (no interactive disambiguation over GET).",

// After:
description:
  "Unauthenticated companion to POST `/api/v1/resolve`, designed for scripting consumers (Apple Shortcuts, curl, bookmarklets). Accepts:\n\n" +
  "- **Streaming-service URL** (e.g. `https://open.spotify.com/track/...`)\n" +
  "- **Free-text query** (e.g. `bohemian rhapsody queen`)\n" +
  "- **Structured search query** (e.g. `title: Bohemian Rhapsody, artist: Queen`) — supported fields: `title`, `artist`, `album`, `count` (1–10).\n\n" +
  "Returns the resolved track (200) or 400 if the query is ambiguous, malformed, or cannot be resolved. Rate-limited per client IP.\n\n" +
  "Note: `genre:` discovery queries are not supported on this endpoint — they require the authenticated POST endpoint because their response is a list, not a single resolved track.",
```

- [x] **Step 2: Add the structured-search import at the top of `resolve-public-get.ts`**

```ts
import {
  isStructuredSearchQuery,
  parseStructuredSearchQuery,
  StructuredSearchQueryParseError,
  type ParsedStructuredQuery,
} from "../services/structured-search/index.js";
```

- [x] **Step 3: Insert structured branch into the existing else-block at lines 137-150**

```ts
// Before (the existing else-block):
} else {
  // Flow 2: free-text search. ...
  const textResult = await resolveTextSearchWithDisambiguation(query);
  if (textResult.kind === "resolved" && textResult.result) {
    result = textResult.result;
  } else {
    return reply.status(400).send(jsonError("INVALID_URL", "Could not resolve this query."));
  }
}

// After (chain a structured-search else-if before the free-text branch):
} else if (isStructuredSearchQuery(query)) {
  // Flow 1.5: structured search. Stateless GET cannot disambiguate, so
  // ambiguous results return 400 (same trade-off as the free-text path).
  let parsed: ParsedStructuredQuery;
  try {
    parsed = parseStructuredSearchQuery(query);
  } catch (err) {
    if (err instanceof StructuredSearchQueryParseError) {
      return reply.status(400).send(jsonError("INVALID_URL", err.message));
    }
    throw err;
  }
  const textResult = await resolveTextSearchWithDisambiguation(
    query,
    parsed.search,
    parsed.candidateLimit,
  );
  if (textResult.kind === "resolved" && textResult.result) {
    result = textResult.result;
  } else {
    return reply
      .status(400)
      .send(jsonError("INVALID_URL", "Structured query was ambiguous; use POST endpoint for disambiguation."));
  }
} else {
  // Flow 2: free-text search. ...
  const textResult = await resolveTextSearchWithDisambiguation(query);
  if (textResult.kind === "resolved" && textResult.result) {
    result = textResult.result;
  } else {
    return reply.status(400).send(jsonError("INVALID_URL", "Could not resolve this query."));
  }
}
```

- [x] **Step 4: Run tsc + full suite**

Run: `npm run typecheck --workspace=apps/backend && npm run test --workspace=apps/backend`
Expected: tsc clean; 886 tests pass; 19 skipped unchanged.

- [x] **Step 5: Commit**

```bash
git add apps/backend/src/routes/resolve-public-get.ts
git commit -m "$(cat <<'EOF'
Feat: Wire structured-search detect-branch into GET /api/v1/resolve

- New else-if branch detects title:/artist:/album: queries, parses and routes them through resolveTextSearchWithDisambiguation. Ambiguous results return 400 — stateless GET cannot disambiguate, same trade-off as free-text.
- Description rewritten as a bulleted enumeration of all four accepted shapes with examples.
EOF
)"
```

---

### Task 5: Extend Deezer and Apple Music adapters to use the `album` field (TDD)

Spotify and MusicBrainz already include `album:` in their q-strings. Deezer and Apple Music do not — when `query.album` is set today, it is silently dropped. This task wires it through.

**Files:**
- Modify: `apps/backend/src/services/plugins/deezer/adapter.ts:246` (`searchTrack` q-string) and `:303` (`searchTrackWithCandidates` q-string)
- Modify: `apps/backend/src/services/plugins/apple-music/adapter.ts:588` (`searchTrack` term)
- Modify: `apps/backend/src/services/plugins/deezer/__tests__/deezer.test.ts` (extend with album test)
- Create: `apps/backend/src/services/plugins/apple-music/__tests__/apple-music.test.ts` (new test file — none exists today)

- [x] **Step 1: Append failing tests to `deezer/__tests__/deezer.test.ts`**

Two new tests, one per code path. Append the first inside the existing `describe("Deezer: searchTrack", ...)` block (starts at line 228) before its closing `});`:

```ts
  it("includes album: operator in q-string when query.album is provided", async () => {
    vi.mocked(fetchWithTimeout).mockResolvedValue(
      jsonResponse({
        data: [
          {
            id: 100,
            title: "Karma Police",
            duration: 261,
            link: "https://www.deezer.com/track/100",
            artist: { id: 1, name: "Radiohead" },
            album: { id: 10, title: "OK Computer", cover_medium: "https://cdn/cover.jpg" },
            isrc: "GBAYE9700001",
          },
        ],
      }),
    );

    await deezerAdapter.searchTrack({
      title: "Karma Police",
      artist: "Radiohead",
      album: "OK Computer",
    });

    const calledUrl = vi.mocked(fetchWithTimeout).mock.calls[0][0] as string;
    expect(calledUrl).toContain('artist:%22Radiohead%22');
    expect(calledUrl).toContain('track:%22Karma%20Police%22');
    expect(calledUrl).toContain('album:%22OK%20Computer%22');
  });
```

Append the second inside the existing `describe("Deezer: searchTrackWithCandidates", ...)` block (starts at line 332) before its closing `});`:

```ts
  it("includes album: operator in q-string when query.album is provided", async () => {
    vi.mocked(fetchWithTimeout).mockResolvedValue(
      jsonResponse({
        data: [
          {
            id: 100,
            title: "Karma Police",
            duration: 261,
            link: "https://www.deezer.com/track/100",
            artist: { id: 1, name: "Radiohead" },
            album: { id: 10, title: "OK Computer", cover_medium: "https://cdn/cover.jpg" },
            isrc: "GBAYE9700001",
          },
        ],
      }),
    );

    await deezerAdapter.searchTrackWithCandidates!({
      title: "Karma Police",
      artist: "Radiohead",
      album: "OK Computer",
    });

    const calledUrl = vi.mocked(fetchWithTimeout).mock.calls[0][0] as string;
    expect(calledUrl).toContain('album:%22OK%20Computer%22');
  });
```

(`jsonResponse`, `deezerAdapter`, and the `vi.mock("..../fetch.js", …)` setup are already in `deezer.test.ts` — reuse them; do not redefine.)

- [x] **Step 2: Run to verify failure**

Run: `npm run test --workspace=apps/backend -- deezer`
Expected: FAIL — current q-string does not include `album:` operator.

- [x] **Step 3: Update Deezer q-string in both `searchTrack` (line 246) and `searchTrackWithCandidates` (line 303)**

Both methods currently build q the same way:

```ts
// Before:
const q = query.title === query.artist ? query.title : `artist:"${query.artist}" track:"${query.title}"`;

// After:
const q = query.title === query.artist
  ? query.title
  : query.album
    ? `artist:"${query.artist}" track:"${query.title}" album:"${query.album}"`
    : `artist:"${query.artist}" track:"${query.title}"`;
```

Apply identically to both call sites (`adapter.ts:246` and `:303`).

- [x] **Step 4: Run Deezer tests pass**

Run: `npm run test --workspace=apps/backend -- deezer`
Expected: PASS — new album test passes; existing tests unchanged.

- [x] **Step 5: Create new Apple Music test file**

```ts
// apps/backend/src/services/plugins/apple-music/__tests__/apple-music.test.ts
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../../../lib/fetch.js", () => ({
  fetchWithTimeout: vi.fn(),
}));

import { fetchWithTimeout } from "../../../../lib/fetch.js";
import { appleMusicAdapter } from "../adapter.js";

function jsonResponse(body: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: () => Promise.resolve(body),
    text: () => Promise.resolve(JSON.stringify(body)),
    headers: new Headers(),
  } as unknown as Response;
}

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("Apple Music adapter — searchTrack", () => {
  it("includes album in the term when query.album is provided", async () => {
    vi.mocked(fetchWithTimeout).mockResolvedValue(
      jsonResponse({ results: { songs: { data: [] } } }),
    );

    await appleMusicAdapter.searchTrack({
      title: "Karma Police",
      artist: "Radiohead",
      album: "OK Computer",
    });

    const calledUrl = vi.mocked(fetchWithTimeout).mock.calls[0][0] as string;
    expect(calledUrl).toContain("Radiohead");
    expect(calledUrl).toContain("Karma");
    expect(calledUrl).toContain("OK"); // OK Computer
  });

  it("omits album from term when query.album is not set", async () => {
    vi.mocked(fetchWithTimeout).mockResolvedValue(
      jsonResponse({ results: { songs: { data: [] } } }),
    );

    await appleMusicAdapter.searchTrack({ title: "Karma Police", artist: "Radiohead" });

    const calledUrl = vi.mocked(fetchWithTimeout).mock.calls[0][0] as string;
    expect(calledUrl).toContain("Radiohead");
    expect(calledUrl).toContain("Karma");
    expect(calledUrl).not.toContain("OK%20Computer");
  });
});
```

- [x] **Step 6: Run to verify Apple Music test fails**

Run: `npm run test --workspace=apps/backend -- apple-music`
Expected: FAIL — first test fails because album is not in the term.

- [x] **Step 7: Update Apple Music `searchTrack` term at line 588**

```ts
// Before:
const term = encodeURIComponent(`${query.artist} ${query.title}`);

// After:
const term = encodeURIComponent(
  query.album ? `${query.artist} ${query.title} ${query.album}` : `${query.artist} ${query.title}`,
);
```

- [x] **Step 8: Run Apple Music tests pass**

Run: `npm run test --workspace=apps/backend -- apple-music`
Expected: PASS — both tests green.

- [x] **Step 9: Run full backend suite**

Run: `npm run test --workspace=apps/backend`
Expected: 886 + 4 = 890 tests pass; 19 skipped unchanged.

- [x] **Step 10: Commit**

```bash
git add apps/backend/src/services/plugins/deezer/adapter.ts \
        apps/backend/src/services/plugins/deezer/__tests__/deezer.test.ts \
        apps/backend/src/services/plugins/apple-music/adapter.ts \
        apps/backend/src/services/plugins/apple-music/__tests__/apple-music.test.ts
git commit -m "$(cat <<'EOF'
Feat: Pass album field through Deezer and Apple Music track search

- Deezer searchTrack and searchTrackWithCandidates: when query.album is set, append `album:"…"` to the existing `artist:"…" track:"…"` operator string. Free-text path (title === artist) is unchanged.
- Apple Music searchTrack: when query.album is set, append it to the search term. Apple Music's catalog search has no field operators, so this widens the term and lets the score-based candidate picker do the rest.
- 2 new Deezer tests (album: operator in both searchTrack and searchTrackWithCandidates) and 2 new Apple Music tests (with and without album in term).
EOF
)"
```

---

### Task 6: Bilingual user-facing documentation in `docs/resolve-flow/{de,en}/resolve-flow.tex` + VERSION bump

**Files:**
- Modify: `docs/resolve-flow/de/resolve-flow.tex` — add new section "Strukturierte Suche" + cross-reference paragraph in existing "Genre-Discovery" section
- Modify: `docs/resolve-flow/en/resolve-flow.tex` — add new section "Structured search" + cross-reference paragraph in existing "Genre-Discovery" section
- Modify: `docs/resolve-flow/VERSION` — bump from `1.0.0` to `1.1.0`

No tests; verification is the LaTeX build at the end.

- [x] **Step 1: Add the new top-level section "Strukturierte Suche" to `de/resolve-flow.tex`**

Insert directly **after** the existing `\section{Genre-Discovery}` block (which ends around line 692 in the current file — `wc -l` shows 961 total). The new section reads as user-oriented prose, written in the same voice as the surrounding chapter.

```latex
\section{Strukturierte Suche}

\subsection{Wozu}

Wenn Sie einen Track im Kopf haben und genau wissen, wer ihn gemacht hat, ist die strukturierte Suche oft präziser als die Freitext-Suche. Statt einen langen Text zu raten, sagen Sie der Resolver-Pipeline direkt, was der Titel ist, wer der Künstler ist, und (optional) auf welchem Album der Track erschienen ist. Die Adapter, die das unterstützen (Spotify, Deezer, MusicBrainz), nutzen dann ihre eigenen Feld-Operatoren und liefern ein deutlich genaueres Ergebnis.

\subsection{Form}

Die strukturierte Suche beginnt mit einem von drei Schlüsseln: \texttt{title:}, \texttt{artist:} oder \texttt{album:}. Felder werden mit Komma getrennt, Schlüssel sind klein- oder grossgeschrieben (egal), Leerzeichen um \texttt{:} und \texttt{,} werden ignoriert. Mindestens \texttt{title:} oder \texttt{artist:} muss gesetzt sein --- \texttt{album:} alleine ist zu schwach für die Track-Suche und wird abgelehnt.

Optional kann \texttt{count:} (1--10) gesetzt werden, um die Liste der Disambiguation-Vorschläge zu begrenzen.

\subsection{Beispiele}

\begin{itemize}
  \item \texttt{title: The Killing Moon, artist: Echo \& The Bunnymen} --- der klassische Fall: Titel und Künstler bekannt.
  \item \texttt{artist: Radiohead} --- nur der Künstler bekannt; das System liefert eine Auswahlliste der bekanntesten Radiohead-Tracks.
  \item \texttt{title: Karma Police, artist: Radiohead, album: OK Computer, count: 5} --- alle drei Felder gesetzt, maximal 5 Vorschläge.
  \item \texttt{title: Bohemian Rhapsody} --- nur Titel; bei genug Eindeutigkeit direkt ein Track, sonst eine Vorschlagsliste.
\end{itemize}

\subsection{Was kommt zurück}

Genau wie bei der Freitext-Suche: entweder ein einzelner aufgelöster Track (wenn die Confidence hoch genug ist, siehe \enquote{Konfidenz-Schwellwerte}), oder eine Disambiguation-Liste mit bis zu \texttt{count} Vorschlägen (sonst maximal \texttt{MAX\_CANDIDATES}, also acht). Über \texttt{selectedCandidate} schliessen Sie den zweiten Schritt ab und landen auf der Share-Seite.

\subsection{Was nicht erlaubt ist}

Schlüssel aus der Genre-Discovery (\texttt{genre:}, \texttt{tracks:}, \texttt{albums:}, \texttt{artists:}, \texttt{vibe:}) sind hier ausdrücklich verboten und führen zu einer 400-Antwort mit einer Fehlermeldung, die auf die richtige Anfrageform hinweist. Das hält die beiden Modi sauber getrennt: strukturierte Suche ist Resolver-Modus (ein Track), Genre-Discovery ist Browse-Modus (eine Liste zum Stöbern).
```

- [x] **Step 2: Add a cross-reference paragraph at the top of the existing "Genre-Discovery" section in `de/resolve-flow.tex`**

Locate `\section{Genre-Discovery}` (line 579 in the current file). Immediately after the `\section{...}` line and before the existing first paragraph, insert:

```latex
\noindent\textit{Wenn Sie nach einem konkreten Track suchen, schauen Sie in \enquote{Strukturierte Suche}. Hier geht es um Stöbern nach Genre.}\par\medskip
```

- [x] **Step 3: Add the new section "Structured search" to `en/resolve-flow.tex`**

Mirror Step 1 in English. Insert after the existing `\section{Genre-Discovery}` block (which ends around line 656 in the current 917-line file).

```latex
\section{Structured search}

\subsection{What it's for}

When the user has a specific track in mind and knows the artist, structured search is more precise than free text. Instead of asking the resolver to guess from a single string, you hand it the title, the artist, and optionally the album as separate fields. The adapters that support field operators (Spotify, Deezer, MusicBrainz) use them; the others fall back to a richer concatenated term.

\subsection{Form}

A structured query starts with one of three keys: \texttt{title:}, \texttt{artist:}, or \texttt{album:}. Fields are comma-separated, keys are case-insensitive, and whitespace around \texttt{:} and \texttt{,} is collapsed. At least one of \texttt{title:} or \texttt{artist:} must be present --- \texttt{album:} alone is too weak to drive a track search reliably and is rejected.

The optional \texttt{count:} modifier (1--10) caps the disambiguation candidate list.

\subsection{Examples}

\begin{itemize}
  \item \texttt{title: The Killing Moon, artist: Echo \& The Bunnymen} --- the classic case: title and artist both known.
  \item \texttt{artist: Radiohead} --- artist only; the system returns a disambiguation list of well-known Radiohead tracks.
  \item \texttt{title: Karma Police, artist: Radiohead, album: OK Computer, count: 5} --- all three fields set, list capped at 5.
  \item \texttt{title: Bohemian Rhapsody} --- title only; resolves directly when confident, otherwise returns candidates.
\end{itemize}

\subsection{What comes back}

The same response shapes as free text: either a single resolved track (when confidence clears the threshold described in \enquote{Confidence thresholds}) or a disambiguation list with up to \texttt{count} candidates (otherwise capped at \texttt{MAX\_CANDIDATES}, currently eight). Send the picked candidate back as \texttt{selectedCandidate} to land on the share page.

\subsection{What's not allowed}

Keys that belong to genre-discovery (\texttt{genre:}, \texttt{tracks:}, \texttt{albums:}, \texttt{artists:}, \texttt{vibe:}) are explicitly rejected here with a 400 response and a directive error message pointing to the right query shape. This keeps the two modes cleanly separated: structured search is resolver mode (one track), genre-discovery is browse mode (a list to look through).
```

- [x] **Step 4: Add the cross-reference paragraph at the top of the existing "Genre-Discovery" section in `en/resolve-flow.tex`**

Locate `\section{Genre-Discovery}` (line 552 in the current EN file). Insert after that line and before the first paragraph:

```latex
\noindent\textit{If you are searching for a specific track, see \enquote{Structured search}. This section is about browsing by genre.}\par\medskip
```

- [x] **Step 5: Bump VERSION**

```bash
echo "1.1.0" > docs/resolve-flow/VERSION
```

- [x] **Step 6: Build both PDFs and verify**

Run: `make docs`
Expected: success messages for both `docs-de` and `docs-en`; new files at `docs/resolve-flow/de/resolve-flow.pdf` and `docs/resolve-flow/en/resolve-flow.pdf`. If `xelatex` is missing, install via the hint at `Makefile:93` (`brew install --cask basictex`).

Manual eye-check: open both PDFs, confirm the new section is present and reads cleanly, and the cross-reference paragraph is visible at the top of the Genre-Discovery chapter.

- [x] **Step 7: Verify bilingual section parity**

Run: `diff <(grep -c '^\\section' docs/resolve-flow/de/resolve-flow.tex) <(grep -c '^\\section' docs/resolve-flow/en/resolve-flow.tex)`
Expected: empty output (counts match).

- [x] **Step 8: Commit**

```bash
git add docs/resolve-flow/de/resolve-flow.tex \
        docs/resolve-flow/en/resolve-flow.tex \
        docs/resolve-flow/VERSION \
        docs/resolve-flow/de/resolve-flow.pdf \
        docs/resolve-flow/en/resolve-flow.pdf
git commit -m "$(cat <<'EOF'
Docs: Add Structured Search chapter to bilingual resolver-flow doc

- New top-level section in both DE and EN parallel to "Genre-Discovery", written from the user's perspective: when to use, syntax, examples, return shape, what's not allowed (with cross-reference back to genre-discovery).
- Cross-reference paragraph added at the top of the existing Genre-Discovery section in both languages so users browsing for "find a specific track" land in the right chapter.
- VERSION bumped to 1.1.0.
- Rebuilt both PDFs via `make docs`.
EOF
)"
```

---

### Task 7: Production verification

**Files:** none (verification only).

After Tasks 1-6 are merged and deployed, exercise every shape in production. The Verification block above (items 1-15) is the canonical checklist; this task is its execution.

- [x] **Step 1: Wait for the deploy pipeline to finish**

Watch the Zerops dashboard until the new commits are live. Confirm in the container logs:

```
[DB] Running migrations from <path>/migrations/postgres
[DB] All migrations applied successfully
```

(No new migrations in this plan, so this is just a sanity check that the deploy succeeded.)

- [x] **Step 2: Walk through the full Verification block**

Run items 1-15 from the Verification section. For each, record observed vs. expected. Items that pass do not need to be quoted in the commit; items that fail block the rollout.

- [x] **Step 3: Move plan to `done/` and update SESSION.md**

```bash
git mv .claude/plans/open/2026-04-27-structured-track-search.md \
       .claude/plans/done/2026-05-01-structured-track-search.md
```

(Note: the date in the filename is the completion date, per project convention. The file is added to `done/` with today's date because git history preserves the original write date.)

Add a `## Completed` section at the bottom of the plan file with the verification timestamp + observed-behavior summary, then commit.

---

## Verification

End-to-end:

1. Start backend (`cd apps/backend && npm run dev`) and frontend.
2. Submit `title: The Killing Moon, artist: Echo & The Bunnymen` via POST → resolved track or disambiguation list. Confirm in backend log that the Spotify adapter receives `{title: "The Killing Moon", artist: "Echo & The Bunnymen"}` (not duplicated free-text).
3. Submit `title: Bohemian Rhapsody` via POST → resolved (title-only path).
4. Submit `artist: Radiohead` via POST → disambiguation list of Radiohead tracks.
5. Submit `title: Karma Police, artist: Radiohead, count: 3` via POST → at most 3 candidates in disambiguation (or auto-resolved if confidence high).
6. Submit `title: X, artist: Y, foo: bar` via POST → 400 with `"Unknown field 'foo'. Allowed: title, artist, album, count"`.
7. Submit `title: X, tracks: 5` via POST → 400 with `"'tracks' is only valid in genre: queries. Allowed here: title, artist, album, count"`.
8. Submit `title: , artist: Y` via POST → 400 with parser message about missing value.
9. Submit `count: 5` via POST (no title/artist) → 400 with `"Structured query needs at least one of: title, artist"`.
10. Submit `count: 0` via POST → 400 (parser range check).
11. GET endpoint structured: `curl 'http://localhost:3000/api/v1/resolve?query=title:%20Bohemian%20Rhapsody'` → 200 if confident match; 400 if ambiguous.
12. Genre query unaffected: POST `genre: jazz, tracks: 20` still returns the existing genre-search response.
13. **ReDoc rendering check** — open the running backend's ReDoc page (typically `/api/docs` or equivalent), expand the POST `/api/v1/resolve` and GET `/api/v1/resolve` operations, confirm both descriptions list all four query shapes with examples, and that the `genre:`-modifier table reads cleanly. No raw markdown, no escaped `\n`s leaking through.
14. **LaTeX build check** — `make docs` (or the project's documented LaTeX build per `docs/resolve-flow/README.md`) produces both `de/resolve-flow.pdf` and `en/resolve-flow.pdf` without errors. Open both PDFs, confirm the new "Strukturierte Suche" / "Structured search" section is present, contains the user-facing description with examples, and that the existing "Genre-Discovery" cross-reference paragraph is in place.
15. **Bilingual parity check** — section count, ordering, and topic match between `de/resolve-flow.tex` and `en/resolve-flow.tex`. Run `grep -c '^\\section' docs/resolve-flow/de/resolve-flow.tex` vs. `en/`; counts must match.

Unit tests: `npm run test --workspace=apps/backend -- structured-search` (analog to `npm run test --workspace=apps/backend -- genre-search/parser`).

Backend suite: must stay green (currently 852/852 passing, 19 skipped).

## Verified facts

Re-verified 2026-05-01 against current HEAD `6dc1178d`:

- `resolveTextSearch` at `apps/backend/src/services/resolver.ts:580` (function start, signature `(query: string): Promise<ResolutionResult>`).
- `resolveTextSearchWithDisambiguation` at `apps/backend/src/services/resolver.ts:637` (function start, signature `(query: string): Promise<TextSearchResult>`).
- `MAX_CANDIDATES` import at `apps/backend/src/services/resolver.ts:129`, applied at line 692 via `.slice(0, MAX_CANDIDATES)`.
- `AUTO_SELECT_THRESHOLD` and `CANDIDATE_MIN_CONFIDENCE` thresholds at resolver.ts:125-126.
- `SearchQuery` interface at `apps/backend/src/services/types.ts:234` (`{ title: string; artist: string; album?: string }`).
- `resolveTextSearch` callers (grep): only `apps/backend/src/services/resolver.ts:436` and `:447`, both inside `resolveQuery` which is a URL-flow function. No route layer reaches `resolveTextSearch` for free-text or structured input.
- POST resolve routing: `isGenreBrowseQuery` branch at `routes/resolve.ts:194`, `isGenreSearchQuery` branch at `:206`, `selectedCandidate` branch at `:225`, URL branch at `:233`. Insert structured branch between `:223` (end of genre-search block) and `:225`.
- POST resolve OpenAPI description block at `routes/resolve.ts:113-117`.
- POST resolve genre-error 400 line at `routes/resolve.ts:212` (shape reference for our 400 path).
- GET resolve description at `routes/resolve-public-get.ts:68`.
- GET resolve free-text dispatcher at `routes/resolve-public-get.ts:137-150` (`resolveTextSearchWithDisambiguation(query)` call at `:145`).
- `isGenreSearchQuery` at `apps/backend/src/services/genre-search/index.ts:110`.
- `isGenreBrowseQuery` at `apps/backend/src/services/genre-search/index.ts:54`.
- `runGenreSearch`, `runGenreBrowse`, `parseGenreQuery`, `GenreQueryParseError`, `NoGenreSearchAdapterError` exports from `services/genre-search/index.ts:38-48`.
- Genre parser body at `apps/backend/src/services/genre-search/parser.ts`, full file 1-245. Functions: `parseGenreQuery` at line 103, `parsePositiveInteger` at line 233. Auto-comma regex at line 78. `VALID_KEYS` constant at line 61.
- Spotify adapter `searchTrack` and `searchTrackWithCandidates` at `services/plugins/spotify/adapter.ts:250` and `:304`. Both build q-string with `track:`, `artist:`, `album:` operators (lines 257-262, 316-321). `SearchQuery` shape `{ title, artist, album? }` already accepted.
- Deezer adapter `searchTrack` and `searchTrackWithCandidates` at `services/plugins/deezer/adapter.ts:245` and `:302`. Both use `artist:"…" track:"…"` operator syntax (lines 246, 303). **Action item for plan execution:** extend Deezer to also include `album:"…"` when `query.album` is present.
- MusicBrainz adapter `searchTrack` at `services/plugins/musicbrainz/adapter.ts:279` (delegates to `searchTrackWithCandidates`). Uses Lucene `recording:`, `artist:`, `release:` operators per code inspection.
- Apple Music adapter `searchTrack` at `services/plugins/apple-music/adapter.ts:587`. Flat term: `${query.artist} ${query.title}`. **Action item for plan execution:** extend to include `${query.album}` when present.
- Apple Music search API does not support field operators (verified against [docs](https://developer.apple.com/documentation/applemusicapi/search-for-catalog-resources)) — flat-term is correct.
- All other 17 adapters (Tidal, KKBOX, JioSaavn, Napster, NetEase, Qobuz, YouTube, Audius, Audiomack, Bandcamp, Beatport, Boomplay, Bugs, Melon, Pandora, QQMusic, SoundCloud) use flat term `${artist} ${title}` per inventory; album passes through harmlessly when concatenated.
- `MATCH_MIN_CONFIDENCE`, `MAX_CANDIDATES`, `AUTO_SELECT_THRESHOLD`, `CANDIDATE_MIN_CONFIDENCE` are exported from a shared constants module imported at resolver.ts:125-129. Numeric values not re-quoted here; relevant fact is that `MAX_CANDIDATES` is the upper bound `count:` clamps to.

## Decisions

- **Resolver mode only** (decision 2026-05-01) — no discovery, no listing semantics. `artist: Radiohead` alone produces a disambiguation list, which the user picks from to land on a share page.
- **Tier 1 fields only** (decision 2026-05-01) — `title`, `artist`, `album`. `year:` was floated by the user but withdrawn after research showed it requires either a Spotify-only path or a post-filter layer.
- **`count:` modifier accepted** (decision 2026-05-01) — capped at `MAX_CANDIDATES` server-side, validated 1-10 in parser. Other genre-search-specific modifiers (`tracks:`, `albums:`, `artists:`, `vibe:`) explicitly rejected with a directive error message that points to the genre-search query shape.
- **`resolveTextSearch` not modified** (decision 2026-05-01) — caller analysis showed it is unreachable from structured queries; modifying it would be dead-code work.
- **`SearchQuery` interface not extended** (decision 2026-05-01) — already matches Tier 1 exactly.
- **Existing on-hold plan superseded in-place** (decision 2026-05-01) — file kept under same date/name to preserve git history; status flag flipped from on-hold to approved.
- **User-facing documentation in scope** (decision 2026-05-01) — both the OpenAPI descriptions (rendered via ReDoc as the canonical API documentation) and the bilingual resolver-flow LaTeX (`docs/resolve-flow/{de,en}/resolve-flow.tex`) are part of this plan, not a follow-up. The complete query-shape catalog — URL, free text, genre browse, genre search, structured search, selectedCandidate follow-up — must be readable from a user's perspective in both surfaces, with examples and "when to use" guidance for each shape. Driver: user requirement 2026-05-01 ("Anwendersicht, damit der genau sieht und versteht, was alles möglich ist").
- **DE doc terminology — English technical terms allowed** (decision 2026-05-01, post-execution) — established English terms in DE technical documentation are valid; do not force-translate. User wording: "Es muss nicht alles auf Biegen und Brechen ins Deutsche übersetzt werden." Concrete substitutions applied to `docs/resolve-flow/de/resolve-flow.tex`: `Notlösung` → `Fallback`; `Anfragekörper` → `Request-Body`; `Disambiguierung` → `Auswahlliste` (singular acts: `Auswahl`); `Konfidenz` → `Confidence`. EN doc was already idiomatic and untouched. Saved as memory `feedback_de_tech_anglizismen_ok.md` for future doc work.
- **Dispatcher section + overview diagram updated** (decision 2026-05-01, post-execution) — the existing dispatcher-section text and the d2 source for `00-overview.d2` claimed five routing exits before this feature. Updated both to six and added the structured-search node + edge in DE and EN. Was a plan omission caught during final review; bundled into the Task 6 commit.
- **Implementation discipline — extract `buildDeezerQ` helper** (decision 2026-05-01, post-execution) — code-quality review identified a DRY violation when the Task 5 spec applied the album conditional verbatim at two Deezer call sites. Extracted helper in `services/plugins/deezer/adapter.ts:182-186`; both sites call `buildDeezerQ(query)`. Apple Music `searchTrack` parameter likewise re-typed from inline struct to named `SearchQuery` for interface-contract clarity.

## Implementation notes (post-execution)

The plan was executed via subagent-driven workflow. Each task ran through implementer + spec-reviewer + code-quality-reviewer cycles, with several amend iterations. Drifts between the plan's pre-execution snippets and the final committed code were resolved in favour of the actual repo state — the canonical reference for what shipped is `git log 6dc1178d..72ee9fb4`. Notable drifts that future readers should be aware of:

- **Test counts:** plan said 30 parser tests / 882 total backend; actual is 29 parser / 890 final (counting Tasks 1+2+5 additions). Plan arithmetic was incorrect (8+8+13 = 29, not 30).
- **Deezer test mock pattern:** plan example used `vi.mock("..../fetch.js")` with a `jsonResponse` helper; actual existing pattern in `deezer.test.ts` is `vi.spyOn(globalThis, "fetch")` with `new Response(JSON.stringify(...), {...})`. Implementer correctly matched the existing pattern.
- **Apple Music fetch mock path:** plan said `lib/fetch.js`; actual is `lib/infra/fetch.js`.
- **URL encoding in Deezer test assertions:** plan showed `artist:%22…%22`; actual `encodeURIComponent` produces `artist%3A%22…%22` (`:` → `%3A`).
- **Apple Music searchTrack signature:** plan kept the pre-existing inline struct annotation; final state uses `SearchQuery` named type for interface consistency. Spotify and YouTube adapters still use inline structs — left as out-of-scope cleanup.
- **GET endpoint description bullet for genre-discovery:** plan listed it; the GET route does not actually handle `genre:` queries. Removed the bullet, added a clarifying note that genre queries require the POST endpoint.
- **`tsc` script name:** plan invocations used `tsc -- --noEmit`; the actual workspace script is `typecheck`. Plan was patched in-place to use `npm run typecheck`.
- **Plan-snippet drift not all back-patched:** Task 5's inline ternary snippets in Step 3 are now visually dated (the implementation extracted `buildDeezerQ`). The plan-snippets are intent-at-write-time; the final code is the source of truth. Where drift mattered for re-execution, the plan was patched (e.g. test counts, GET description, tsc command); where it was purely retrospective, the snippets were left alone.

The full per-iteration history (which Important and Minor issues each code-quality reviewer raised, what the implementer did to address them) is available in the conversation transcript that produced this plan execution.

## Open questions

None.

## Plan checklist

- [x] All code references verified (functions, scripts, paths, env vars, package-manager commands)
- [x] Tests pass before each commit (every Task implementer ran the relevant test slice; reviewer subagents re-verified)
- [x] Backend suite stays green (852/852 → 890/890, 19 skipped unchanged)
- [x] Bilingual LaTeX rebuild + section parity check (12 = 12 sections after Task 6)
- [x] Pushed to `origin/main` 2026-05-01 / 2026-05-02 — 11 commits `5f2d2d97..a6b1246c` across multiple pushes (initial 6, plus lint-fix, plus 4 docs follow-up commits)
- [x] Production verification completed 2026-05-02 — 4 browser-driven test cases against `https://musiccloud.io/`, all green; ReDoc + LaTeX-PDF + bilingual-parity verified during implementer workflow
- [x] Plan moved to `.claude/plans/done/` with `## Completed` summary

## Completed

**2026-05-02T00:30Z** — Implementation shipped to `origin/main`, deployed via Zerops, verified end-to-end against `https://musiccloud.io/`.

### Commits (11 on `main`, base `6dc1178d`, head `a6b1246c`)

```
a6b1246c  Docs: Link bilingual resolver-flow PDF from OpenAPI descriptions
229f7b99  Docs: Push page-6 figure further down for breathing room
fd059835  Docs: Page-6 layout adjustment + dangling-reference cleanup
1943e3bd  Docs: User-facing prose pass on resolver-flow doc
d2f19786  Chore: Apply biome format fixes for structured-search code
72ee9fb4  Docs: Add Structured Search chapter to bilingual resolver-flow doc
3035a5d6  Feat: Pass album field through Deezer and Apple Music track search
a99ae0c7  Feat: Wire structured-search detect-branch into GET /api/v1/resolve
0797f14f  Feat: Wire structured-search detect-branch into POST /api/v1/resolve
496cd29c  Refactor: Resolver text search accepts pre-parsed SearchQuery and candidate limit
5f2d2d97  Feat: Add structured-search parser, detector, and index
```

### Production verification (browser-driven against `https://musiccloud.io/`)

| # | Query | Outcome |
|---|---|---|
| 1 | `title: Bohemian Rhapsody, artist: Queen` | 8-candidate disambiguation list (all 8 are Queen/Bohemian-Rhapsody variants — no fuzzy mismatch). Confirms Spotify/Deezer field operators correctly receive the parsed `SearchQuery`. `MAX_CANDIDATES = 8` cap honoured. |
| 2 | `artist: Radiohead` | 8-candidate disambiguation of Radiohead top tracks (Creep, High and Dry, Karma Police, …). Adapters correctly handle `{title: "", artist: "Radiohead"}`. |
| 3 | `title: foo, tracks: 5` | 400 INVALID_URL with the directive parser message rendered to the user: `'tracks' is only valid in genre: queries. Allowed here: title, artist, album, count`. Frontend surfaces the message verbatim. |
| 4 | `genre: jazz, tracks: 5` (regression) | Existing genre-discovery branch unchanged — 5 jazz tracks (Sade, Chet Baker, Amy Winehouse, Frank Sinatra, Dave Brubeck Quartet). |

Backend test suite: 890/890 (19 skipped). Typecheck clean. CI green on every push (one Biome-lint failure on the initial 6-commit push, fixed in `d2f19786`; CI green from there forward).

ReDoc rendering and bilingual LaTeX (`docs/resolve-flow/{de,en}/resolve-flow.tex`) were verified locally during the implementer workflow — both PDFs build via `make docs`, section parity 12 = 12.

### Plan ↔ implementation drifts (resolved during execution)

The plan was patched in-place each time a drift surfaced. Notable items, in execution order:

- Test counts: plan arithmetic said `8+8+14=30` parser tests; correct count is 29 (13 error-path tests, not 14). Plan numbers patched.
- POST disambiguation response: plan had a one-line inline literal; production code uses the typed `ResolveDisambiguationResponse` with `?? []` fallback for parity with the free-text path.
- GET endpoint description listed `genre:` as a supported shape — but the GET route has no genre branch. Bullet removed; clarifying note added.
- Plan referenced `tsc -- --noEmit`; the actual workspace script is `typecheck`. Plan patched.
- Deezer test mock pattern: plan example used `vi.mock + jsonResponse helper`; the existing deezer test file uses `vi.spyOn(globalThis, "fetch")`. Implementer matched the existing pattern.
- Apple Music fetch mock path: plan said `lib/fetch.js`; actual is `lib/infra/fetch.js`.
- URL encoding in Deezer tests: plan showed `artist:%22…%22`; `encodeURIComponent` produces `artist%3A%22…%22`. Tests use the correct form.
- Apple Music `searchTrack` parameter type: kept inline struct in plan; refactored to named `SearchQuery` for interface contract clarity.
- DRY: plan's two Deezer call sites had the same nested-ternary q-string; extracted `buildDeezerQ` helper.
- Dispatcher section + `00-overview.d2`: said "five outcomes / five exits"; updated to six and added the structured-search node + edge in both DE and EN. Was a plan omission caught during final review.
- DE doc terminology: user feedback during execution swept several forced translations back to English where the term is established in DE tech writing — `Notlösung → Fallback`, `Anfragekörper → Request-Body`, `Disambiguierung → Auswahlliste`, `Konfidenz → Confidence`, `Zeitschranke → Timeout`. Saved as memory `feedback_de_tech_anglizismen_ok.md`.
- DE doc content: removed historical references ("Seit der Umstellung der Cache-Architektur…") in favour of IST-Zustand only. Removed plugin-enable/disable internals leaks — the doc must not describe admin/config behaviour. Added the WHY for Spotify being at the end of the resolver chain (stricter API quota). All saved as additional bullets in memory `project_docs_transparency_only.md`.
- Page-6 layout (DE PDF): manual layout adjustment to push `\section{Der Weg einer URL}` (4) and `\subsection{Aufräumen der URL}` (4.1) up to page 5, with the dispatcher overview figure stretched to 0.65 textheight on page 6 and a `\vspace{2\baselineskip}` before the figure for breathing room.
- HTTP error codes: converted from inline sentence to a 2-column table in both DE and EN.
- Architecture realisation during prod-verify: GET `/api/v1/resolve` is not externally reachable — the Astro frontend only forwards POST `/api/resolve` to the backend. Verification items 1-12 from this plan were therefore exercised through the SPA hero-input (POST flow) rather than direct curl against the GET endpoint. The GET endpoint itself works at the backend layer (covered by the parser/resolver unit tests) but is not externally testable as written in the original plan. Production-Verification documented here as the actual outcome.
- **Post-completion enhancement** (commit `a6b1246c`, 2026-05-02): user requested adding a link to the bilingual resolver-flow PDF (DE + EN) from both OpenAPI descriptions (POST `/api/v1/resolve` and GET `/api/v1/resolve`). Markdown-formatted hyperlinks at the end of each description string, rendered by ReDoc. Was not in the original plan; added on user request after production verification was complete. No logic change.

### Decisions captured during execution

User-language preferences for DE technical documentation are now in memory `feedback_de_tech_anglizismen_ok.md` (English tech terms allowed when established in DE; never force-translate `Disambiguation` to `Disambiguierung`).

Doc-style preferences (IST-only, no internals leaks, no historical-marker phrasing) are now in memory `project_docs_transparency_only.md` (extended).

PDF cross-linking from OpenAPI: bilingual resolver-flow PDFs ([DE](https://github.com/phranck/musiccloud/blob/main/docs/resolve-flow/de/resolve-flow.pdf), [EN](https://github.com/phranck/musiccloud/blob/main/docs/resolve-flow/en/resolve-flow.pdf)) linked from both OpenAPI endpoint descriptions. ReDoc renders markdown links in description fields, so this is the cleanest cross-reference path for in-API discovery of the deep walkthrough.

### 2026-06-06 repository-state repair

Current-code verification on 2026-06-06 found that the implementation remained present, but the root `docs/` tree was ignored and therefore the resolver-flow PDF targets linked from OpenAPI were missing from the tracked working tree. The gap was tracked in `.claude/plans/done/2026-06-06-structured-track-search-docs-follow-up.md` and closed with local commit `14e3c2f` (`Docs: Add resolver flow documentation`).

Observed repair:

- Removed the root `docs/` ignore rule from `.gitignore`.
- Restored `docs/resolve-flow/README.md`, `docs/resolve-flow/VERSION`, German and English LaTeX sources, and generated German and English PDFs.
- Updated OpenAPI `selectedCandidate` examples to the current resolver id format (`<service>:<sourceId>`, e.g. `spotify:2Wfa...`) instead of the stale `spotify:track:<id>` shape.
- Added OpenAPI regression checks that the linked resolver-flow PDFs exist.

PDF layout verification was rerun explicitly because the generated PDFs are a user-facing artifact:

- `make docs` succeeded.
- Both PDFs are A4 and 4 pages.
- LaTeX produced no `Overfull` warnings.
- `pdftotext -bbox-layout` checked all 4 DE pages and all 4 EN pages with `out-of-page words: 0`.
- Rendered PNG previews were visually checked; tables, code blocks, and example URLs remain inside the page boundaries.

Relevant gates after the repair:

- `pnpm --filter @musiccloud/backend test:run openapi-docs structured-search resolver.test.ts musicbrainz.test.ts` — 111 tests passed.
- `pnpm --filter @musiccloud/backend typecheck` — passed.
- `pnpm lint` — passed.

Separate unrelated working-tree changes present during the repair were committed independently as `eeb6e1c` (`Fix: Harden MusicBrainz adapter handling`) so the structured-search documentation repair remains isolated from MusicBrainz hardening and adapter runbook work.

### What is intentionally NOT in this plan

- `year:`, `genre:` filter, `label:`, `duration:`, `bpm:` modifiers (Tier 2/3) — out of scope, may be a future plan.
- GET endpoint as an externally-reachable scripting API — would require an Astro forward route to add. Documented as a gap.
