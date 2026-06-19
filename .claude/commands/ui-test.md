---
description: Run the musiccloud UI smoke-test plans (frontend + dashboard) via Chrome DevTools MCP
argument-hint: [target=frontend|dashboard|both] [filter=test-id-glob]
---

Execute the musiccloud UI smoke-test plans via Chrome DevTools MCP. Two plans exist:

- **Frontend**: `.claude/plans/open/2026-04-18-frontend-ui-test-plan.md` — public `musiccloud.io` site (`apps/frontend`, port 3000).
- **Dashboard**: `.claude/plans/open/2026-04-18-dashboard-ui-test-plan.md` — admin console (`apps/dashboard`, port 4001).

## Argument parsing

`$ARGUMENTS` is a space-separated string. Parse it as:

1. **First token, if `frontend` or `dashboard`**: limits the run to that target. Consume the token.
2. **First token, if `both` or `all`**: explicit both. Consume the token.
3. **Anything else (or if the first token is a glob like `T-EMAIL-*`)**: target defaults to `both`; the whole `$ARGUMENTS` is treated as a test-id filter.
4. **Remaining tokens**: comma- or space-separated glob filter over test ids (e.g. `T-FE-SEARCH-*,T-LOGIN-01`). Empty = run every test in order.

Examples:
- `/ui-test` → run both plans, all tests.
- `/ui-test frontend` → frontend plan only, all tests.
- `/ui-test dashboard T-EMAIL-*` → dashboard plan, email tests only.
- `/ui-test T-FE-SHARE-*` → both plans (dashboard won't match the glob, so it'll effectively be frontend-only), filtered.

## Steps

1. Parse `$ARGUMENTS` per the rules above. Announce which plan(s) and which filter you will run.
2. Read the relevant plan file(s) in full.
3. Check prerequisites (common to both plans):
   - **Dev servers (backend :4000, frontend :3000, dashboard :4001):** if any are not reachable, start them automatically without asking. Run each `npm run dev:backend`, `npm run dev`, `npm run dev:dashboard` in the background (separate `run_in_background` Bash calls from the repo root), then poll the respective health URLs until all three respond with 2xx/3xx (timeout ~60s). If they still don't come up, abort with the server logs. Note: frontend tests still need the backend because `/api/*` is proxied.
   - **Any other prerequisite failure** (missing DB, missing `claude` user for the dashboard plan, missing MCP tools, wrong password, empty tracks table for the frontend plan): abort with a short diagnostic, or if the plan specifies a SKIP fallback for that prerequisite, apply it. Do **not** mutate the system to satisfy them (no user creation, no migrations, no seeding).
4. For the **dashboard plan only**: look up login credentials from the `project_local_admin_credentials.md` memory entry. If that memory is missing, abort the dashboard portion and ask the user.
5. Drive Chrome via the `mcp__chrome-devtools__*` tools. Keep one page alive within a plan where possible; open new pages only when the test requires it (invite flow, embed iframe, 404 check, mobile-viewport resize).
6. For every test, follow the exact steps in the plan. After each action, verify via `take_snapshot`, `list_console_messages`, or `list_network_requests` — never trust the absence of a thrown error.
7. On failure: capture a screenshot (`take_screenshot`), the last console messages, and the failing network request. Record the failure and continue with the next test — tests are independent.
8. Cleanup: undo any row the test created (templates, users, modified preferences like locale/theme) before reporting. If cleanup fails, note it in the report.
9. If running both plans, run the **frontend plan first** (no auth state needed, simpler teardown), then the **dashboard plan**. Emit separate report tables per plan, then a combined summary.

## Reporting

Both plans emit the **same** row-per-test format. No other narration during the run — no "let me click…", no "I'll now…", no mid-run summaries. Just the test lines, one per test. Individual plans' Reporting sections defer to this spec; do not invent per-plan formats.

### Row format

Each test is **one single line** of plain text, column-aligned. No code-block fences, no markdown styling, no ANSI colour codes (the TUI renderer does not interpret them and they leak as literal `[33m` tokens).

```
<TEST_ID padded to 18 chars><STATUS padded to 6 chars>  <optional one-line note in parens>
```

Example: `T-FE-HOME-02      PASS  (href="/drmRI" target="_blank")`

- **TEST_ID**: column width 18 (right-padded with spaces).
- **STATUS**: one of `PASS`, `FAIL`, `SKIP`; column width 6.
- **Note** (parenthetical): optional, concise — a diagnostic for `FAIL`/`SKIP` or a one-fact confirmation for `PASS`. Fits on one line. No trailing period. Include concrete values (ids, counts, URLs), not prose.

### Live progress

Emit exactly **one line per test**, the moment the test's verdict is known — never before. Do not preview an in-progress row. Do not combine the previous verdict with a preview of the next test in one message. One finished test = one message = one line.

No blank lines between rows. No code-block fences around rows. No trailing prose. The stream should read as a dense, alignable list.

### Headings & totals

- Plan heading: `### Frontend` or `### Dashboard` (plain markdown H3). No blank line before it beyond what markdown already renders.
- After a plan's last test: a totals line on its own: `N passed, M failed, K skipped`.
- When running both plans, after the second totals line emit a `### Total` heading followed by a line: `N passed, M failed, K skipped across both plans`.
- If any test `FAIL`ed, after the totals block emit a `#### Failures` section listing each failing id with a one-line expected-vs-actual diagnostic. `PASS` / `SKIP` never get a follow-up section.

### Example (Frontend, abbreviated)

```
### Frontend
T-FE-SETUP-01     PASS  (seed rVpRB "The Future" / Leonard Cohen)
T-FE-HOME-01      PASS
T-FE-HOME-02      PASS  (href="/drmRI" target="_blank")
T-FE-AUDIO-03     SKIP  (native <input type=range> click-to-seek not implemented; arrow-key seek verified in AUDIO-02)
T-FE-NETWORK-01   PASS  (0 4xx/5xx; 272×200, 387×304, 9×206)
47 passed, 0 failed, 1 skipped
```

The fences in the example above are documentation only — the live run emits the rows as bare text, not wrapped in a code block.

## Notes

- Both plan files are **evergreen**. Do not archive them, do not suggest moving them to `done/`, do not "clean them up".
- If you encounter a test that is no longer accurate (route renamed, field removed, selector changed), fix the plan in the same turn and mention the fix in the report. Keep each plan in lockstep with its app.
- Never commit cleanup artifacts. The plans describe a dry run against the local stack only.
