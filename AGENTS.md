# AGENTS.md — working conventions for musiccloud

Read this before any UI / layout / styling change. These are non-negotiable project
rules — apply them automatically on every change, not only when asked.

## Geometry: the radius cascade runs OUTSIDE-IN

Only the **outermost** card radius is authored: the `cardRadius` design token →
`--mc-card-radius`, surfaced by
[`apps/frontend/src/components/cards/cardGeometry.ts`](apps/frontend/src/components/cards/cardGeometry.ts).
**Every nested radius is DERIVED** by subtracting that level's inset, working from
the outside in:

| Level | Radius | Inset subtracted |
|---|---|---|
| EmbossedCard (outer) | `--mc-card-radius` | — |
| RecessedCard / well | `card − 12px` | content inset (`0.75rem`) |
| Control / row / button | `card − 15px` | + control inset (`0.1875rem`) |
| List-row artwork frame | `row corner − artwork inset` (per corner, concentric) | artwork inset (e.g. `4px`) |

Never hardcode a nested radius (no `rounded-md`, no `borderRadius: "6px"` on a nested
element). Derive it from the cascade so a single `cardRadius` change re-rounds every
surface concentrically. `cardGeometry.ts` exposes `recessedSurfaceRadius`,
`raisedControlRadius`, etc. — consume those, do not re-invent the maths.

## Grouped lists: the ≤5px inner-corner rule

For any **grouped** list/grid of rows/buttons inside a rounded container
(disambiguation, genre search, popular tracks, similar artists, platform grid, …):

- Every row/button corner **defaults to the small inner radius** `min(5px, control-radius)`.
- **Only** the corners that coincide with the container's rounded corners are
  **promoted** to the full control radius:
  - first row → top-left + top-right,
  - last row → bottom-left + bottom-right,
  - middle rows → all four corners stay ≤5px.
- A **left-hugging artwork frame** follows the row: its **left** corners track the
  row's left corners (full − artwork inset where promoted, else inner); its **right**
  (interior) corners stay inner.
- Single-column lists: compute first/last **by index** (declarative, no layout effect).
  Multi-column grids: group rows by live `offsetTop` (see `applyGroupedCorners` in
  `mockups/frontend-prototype.html`).

The disc/cover that swaps in on selection must read as a CD slotted into a device:
oversized + centred, overhang clipped by the tile's `overflow:hidden`, and never
dimmed except for the recessed rim's edge shadow (see `SlideArtwork`).

## Wire ALL structural settings — never hardcode

Paddings, gaps, radii, insets, and per-surface glass / typography values are design
tokens (see the `DesignTokens` model in `packages/shared/src/design-tokens.ts` and
the SSR-injected `--mc-*` / glass vars). Every surface must consume them through the
cascade / tokens — **never ad-hoc Tailwind constants** that drift from the token
model. When building or editing a screen, verify that **every** structural value
(padding, gap, radius, inset) is token-derived and matches
[`mockups/frontend-prototype.html`](mockups/frontend-prototype.html), the visual + settings reference.

## Developer Portal and Dashboard: compounds before local markup

Across the complete Developer Portal and Developer Dashboard, reusable compound
components are the default ownership boundary for repeated UI and layout
patterns. Before adding local markup or CSS, inspect existing compounds and
normalize any pattern that occurs in two or more places from the outer surface
down to its meaningful inner slots.

- Prefer explicit APIs such as `Component.Header`, `.Header.Addon`, `.Body`,
  `.Section`, and `.Footer` over repeated wrapper markup or class bundles.
- Keep domain-specific compounds on top of shared primitives instead of making
  one universal component with unrelated variant props.
- Reuse the same compound and token-derived geometry in the public portal and
  developer dashboard whenever semantics match. Do not fork a second visual
  recipe at a call site.
- Document public compound APIs and invariants. Tests must exercise their
  rendered structure so future call sites cannot silently reintroduce local
  pattern duplication.

## PostgreSQL migration and error boundaries

- Local commands use only the local PostgreSQL URL from `apps/backend/.env.local`. Never alias a production or administrative URL to `DATABASE_URL` for local testing or migrations.
- Zerops migrations must pass `apps/backend/src/db/migration-safety.ts` before Drizzle runs. Remote roles must be non-superuser and exactly match `DB_MIGRATION_ROLE`.
- Administrative ownership repairs are not migrations. They require explicit approval and before/after owner and privilege verification.
- `/health/db` must verify required tables, effective runtime privileges and the current Drizzle migration hash. Do not reduce it to connectivity or table-existence checks.
- Every backend error response must preserve stable `MC-*` code, safe message and unique `errorId` through frontend proxies and UI. Recoverable backend deviations must remain searchable in structured redacted logs.

## See also

- [`docs/REACT_DOCTOR_PREVENTION.md`](docs/REACT_DOCTOR_PREVENTION.md) — React Doctor policy (run before/after React work).
- [`apps/frontend/src/components/cards/cardGeometry.ts`](apps/frontend/src/components/cards/cardGeometry.ts) — the radius-cascade source of truth.
- [`mockups/frontend-prototype.html`](mockups/frontend-prototype.html) — the tuned visual + settings reference for every screen.
- [`docs/postgres-migration-safety.md`](docs/postgres-migration-safety.md) — connection roles, migration guard and readiness checks.
- [`docs/backend-error-observability.md`](docs/backend-error-observability.md) — public error contract, UI propagation and log correlation.
