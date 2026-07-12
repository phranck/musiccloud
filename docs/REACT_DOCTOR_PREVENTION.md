# React Doctor Prevention Policy

This project treats React Doctor as a coding policy, not only as an after-the-fact scanner.

The canonical rule source is the local config:

- `doctor.config.ts`
- `packages/react-doctor-config-strict/index.js`
- `packages/react-doctor-plugin-domain-literals/index.js`

Use `pnpm doctor:rules` for the current live rule list. Do not copy the full list into prompts or docs manually; it contains default and configured rules and must stay generated from the installed Doctor version.

## Before Editing React Code

Before writing or refactoring React, identify which Doctor rule families the change touches:

- JSX, labels, buttons, anchors, ARIA, roles, images, or interactive markup: apply the accessibility and HTML-validity rules while designing the markup.
- Components, files, exports, or module structure: keep files focused, avoid giant or nested components, and export only what the consuming boundary needs.
- Hooks, effects, subscriptions, timers, event listeners, observers, fetches, or external resources: design cleanup, dependencies, cancellation, and ownership first.
- State, reducers, derived values, prop-to-state sync, or parent callbacks: keep render pure, avoid chained state updates, avoid derived-state effects, and keep data flow one-directional.
- Props passed to memoized or heavy children: stabilize arrays, objects, functions, and context values instead of allocating fresh values in JSX.
- Domain values such as type, kind, variant, status, state, mode, role, action, or phase: use shared `as const` namespaces, not inline discriminant literals.
- Imports, exports, dependencies, and deleted code: remove dead registrations and exports with the code they belonged to.

## Design Defaults

Prefer APIs that make Doctor violations difficult to write:

- Reuse project components for buttons, dialogs, cards, segmented controls, inputs, and overlays before adding new markup patterns.
- Put reusable static values at module scope.
- Put pure formatting, parsing, and mapping helpers at module scope unless they need component state.
- Model UI state with reducers or explicit finite states when multiple status/action strings are involved.
- Keep primitive domain literal namespaces as `PascalCase.PascalCase`, for example `Service.BandCamp` or `AppStateType.DisambiguationLoading`.
- Use computed keys for runtime maps keyed by literal values, for example `{ [DashboardActionId.Save]: definition }`.
- Keep config/text maps separate from domain literal namespaces.

## While Coding

Run the cheapest relevant feedback loop during a work block:

```bash
pnpm doctor:diff
```

Use this after a coherent edit chunk, not only at the end. It scans changed files against the base branch and fails on warnings.

For commit preparation:

```bash
pnpm run doctor
```

For editor integration experiments:

```bash
pnpm doctor:lsp
```

For full validation before reporting React work as finished:

```bash
pnpm run doctor
```

## Agent Workflow

Agents must apply the rule families above before edits. If a planned implementation would likely trigger Doctor, change the design first instead of relying on cleanup later.

When a Doctor rule fires anyway, fix the design cause where possible:

- Extract or reuse a component instead of suppressing `no-giant-component` or structure rules.
- Move derived calculations into render or memoized pure helpers instead of syncing them through effects.
- Add explicit cleanup/cancellation instead of suppressing effect rules.
- Stabilize values at the producer boundary instead of memoizing every consumer blindly.
- Move allowed domain values into shared literal namespaces instead of adding more inline string comparisons.

Only use inline disables when the rule is technically wrong for the specific line and the reason is documented next to the disable.
