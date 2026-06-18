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
  `frontend-prototype.html`).

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
[`frontend-prototype.html`](frontend-prototype.html), the visual + settings reference.

## See also

- [`docs/REACT_DOCTOR_PREVENTION.md`](docs/REACT_DOCTOR_PREVENTION.md) — React Doctor policy (run before/after React work).
- [`apps/frontend/src/components/cards/cardGeometry.ts`](apps/frontend/src/components/cards/cardGeometry.ts) — the radius-cascade source of truth.
- [`frontend-prototype.html`](frontend-prototype.html) — the tuned visual + settings reference for every screen.
