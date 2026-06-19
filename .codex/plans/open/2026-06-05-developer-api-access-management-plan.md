# Plan: Developer API Access Management

Plan-Nr.: MC-025

Status: open
Created: 2026-06-05
Scope: Dashboard management page, admin API, token model, and preparation for public API token enforcement.

## Objective

musiccloud should make public API usage possible only for approved apps that have received an access token from us.

Applicants provide:

- Contact email address
- App name
- App description
- Estimated requests per day

The public information page, the public request form route, and the notification email template will be created separately in the dashboard. This plan covers the management side in the dashboard and the backend foundation needed to issue, revoke, rotate, and rate-limit API access tokens.

## Current Code Findings

- Dashboard routes are registered centrally in `apps/dashboard/src/routes.tsx`.
- Dashboard sidebar sections are implemented in `apps/dashboard/src/components/layout/Sidebar.tsx` using `DashboardSection`.
- Existing dashboard pages use `PageLayout`, `PageHeader`, `PageBody`, `DataTable`, `DashboardActionButton`, and shared query hooks.
- Admin API paths are centralized in `packages/shared/src/endpoints.ts`.
- Backend route registration is centralized in `apps/backend/src/server.ts`.
- Public API auth currently accepts either `X-API-Key` matching `INTERNAL_API_KEY` or a Bearer JWT in `apps/backend/src/plugins/auth.ts`.
- Only `POST /api/v1/resolve` and `GET /api/v1/link/:id` are currently registered in the protected public route group.
- Several public routes are intentionally registered without public auth because the first-party website and SSR paths use them.
- Public API rate limiting is currently IP-based via `apps/backend/src/lib/infra/rate-limiter.ts`.
- No tables currently exist for API access requests, API clients, API tokens, token audit events, or token-based rate limits.
- Drizzle is the configured migration tool. Migrations must be generated and applied only through the project Drizzle workflow, not manually edited.

## Decisions

- Add a dedicated dashboard sidebar section named `Developer`.
- Add one initial sidebar item: `API Access`.
- Use route `/developer/api-access` for the dashboard management page.
- Treat access tokens as app/client credentials, not user identities.
- Store only token hashes in the database. Plaintext tokens are shown once after creation or rotation.
- Keep the first-party website/BFF boundary separate from external public API tokens.
- Do not expose secret public API tokens in browser code.
- Manage access requests and active clients in the same page for the first iteration.
- Restrict management access server-side to admin roles allowed to issue tokens. Prefer `owner | admin`; optionally tighten to `owner` if product policy requires it.
- Current backend auth detail: `authenticateAdmin` only verifies JWT `role: "admin"`. Real dashboard roles are DB roles (`owner`, `admin`, `moderator`) exposed as `dbRole`/user payload. Server-side management authorization must fetch the caller by `request.user.sub` through the admin repository and check the fresh DB role, following the pattern in `apps/backend/src/routes/admin-users.ts`; do not check `owner` against the JWT `role` claim.

## Data Model

Add Drizzle schema entries in `apps/backend/src/db/schemas/postgres.ts`.

Current schema alignment:

- API access entity IDs may use Drizzle UUIDs via `uuid("id").defaultRandom().primaryKey()`.
- Admin/user references must remain `text` and reference `admin_users.id`, because the current admin user IDs are text/nanoid based.
- Status fields and positive numeric limits should be enforced both in route validation and in Drizzle `check(...)` constraints, matching the existing schema style.
- Define FK `onDelete` behavior deliberately for request, client, token, and audit references before generating the migration.

### `api_access_requests`

Fields:

- `id` uuid primary key
- `contact_email` text not null
- `app_name` text not null
- `app_description` text not null
- `estimated_requests_per_day` integer not null
- `status` text not null, one of `pending`, `approved`, `rejected`, `archived`
- `submitted_at` timestamptz not null default now
- `reviewed_at` timestamptz null
- `reviewed_by_admin_id` text null, references admin user id where possible
- `review_note` text null

Indexes:

- status plus submitted date
- contact email

### `api_clients`

Fields:

- `id` uuid primary key
- `request_id` uuid null, references `api_access_requests`
- `app_name` text not null
- `contact_email` text not null
- `description` text not null
- `status` text not null, one of `active`, `suspended`, `revoked`
- `requests_per_minute` integer not null
- `requests_per_day` integer not null
- `created_at` timestamptz not null default now
- `updated_at` timestamptz not null default now
- `created_by_admin_id` text null

Indexes:

- status
- contact email
- app name

### `api_client_tokens`

Fields:

- `id` uuid primary key
- `client_id` uuid not null, references `api_clients`
- `token_prefix` text not null
- `token_hash` text not null
- `status` text not null, one of `active`, `revoked`, `rotated`
- `created_at` timestamptz not null default now
- `last_used_at` timestamptz null
- `revoked_at` timestamptz null
- `rotated_from_token_id` uuid null

Indexes:

- unique token prefix
- unique token hash
- client id plus status

### `api_access_audit_events`

Fields:

- `id` uuid primary key
- `client_id` uuid null
- `request_id` uuid null
- `token_id` uuid null
- `event_type` text not null, e.g. `request_submitted`, `request_approved`, `request_rejected`, `client_updated`, `token_created`, `token_revoked`, `token_rotated`
- `actor_admin_id` text null
- `occurred_at` timestamptz not null default now
- `event_data` jsonb not null default `{}`

## Backend API

Add shared endpoint constants in `packages/shared/src/endpoints.ts`.

Suggested admin paths:

- `GET /api/admin/developer/api-access`
- `GET /api/admin/developer/api-access/requests/:id`
- `POST /api/admin/developer/api-access/requests/:id/approve`
- `POST /api/admin/developer/api-access/requests/:id/reject`
- `GET /api/admin/developer/api-access/clients/:id`
- `PATCH /api/admin/developer/api-access/clients/:id`
- `POST /api/admin/developer/api-access/clients/:id/tokens`
- `POST /api/admin/developer/api-access/tokens/:id/revoke`
- `POST /api/admin/developer/api-access/tokens/:id/rotate`

Add backend route module:

- `apps/backend/src/routes/admin-api-access.ts`

Register it inside the admin-protected route group in `apps/backend/src/server.ts`.

Repository/service additions:

- Add API access DTOs to `apps/backend/src/db/admin-repository.ts` or a dedicated repository type if cleaner.
- Add a Postgres adapter module, e.g. `apps/backend/src/db/adapters/postgres-api-access.ts`.
- Wire methods into `apps/backend/src/db/adapters/postgres.ts`.
- Add service helpers for token generation, token hashing, and token display formatting.

Validation requirements:

- Email must be syntactically valid enough for admin use.
- App name and description must be bounded strings.
- Estimated requests per day must be a positive integer.
- Rate limits must be positive integers.
- Reject unknown statuses.
- Never return token hashes.
- Mirror status and positive-integer validation with database `check(...)` constraints, not only route-level checks.

## Token Handling

Token format:

```text
mc_live_<prefix>_<secret>
```

Rules:

- Generate prefix and secret with cryptographically strong randomness.
- Store only a hash of the full token.
- Keep `token_prefix` visible for identification.
- Show plaintext only in the API response immediately after create or rotate.
- Do not log plaintext tokens.
- Do not include plaintext tokens in audit event JSON.
- Before implementation, decide how this direct opaque token model interacts with the existing `/api/auth/token` flow, which currently exchanges env-based client credentials for short-lived JWTs. Either DB tokens become the accepted public bearer credential, or they replace/feed the client-credentials token endpoint; do not implement both semantics implicitly.

Potential implementation:

- Use Node `crypto.randomBytes`.
- Use SHA-256 or HMAC-SHA-256 for token lookup hash.
- Store hash as hex text.

## Dashboard UI

Add feature directory:

- `apps/dashboard/src/features/developer/`

Initial files:

- `ApiAccessPage.tsx`
- `apiAccessApi.ts`
- `hooks/useApiAccess.ts`
- optional component split for request/client tables and token dialogs

Sidebar:

- Add `sectionDeveloper` and `apiAccess` labels to `apps/dashboard/src/i18n/messages.ts`.
- Add `SidebarDeveloperSection` in `apps/dashboard/src/components/layout/Sidebar.tsx`.
- Use a suitable icon from `@phosphor-icons/react`, e.g. `CodeIcon`, `KeyIcon`, or `BracketsCurlyIcon`.
- Show the section only for admin-level roles, not moderators.

Route:

- Add lazy import in `apps/dashboard/src/routes.tsx`.
- Register `/developer/api-access` inside `RequireNonModerator`.

Page layout:

- Use existing `PageLayout`, `PageHeader`, `PageBody`.
- Use `DataTable` for lists where practical.
- Use existing dashboard buttons and dialog components.

Initial page sections:

- Pending requests
- Approved/rejected request history
- Active clients
- Suspended/revoked clients

Client detail controls:

- App name
- Contact email
- Description
- Status
- Requests per minute
- Requests per day
- Token list with prefix, status, created date, last used date
- Actions: create token, rotate token, revoke token, suspend/reactivate client

## Public API Enforcement Follow-Up

This management feature prepares enforcement but does not have to cut over every public route immediately.

Follow-up work:

- Add external token validation middleware.
- Attach token/client context to requests.
- Convert rate limiter from IP-only to token/client-aware for external public API requests.
- Preserve the current first-party BFF bypass based on `isInternalRequest`/`INTERNAL_API_KEY` and keep the global `@fastify/rate-limit` boundary separate from token-aware external limits.
- Keep `INTERNAL_API_KEY` for first-party SSR/BFF traffic.
- Classify every public route as one of:
  - external public API
  - first-party website/BFF route
  - public asset/health route
  - telemetry/analytics ingest
- Update OpenAPI docs and code samples.
- Decide whether legacy unauthenticated `GET /api/v1/resolve` is disabled, deprecated, or moved behind token auth.

## Tests And Gates

Backend tests:

- Token creation returns plaintext once and stores only hash.
- Token list never returns hash or plaintext.
- Revoked tokens cannot be used when enforcement is added.
- Rate-limit values validate positive integers.
- Non-admin or moderator access is rejected where required.
- Approve request creates or links an API client.

Dashboard tests:

- Page renders loading, empty, and populated states.
- Request approval dialog validates rate-limit inputs.
- Token creation dialog shows one-time token.
- Revoke/rotate actions invalidate query state.

Gates:

- `pnpm --filter @musiccloud/shared typecheck`
- `pnpm --filter @musiccloud/shared test:run` if shared endpoint, contract, or DTO tests are touched
- `pnpm --filter @musiccloud/backend typecheck`
- `pnpm --filter @musiccloud/backend test:run`
- `pnpm --filter @musiccloud/dashboard typecheck`
- `pnpm --filter @musiccloud/dashboard test:run`
- `pnpm lint`

Use React Doctor after React/dashboard changes if the implementation touches React components materially.

## Risks And Open Questions

- The current dashboard form builder appears to have frontend hooks for `/admin/forms`, but backend form routes were not visible in the inspected route list. If the API access request form relies on that system, verify the submission pipeline before connecting requests automatically.
- The current public auth flow issues short-lived JWTs from env-based `API_CLIENT_ID` and `API_CLIENT_SECRET`. Decide whether to keep that endpoint as a compatibility layer or replace it with direct opaque bearer tokens.
- Existing unauthenticated public routes support first-party SSR and website behavior. Do not blindly move all `/api/v1/*` routes into one auth group without preserving first-party website behavior.
- Management permission needs a product decision: `owner` only, or `owner | admin`.
- Usage analytics can be added after token issuance. Do not block the first management release on full analytics rollups unless required.

## Implementation Checklist

- [ ] Confirm management permission policy and document whether API access management is restricted to DB role `owner` or DB roles `owner | admin`; implement server-side checks via caller lookup from `request.user.sub`, not via JWT `role`.
- [ ] Define backend DTO/request/response contracts for requests, clients, tokens, audit events, and one-time plaintext token responses.
- [ ] Decide whether DB-issued opaque tokens are accepted directly by Public API auth or whether they replace/feed the existing `/api/auth/token` JWT client-credentials flow.
- [ ] Define token hashing strategy, prefix length, token format, and no-plaintext logging/audit rules before implementation.
- [ ] Add Drizzle schema for `api_access_requests`, `api_clients`, `api_client_tokens`, and `api_access_audit_events`, including status checks, positive integer checks, FK constraints, and deliberate `onDelete` behavior.
- [ ] Generate the database migration only with the configured Drizzle workflow; stop and report if Drizzle prompts, schema drift, or snapshot conflicts block generation.
- [ ] Run backend typecheck after schema and migration generation.
- [ ] Add shared endpoint constants and route-template helpers in `packages/shared/src/endpoints.ts`: concrete `ENDPOINTS.admin.developer.apiAccess.*` paths plus matching `ROUTE_TEMPLATES.admin.developer.apiAccess.*` entries for every `:id` backend route.
- [ ] Run affected shared/package typecheck after endpoint additions.
- [ ] Add API access types and methods to `apps/backend/src/db/admin-repository.ts` without wiring routes yet.
- [ ] Add SQL implementation in `apps/backend/src/db/adapters/postgres-api-access.ts`, then import with aliases and delegate through `apps/backend/src/db/adapters/postgres.ts`.
- [ ] Add backend service helpers for token generation, hashing, response shaping, and audit-event creation.
- [ ] Add backend unit tests for token generation, hash-only persistence, one-time plaintext response, and response redaction.
- [ ] Run backend typecheck and backend tests after repository/service work.
- [ ] Add admin route module for API access management with validation, caller DB-role permission checks, moderator rejection, and no token-hash exposure.
- [ ] Register the admin route module inside the existing admin-protected backend route group.
- [ ] Add backend route tests for permission rejection, validation errors, request approval, client updates, token create, token revoke, and token rotate.
- [ ] Run backend typecheck and backend tests after route registration.
- [ ] Add dashboard API client functions and query/mutation hooks for the finalized admin endpoint contracts.
- [ ] Run dashboard typecheck after API hook additions.
- [ ] Add Developer sidebar labels and admin-only Developer/API Access navigation.
- [ ] Add `/developer/api-access` lazy dashboard route under `RequireNonModerator` for `owner | admin` policy or under `RequireOwner` for owner-only policy.
- [ ] Align Developer sidebar visibility with the selected policy: `isAdmin` for `owner | admin`, or `role === "owner"` for owner-only.
- [ ] Build the API Access page with existing `PageLayout`, `PageHeader`, `PageBody`, `DataTable`, shared buttons, and existing dialog patterns.
- [ ] Add dashboard states for loading, empty, populated, error, and mutation-in-progress paths.
- [ ] Add dashboard controls for approve/reject request, update client status/rate limits, create token, rotate token, and revoke token.
- [ ] Ensure one-time plaintext tokens are shown only in the create/rotate success flow and are never cached into list/table state.
- [ ] Add dashboard tests for page states, permission visibility where covered, approval validation, token one-time display, revoke/rotate query invalidation, and client status updates.
- [ ] Run dashboard typecheck and dashboard tests after UI work.
- [ ] Run React Doctor full-repo if React/dashboard components were materially changed.
- [ ] Run final gates: `pnpm --filter @musiccloud/shared typecheck`, `pnpm --filter @musiccloud/backend typecheck`, `pnpm --filter @musiccloud/backend test:run`, `pnpm --filter @musiccloud/dashboard typecheck`, `pnpm --filter @musiccloud/dashboard test:run`, and `pnpm lint`.
- [ ] If automatic applicant intake is connected through the Form Builder, first verify or implement the missing backend route/storage pipeline; otherwise create dedicated API access request endpoints instead of assuming `/admin/forms` works end to end.
- [ ] Move public API token enforcement, token-aware rate limiting, OpenAPI docs, and legacy unauthenticated route decisions into a separate follow-up checklist instead of mixing them into this management release.
- [ ] Update this checklist as each completed task lands, including any blocked gate and its cause.
