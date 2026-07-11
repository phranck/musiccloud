# Zerops Postgres Safety and Error Observability

Plan-Nr.: MC-118

> **For agentic workers:** Execute inline in the current session. Subagents are not authorized for this task. Use test-driven development for behavioral code and update this checklist immediately after each verified slice.

## Goal

Prevent Zerops production migrations from running through an administrative PostgreSQL role, detect privilege drift before traffic reaches a backend instance, surface every user-relevant backend error in the UI with a stable error code and unique incident reference, and emit structured diagnostic logs without secrets.

## Approved scope

- Repair the production owner of `public.album_vinyl_layouts` from `postgres` to `db` and verify the live share endpoint.
- Add a migration preflight to both musiccloud migration entry points.
- Strengthen `/health/db` to verify migrations, table access, and expected ownership/access invariants.
- Introduce one shared backend error contract and a global Fastify error handler.
- Preserve backend error status, code, safe message, context, and incident id across the Astro BFF.
- Render backend failures on share pages; redirect only genuine 404 responses.
- Standardize structured backend warning/error logging and audit swallowed operational failures.
- Document local, production-runtime, and production-admin database connections.
- Add global Codex rules and harden the personal `zerops-webapp` skill/template.
- Inventory existing Zerops/Postgres projects and retrofit the same safeguards after reading each repository's instructions.

## Architecture

Database safety lives in a small backend module that inspects the connected server before Drizzle runs. Remote migrations require an exact configured application role and reject superusers; local migrations remain convenient. A post-migration verifier and readiness check query effective privileges rather than inferring readiness from table existence.

API failures use a shared `ApiErrorResponse` containing a canonical `MC-*` code, a safe message, optional context, and a globally unique `errorId`. A global Fastify handler maps validation, PostgreSQL SQLSTATE, known application errors, and unknown exceptions. The same `errorId` and code are logged once at the request boundary. Recoverable deviations log structured warnings at their recovery boundary.

The Astro server client returns a discriminated result instead of collapsing every failure to `null`. Share rendering distinguishes success, genuine absence, and backend failure for both crawler SSR and deferred browser SSR.

## Global constraints

- Do not manually create, edit, apply, or mark Drizzle migrations.
- Do not delete or overwrite existing user, development, production, or S3 data in tests.
- Do not expose SQL text, stack traces, credentials, tokens, complete request bodies, or authorization headers to the UI or production logs.
- Never log a database connection string.
- `PRODUCTION_DATABASE_ADMIN_URL` is administrative and must never feed a migration runner.
- Production migration guards must fail closed before the first migration statement.
- Only an explicit backend 404 may become the UI not-found route.
- React Doctor is required full-repo before and after material React changes.
- Do not commit, push, create a PR, or switch branches without separate explicit authorization.

## Task 1: Production ownership repair

- [x] Re-read the production owner and `db` privileges in a transaction.
- [x] Execute exactly `ALTER TABLE public.album_vinyl_layouts OWNER TO db` through the approved production admin connection.
- [x] Verify owner and `SELECT/INSERT/UPDATE/DELETE` privileges for `db` without changing data.
- [x] Verify `/api/v1/share/jbWK4`, `/jbWK4`, `/api/v1/random-example`, and `/health/db` from outside the database.

## Task 2: Migration target guard

**Files:**

- Create `apps/backend/src/db/migration-safety.ts`
- Create `apps/backend/src/db/migration-safety.test.ts`
- Modify `apps/backend/src/db/run-migrations.ts`
- Modify `scripts/migrate.mjs`
- Modify `zerops.yml`

- [x] Write failing tests for local allowance, remote expected-role allowance, missing expected role, role mismatch, `postgres`, and any remote superuser.
- [x] Run the targeted test and confirm the expected failures.
- [x] Implement a side-effect-free decision function plus a PostgreSQL identity probe.
- [x] Run the targeted test and backend typecheck.
- [x] Wire the guard before Drizzle in both migration entry points without duplicating policy.
- [x] Add a static regression test that neither migration entry point reads `ZEROPS_DB_ADMIN_URL`.

## Task 3: Database readiness and post-migration verification

**Files:**

- Modify `apps/backend/src/server.ts`
- Modify the repository readiness interface and PostgreSQL adapter in their existing domain files.
- Add targeted backend tests beside the readiness implementation.

- [x] Write failing tests proving existence-only readiness accepts an inaccessible table and the new readiness rejects it.
- [x] Add both vinyl tables to the required set.
- [x] Check effective `SELECT` plus configured write privileges through the runtime connection.
- [x] Verify the latest local Drizzle hashes exist in production history without writing the history table.
- [x] Reuse the same verifier after migrations and in `/health/db`.
- [x] Run targeted tests and backend typecheck.

## Task 4: Shared error contract and global Fastify handler

**Files:**

- Modify `packages/shared/src/api.ts`
- Modify `packages/shared/src/error-codes.ts`
- Create focused backend error mapping/response modules under `apps/backend/src/lib/infra/`.
- Modify `apps/backend/src/server.ts`
- Modify shared backend schemas for `ErrorResponse`.
- Add unit and route tests.

- [x] Write failing tests for SQLSTATE `42501`, missing relation, unavailable database, Fastify validation, known errors, and unknown exceptions.
- [x] Add stable `MC-DB-*` and `MC-SYS-*` registry entries and extend the code-area type.
- [x] Add `errorId` to the shared wire contract and JSON schema.
- [x] Generate a UUID per error occurrence while preserving Fastify request id in logs.
- [x] Map safe user messages without leaking raw database errors.
- [x] Register a global handler before routes and ensure route-local handlers use the common builder.
- [x] Run shared/backend tests and typechecks.

## Task 5: Structured logging and deviation audit

**Files:**

- Refactor `apps/backend/src/lib/infra/logger.ts` or replace it with one structured adapter around Fastify/Pino-compatible fields.
- Modify request-boundary routes and operational catch sites identified by the audit.
- Add logger tests with a capture sink.

- [x] Define error, warning, info, and expected-domain-outcome rules.
- [x] Write failing tests for required fields and redaction.
- [x] Emit `errorCode`, `errorId`, `requestId`, `operation`, route/status, safe entity identifiers, SQLSTATE, error name, and safe message.
- [x] Audit all non-test catch blocks and classify each as expected outcome, recoverable deviation, or failed operation.
- [x] Add `warn` logs to recoverable fallbacks, including optional vinyl-layout enrichment failures.
- [x] Ensure failed requests log once at the request boundary rather than once per layer.
- [x] Run backend tests, typecheck, and a search audit for empty operational catches.

## Task 6: Astro BFF error preservation and share error UI

**Files:**

- Modify `apps/frontend/src/api/client.ts`
- Modify `apps/frontend/src/pages/[shortId].astro`
- Modify `apps/frontend/src/components/share/DeferredShareContent.astro`
- Reuse the existing error presentation components or add one compound share-error component following current card/token geometry.
- Modify locale messages and add frontend tests.

- [x] Run full-repo React Doctor before React edits and record the baseline.
- [x] Write failing client tests proving 500/503 preserve error payloads and 404 remains distinguishable.
- [x] Write failing SSR/deferred tests proving only 404 redirects.
- [x] Return a discriminated success/not-found/failure result from `fetchShareData`.
- [x] Render the backend safe message, stable code, and copyable `errorId` in both SSR paths.
- [x] Preserve backend HTTP status for crawler SSR where Astro permits it.
- [x] Run frontend tests, typecheck/build, and full-repo React Doctor.

## Task 7: musiccloud documentation and project policy

**Files:**

- Create `docs/postgres-migration-safety.md` and `docs/backend-error-observability.md`
- Modify project `AGENTS.md`
- Modify `.env.example` files and safe database scripts where applicable.
- Rename local `ZEROPS_DB_URL` to `PRODUCTION_DATABASE_ADMIN_URL` without printing or committing its value.

- [x] Document the three connection purposes and their allowed commands.
- [x] Document migration preflight failures and recovery.
- [x] Document read-only production diagnosis and the approval boundary for administrative writes.
- [x] Document ownership/privilege verification and health behavior.
- [x] Add a project rule forbidding admin-to-runtime env aliasing.
- [x] Verify no secret or real host was written to tracked files.

## Task 8: Global Codex rules and Zerops skill

**Files:**

- Modify `/Users/phranck/.codex/AGENTS.md`
- Modify `/Users/phranck/.codex/skills/zerops-webapp/SKILL.md`
- Modify relevant files under `/Users/phranck/.codex/skills/zerops-webapp/references/`
- Add reusable migration guard template resources only if they remove project-by-project reimplementation.

- [x] Run a baseline pressure scenario against the current skill and record the unsafe recommendation.
- [x] Add the global hard rules for production admin URLs and migration roles.
- [x] Update the Zerops template to scaffold role preflight, postflight, readiness, and connection separation.
- [x] Update first-deployment and dashboard references.
- [x] Validate skill frontmatter/folder using `quick_validate.py`.
- [x] Run the same scenario against the revised skill and verify it refuses an admin/superuser migration.

## Task 9: Existing-project inventory and retrofit

- [x] Locate repositories under `/Users/phranck/Sites` containing `zerops.yml` plus PostgreSQL/migration configuration.
- [x] Record each repository, ORM, migration command, runtime connection source, admin variable, and existing guard in a local inventory.
- [x] Read each repository's complete applicable `AGENTS.md` and identify applicable active plans before edits.
- [x] Apply the minimal equivalent role/superuser preflight, table-owner postflight, docs, and env separation per repository using its own migration tool.
- [x] Run each repository's targeted migration-safety tests and native backend typecheck without touching production data.

## Task 10: Completion audit

- [x] Run shared, backend, and frontend targeted tests.
- [x] Run all project typechecks, build, lint, and full-repo React Doctor.
- [x] Run `git diff --check` and inspect the complete diff for secrets and unrelated changes.
- [x] Re-run production database identity/privilege checks read-only.
- [x] Re-run production health, random example, share API, and landing example flows.
- [x] Verify every explicit requirement in this plan against current files or runtime output.
- [x] Move this plan to `.codex/plans/done/` only when every required item is proven.
