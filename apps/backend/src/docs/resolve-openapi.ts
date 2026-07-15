export const STRUCTURED_SEARCH_OPENAPI_SECTION =
  "starts with `title:`, `artist:`, or `album:` and resolves tracks only. " +
  "Use it when the caller knows individual fields and wants more precise adapter-side matching than plain free text.\n\n" +
  "Supported fields:\n" +
  "- `title:` — track title. At least one of `title` or `artist` is required.\n" +
  "- `artist:` — artist name. At least one of `title` or `artist` is required.\n" +
  "- `album:` — optional album title. Refines a track match and cannot be used alone.\n" +
  "- `count:` — optional integer from `1` to `10`. Caps the disambiguation candidate list.\n\n" +
  "Syntax rules:\n" +
  "- Field names are case-insensitive.\n" +
  "- Fields are separated by commas. A missing comma before the next known field is tolerated, e.g. `title: foo artist: bar`.\n" +
  "- Values may contain spaces. Commas are field separators and are not escaped.\n" +
  "- Duplicate fields, empty values, unknown fields, `count` outside `1`–`10`, and `count` without `title` or `artist` return `400`.\n" +
  "- `genre:`, `tracks:`, `albums:`, `artists:`, and `vibe:` are rejected here. Use the `genre:` query shape instead.\n\n" +
  "Examples:\n" +
  "- `title: The Killing Moon, artist: Echo & The Bunnymen`\n" +
  "- `artist: Radiohead`\n" +
  "- `title: Karma Police, artist: Radiohead, album: OK Computer, count: 5`";

export const STRUCTURED_SEARCH_POST_OPENAPI_NOTE =
  "`POST` can return `ResolveDisambiguation` for structured searches. Send the chosen `candidates[].id` back as `selectedCandidate` to the same endpoint to complete and persist the resolve.";

export const STRUCTURED_SEARCH_GET_OPENAPI_NOTE =
  "`GET` has no `selectedCandidate` parameter. Ambiguous structured searches therefore return `400`; use `POST /api/v1/resolve` when the caller must present candidates and submit a selection. A successful `GET` resolve is persisted just like a successful `POST` resolve.";
