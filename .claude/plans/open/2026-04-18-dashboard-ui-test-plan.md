# Dashboard UI Test Plan

Plan-Nr.: MC-018

> **Evergreen — NEVER move this file to `done/`.**
> This is the permanent blueprint for dashboard smoke-testing. Extend it when the dashboard grows, but keep it in `open/` forever. The project-completion workflow in `rules/git.md` does not apply here.

## Preface

This is a re-runnable smoke-test plan for the musiccloud admin dashboard (`apps/dashboard`). Claude executes it via the Chrome DevTools MCP server, driving a real browser against the local dev stack. Invoke it via `/ui-test` (see `.claude/commands/ui-test.md`) or by asking Claude to "run the dashboard UI test plan".

## Goal

Catch regressions in the primary user flows of the dashboard before they reach `main`. The focus is functional correctness (does the page load, does the action succeed, does the feedback render) — not pixel-level visual QA.

## Prerequisites

1. All three dev servers running: backend `:4000`, frontend `:3000`, dashboard `:4001`. If not, start them before testing (see `feedback_consistent_ports.md`).
2. Local Postgres reachable on `:5433` with migrations applied.
3. Login user `claude` exists (see `reference_local_dashboard_login.md`). If the user is missing or the password is wrong, abort and tell the user — do **not** mutate the DB to fix it.
4. Chrome DevTools MCP tools available (`mcp__chrome-devtools__*`). If absent, abort.

## Approach

- Drive Chrome via MCP. Use `new_page` + `navigate_page` to start, `take_snapshot` to read the DOM, `click` / `fill` / `fill_form` for interactions.
- After every action, verify via `take_snapshot` or `list_console_messages`. Do not assume success from the absence of a thrown error.
- On failure: capture a `take_screenshot`, the last `list_console_messages`, and the failing `list_network_requests` entry. Report the failing test id, the expected vs. actual, and continue with the next test (tests should be independent).
- Keep a single persistent page across tests to avoid re-login; only open a new page when the test explicitly requires it (e.g. invite-flow).
- Cleanup: any row created during a test must be deleted at the end of that test, unless the test is explicitly about persistence across reloads.

## Scope — what to test

Role matters: `claude` is assumed to be `admin` (not `owner`). The `/users` route is `owner`-only and is skipped unless you have verified `claude` is owner. Moderator-hidden routes are out of scope.

### Test IDs

Tests are identified by stable ids (`T-LOGIN-01` etc.) so a user can ask for a subset: "run T-EMAIL-\*" or "run T-LOGIN-01, T-NAV-01".

---

## Checklist

### Auth

- [ ] **T-LOGIN-01 — Login succeeds with valid credentials**
  - Navigate to `http://localhost:4001/login`.
  - Fill username `claude`, password from memory.
  - Submit. Expect redirect to `/` and the sidebar to render with the username.

- [ ] **T-LOGIN-02 — Login fails with wrong password**
  - Navigate to `/login` in a fresh incognito-style page (or clear localStorage first).
  - Fill username `claude`, password `wrong`.
  - Expect a visible error message, URL stays on `/login`, no JWT in `localStorage`.

- [ ] **T-LOGIN-03 — Logout clears session**
  - From logged-in state, trigger logout (sidebar footer / profile menu).
  - Expect redirect to `/login`, `localStorage.admin_token` removed.
  - Re-visiting `/` redirects back to `/login`.

- [ ] **T-SESSION-01 — Auth session remains valid on idle**
  - After login, wait ≥60s and keep the dashboard open.
  - Expect the current page to stay authenticated with `localStorage.admin_token` present and no forced redirect to `/login`.
  - The dashboard uses JWT auto-refresh only when the token is close to expiry; do not require idle `/auth/me` polling or `/auth/refresh` traffic during a normal fresh-token smoke run.

### Navigation

- [ ] **T-NAV-01 — Sidebar lists the expected sections**
  - Take snapshot of sidebar, assert presence of the expected entries. Labels are localised — the default login locale for the `claude` user is DE. Accept either set:
    - DE: Übersicht, Tracks, Alben, Künstler, Statistiken, Navigationen, Formulare, E-Mail-Vorlagen, Seiten, Markdown-Widgets, Services, System
    - EN: Overview, Tracks, Albums, Artists, Analytics, Navigation, Forms, Email Templates, Pages, Markdown Widgets, Services, System
  - "Benutzer" / "Users" may be visible in the sidebar, but the actual `/users` route is still owner-only and redirects admins back to `/`.
  - No console errors.

- [ ] **T-NAV-02 — Each top-level route loads without error**
  - Click every sidebar entry in sequence.
  - After each: page is non-empty, no uncaught errors in `list_console_messages`, no 5xx in `list_network_requests`.

### Dashboard home

- [ ] **T-HOME-01 — Dashboard stats render**
  - Navigate to `/`.
  - Expect the stats cards (tracks, albums, artists, …) to show numeric values, not spinners, within 5s.

### Analytics (admin/owner only)

- [ ] **T-ANALYTICS-01 — KPI cards render**
  - Navigate to `/analytics`.
  - Expect: Visitors, Pageviews, Bounce Rate, Duration, Resolves, Interactions cards each show a value.
  - Custom-event cards (Top Resolves by Service, Top Link Clicks by Service) should also render data — the 2026-03-21 memory note about "No Data" is outdated; events are now tracked end-to-end.

- [ ] **T-ANALYTICS-02 — Period switcher rewires the data**
  - Change the period from "7 Tage" / "7 days" to "Heute" / "Today".
  - Expect a new `GET /api/admin/analytics/stats?period=today` request (and matching `pageviews` + `metrics` calls) and re-rendered values.

- [ ] **T-ANALYTICS-03 — Realtime card updates**
  - Observe the Realtime card for ≥35s.
  - Expect it to be present and not stuck on spinner. Two fetches of `/api/admin/analytics/realtime` within the window is acceptable.

### Email templates

- [ ] **T-EMAIL-01 — List renders**
  - Navigate to `/email-templates`. Expect a table with at least the system templates.

- [ ] **T-EMAIL-02 — Create a new template**
  - Click "New Template" (or equivalent CTA).
  - Fill name `__ui-test-<ts>`, subject, body.
  - Save. Expect redirect to `/email-templates/:id`, saved indicator appears.
  - Remember the id for later cleanup.

- [ ] **T-EMAIL-03 — Preview mode toggle persists**
  - On the edit page, switch preview to Dark.
  - Reload the page. Expect Dark still selected (localStorage key `email-template:preview-color-scheme`).

- [ ] **T-EMAIL-04 — Test-send button works**
  - On an existing template's edit page, click "Test-Mail senden" / "Send test email".
  - Expect a `POST /api/admin/email-templates/:id/test` request with 200.
  - Expect success toast/text containing the caller's email (Brevo delivery itself is not verified here).
  - On 502, report the Brevo error body rather than marking the test green.

- [ ] **T-EMAIL-05 — Delete the test template**
  - From the list page, delete the template created in T-EMAIL-02.
  - Expect confirm dialog → confirm → row disappears from the list.

- [ ] **T-EMAIL-06 — Export downloads a zip**
  - Click "Export all".
  - Verify via `list_network_requests` that `GET /api/admin/email-templates/export` returned 200 with `Content-Type: application/zip`.

### Users (owner only — skip if claude is admin)

- [ ] **T-USERS-01 — Create user with welcome-template**
  - Navigate to `/users`, click create.
  - Fill a unique test username + email, pick any email template.
  - Submit. Expect 201, invite URL shown in the response dialog.
  - The invite URL must be on the `DASHBOARD_URL` host (not `PUBLIC_URL`).

- [ ] **T-USERS-02 — Invite flow end-to-end**
  - Copy the invite URL from T-USERS-01.
  - Open it in a new incognito page.
  - Expect the accept-invite form with the invitee's username + email.
  - Set a password (≥8 chars), submit. Expect redirect to `/` and a valid session.

- [ ] **T-USERS-03 — Delete the test user**
  - From owner session, delete the user created in T-USERS-01.
  - Row disappears, no error.

### Music (tracks / albums / artists)

- [ ] **T-TRACKS-01 — List renders**
  - Navigate to `/tracks`. The list is virtualised — all rows live in the DOM without paginator controls. Assert: the row count matches the sidebar badge (e.g. sidebar shows "604" → DOM has ~604 data rows) OR the empty state is rendered. No console errors.

- [ ] **T-TRACKS-02 — Open a detail page**
  - Click the first row. Expect `/tracks/:id` to load with the edit form populated.

- [ ] **T-ALBUMS-01 / T-ARTISTS-01** — same pattern as T-TRACKS-01 for `/albums` and `/artists`.

### System + Services

- [ ] **T-SYSTEM-01 — System page loads**
  - Navigate to `/system`. Assert no errors.

- [ ] **T-SERVICES-01 — Services page loads and toggles persist**
  - Navigate to `/services`. Toggle one service off → on again. Reload. State matches the last toggle.

### Cross-cutting

- [ ] **T-LOCALE-01 — Language switch persists**
  - If a language switcher exists in the profile/settings, switch DE ↔ EN.
  - Reload. Assert the new language is still active (i18n is client-side — localStorage key).

- [ ] **T-CONSOLE-01 — No console errors during a typical session**
  - From login → visit every top-level page → logout, collect `list_console_messages`.
  - Zero entries at level `error`. Warnings are informational but should be noted in the report.

---

## Reporting

See the **Reporting** section of `.claude/commands/ui-test.md` for the canonical row format (18-char ID, 6-char status, optional parenthetical note), live-progress `TEST` row, ANSI colours, and totals block. Do not invent a different format here — both plans must produce identical output.

## Change log

- 2026-04-18: Initial draft (Brevo email + invite flow shipped).
- 2026-04-18: Aligned tests with shipped dashboard state — T-SESSION-01 now expects `/auth/me` polling (no `/auth/refresh` endpoint exists), T-NAV-01 accepts both DE/EN labels and clarifies "Users" is a section header, T-ANALYTICS-01 drops the stale "No Data" note for custom events, T-ANALYTICS-02 switches from the non-existent `24h` button to `Heute`/`today`, T-TRACKS-01 reframes the list as virtualised instead of paginated.
- 2026-05-17: Aligned dashboard smoke expectations with current auth and sidebar behavior — fresh JWT sessions no longer require idle `/auth/me` polling, Navigationen/Navigation is part of the sidebar, and admin `/users` visibility is allowed as long as the route redirects away.
