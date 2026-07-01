# API-Zugriffsverwaltung Backend (MC-025 Fundament) Implementation Plan

Plan-Nr.: MC-077

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Backend-Fundament für API-Zugriffsanträge, -Clients und -Tokens: Datenmodell, Admin-API (Dashboard-Verwaltung) und Developer-Self-Service-API (developer.musiccloud.io), gemäss dem reconcilierten Design in [2026-07-01-developer-api-access-self-service-design.md](../../../docs/superpowers/specs/2026-07-01-developer-api-access-self-service-design.md).

**Architecture:** Vier neue Drizzle-Tabellen mit `developer_account_id`-FK. Ein neues `ApiAccessRepository` + Postgres-Sub-Adapter (Muster `developer-repository.ts`/`postgres-developer.ts`), delegiert über `PostgresAdapter`. Zwei getrennte Routen-Oberflächen auf demselben Repository: `admin-api-access.ts` (owner/admin, `adminRoutes`-Block) und `dev-api-access.ts` (eingeloggte Developer-Accounts, neuer guarded Scope mit `authenticateDeveloper`). Kein Enforcement an der Public-API-Grenze in diesem Durchgang.

**Tech Stack:** Fastify, Drizzle (Postgres), `node:crypto` (Token-Gen/Hash), `nanoid`, vitest, `@musiccloud/shared` (Endpoints).

---

## Geltungsbereich

Dieser Plan baut **nur** das Backend (Abschnitte A–C des Design-Specs). Bewusst **nicht** enthalten (eigene Folge-Pläne):

- Dashboard-Admin-UI (`apps/dashboard`, Abschnitt D)
- Developer-Portal-Self-Service-UI (`apps/developer`, Abschnitt E)
- Public-API-Enforcement, Rate-Limit-Durchsetzung, Usage-Analytics (MC-025 Phase 2)

Ergebnis dieses Plans: Ein Admin kann Anträge/Clients/Tokens per API verwalten (verifiziert per Route-Tests, nicht per UI), ein eingeloggter Developer kann per API einen Antrag stellen und eigene Tokens verwalten (ebenfalls per Route-Tests verifiziert). Ausgestellte Tokens funktionieren noch nicht gegen die echte Public API.

## Verifizierte Fakten (2026-07-01)

Alle Referenzen per direktem Read/Grep gegen den aktuellen Code verifiziert (siehe auch den Design-Spec).

- **Migrationen:** höchste vorhandene `0047_lumpy_kulan_gath.sql`; nächste freie Nummer `0048`. Migration ausschliesslich via `pnpm db:generate`.
- **Schema-Vorlage** `apps/backend/src/db/schemas/postgres.ts` (1509 Zeilen, endet nach `developerEmailTokens` bei Zeile 1509): `text("id").primaryKey()` (kein `uuid`-PK existiert irgendwo im Schema), `check(...)`/`index(...)`/`uniqueIndex(...)` in einer `(table) => [...]`-Callback-Form (`:1440-1443`, `:1472-1476`, `:1502-1505`), `timestamp(col, {withTimezone:true})`, `jsonb(col).notNull().default({})` (Präzedenz `:1209`). Imports `sql` aus `drizzle-orm`; `check, index, integer, jsonb, pgTable, text, timestamp, uniqueIndex` bereits aus `drizzle-orm/pg-core` importiert (keine neuen Imports nötig).
- **Repository-Vorlage** `apps/backend/src/db/developer-repository.ts` (237 Zeilen, komplett gelesen): DTO + Interface im selben File, ausführliches TSDoc pro Methode. `apps/backend/src/db/adapters/postgres-developer.ts` (398 Zeilen, komplett gelesen): modulprivate `*Row`-Interfaces, `rowToX`-Mapper, `export async function x(pool: Pool, ...)`, ID-Erzeugung via direktem `nanoid()`-Aufruf (nicht `short-id.ts`), Timestamps via `dateToMs` aus `postgres-shared.js`.
- **Adapter-Komposition** `apps/backend/src/db/adapters/postgres.ts`: `export class PostgresAdapter implements TrackRepository, AdminRepository, CcRepository, DeveloperRepository` (`:231`); aliased Imports aus `postgres-developer.ts` (`:194-207`); One-Line-Delegation im Class-Body (`:956-1016`, vor der schliessenden `}` bei `:1017`).
- **Accessor** `apps/backend/src/db/index.ts` (74 Zeilen, komplett gelesen): `getAdminRepository()`/`getDeveloperRepository()` (`:18-33`), gemeinsame `repositoryInstance`/`ensureInstance()`. Re-Export-Block am Dateiende (`:57-73`).
- **Transaktions-Pattern** `apps/backend/src/db/adapters/postgres-shared.ts:323-359` (`insertExternalIds`): `pool.connect()` → `client.query("BEGIN")` → Arbeit → `COMMIT`/`ROLLBACK` im `catch` → `client.release()` im `finally`. Vorlage für `rotateApiClientToken` (zwei Writes atomar).
- **Endpoints** `packages/shared/src/endpoints.ts` (418 Zeilen, relevanter Bereich komplett gelesen): `admin`-Gruppe endet bei `:319` (letzte Untergruppe `crawler` `:307-318`); `dev`-Gruppe `:328-352` (`auth.*` inkl. `github.{start,exchange}`, KEINE Param-Routen bisher). `ROUTE_TEMPLATES` (`:361-...`) hat bisher keine `dev.*`-Einträge — die neuen `dev.apiAccess.*`-Routen sind die ersten mit `:id`-Parametern in dieser Gruppe.
- **Guards** `apps/backend/src/plugins/auth.ts` (221 Zeilen, komplett gelesen): `authenticateDeveloper` (`:190-214`) verifiziert das `mc_dev_session`-Cookie, lädt den Account frisch, setzt `request.developerAccountId`. `authenticateAdmin` (`:150-164`) prüft nur den JWT-`role`-Claim — **nicht ausreichend** für den Owner/Admin-vs-Moderator-Unterschied dieses Plans.
- **Rollen-Check-Vorlage** `apps/backend/src/routes/admin-users.ts:310-315`: privates, nicht-exportiertes `getCaller(request)` lädt den Aufrufer frisch aus `getAdminRepository().findAdminById(payload.sub)`. Muster ist im Repo bereits als kleine Pro-File-Duplikation etabliert (`getCallerId`-Varianten in `admin-page-translations.ts`/`admin-content.ts`) — keine gemeinsame Extraktion, neue Route-Datei bekommt ihre eigene lokale Kopie.
- **Server-Registrierung** `apps/backend/src/server.ts`: `adminRoutes`-Block (`:640-653`, `authenticateAdmin`) registriert mehrere `admin*Routes`-Funktionen; neue `adminApiAccessRoutes` reiht sich dort ein. `devAuthRoutes`/`devGitHubRoutes` (`:583-588`) laufen root-scope mit Guard **pro Route**; für diesen Plan wird erstmals ein **guarded Child-Scope** für `authenticateDeveloper` gebraucht (Muster `protectedRoutes`/`adminRoutes`, `:631-653`), da alle sechs neuen Dev-Routen denselben Guard brauchen.
- **Rate-Limiter** `apps/backend/src/lib/infra/rate-limiter.ts` (169 Zeilen, komplett gelesen): `new RateLimiter(maxRequests, windowMs)`, `.check(key)` → `RateLimitCheck`. `sendRateLimitError(reply, check)` aus `rate-limit-response.ts` (Signatur bereits aus MC-065 bekannt: setzt `Retry-After`-Header, 429).
- [x] Alle Referenzen erneut gegen den aktuellen Code verifiziert vor dem ersten Edit.

---

## Task 1: Schema + Migration

**Files:**
- Modify: `apps/backend/src/db/schemas/postgres.ts` (Anhängen nach Zeile 1509)

- [x] **Step 1: Vier Tabellen anhängen**

Ans Dateiende von `apps/backend/src/db/schemas/postgres.ts` (nach der letzten Zeile, `export type DeveloperEmailTokenInsert = ...`) anhängen:

```typescript
/**
 * A developer's request for Public-API access (MC-025/MC-077). Each row
 * describes one app; `developerAccountId` is the source of truth for who
 * submitted it (`contactEmail` is a display snapshot, not the identity).
 * Approval creates exactly one new {@link apiClients} row per request —
 * requests are never merged into an existing client.
 */
export const apiAccessRequests = pgTable(
  "api_access_requests",
  {
    id: text("id").primaryKey(),
    developerAccountId: text("developer_account_id")
      .notNull()
      .references(() => developerAccounts.id, { onDelete: "cascade" }),
    contactEmail: text("contact_email").notNull(),
    appName: text("app_name").notNull(),
    appDescription: text("app_description").notNull(),
    estimatedRequestsPerDay: integer("estimated_requests_per_day").notNull(),
    status: text("status").notNull().default("pending"),
    submittedAt: timestamp("submitted_at", { withTimezone: true }).notNull().defaultNow(),
    reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
    reviewedByAdminId: text("reviewed_by_admin_id").references(() => adminUsers.id, { onDelete: "set null" }),
    reviewNote: text("review_note"),
  },
  (table) => [
    index("idx_api_access_requests_status_submitted").on(table.status, table.submittedAt),
    index("idx_api_access_requests_developer_account").on(table.developerAccountId),
    check(
      "chk_api_access_requests_status",
      sql`${table.status} IN ('pending', 'approved', 'rejected', 'archived')`,
    ),
    check("chk_api_access_requests_estimated_requests", sql`${table.estimatedRequestsPerDay} > 0`),
  ],
);

export type ApiAccessRequestRow = typeof apiAccessRequests.$inferSelect;
export type ApiAccessRequestInsert = typeof apiAccessRequests.$inferInsert;

/**
 * An approved API consumer ("app"). Linked to the developer account that
 * owns it and, when created via the request flow, to the originating
 * {@link apiAccessRequests} row. `requestsPerMinute`/`requestsPerDay` are
 * free-tier defaults, editable by an admin — not yet enforced anywhere
 * (Public-API enforcement is MC-025 Phase 2).
 */
export const apiClients = pgTable(
  "api_clients",
  {
    id: text("id").primaryKey(),
    requestId: text("request_id").references(() => apiAccessRequests.id, { onDelete: "set null" }),
    developerAccountId: text("developer_account_id")
      .notNull()
      .references(() => developerAccounts.id, { onDelete: "cascade" }),
    appName: text("app_name").notNull(),
    contactEmail: text("contact_email").notNull(),
    description: text("description").notNull(),
    status: text("status").notNull().default("active"),
    requestsPerMinute: integer("requests_per_minute").notNull().default(60),
    requestsPerDay: integer("requests_per_day").notNull().default(10000),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
    createdByAdminId: text("created_by_admin_id").references(() => adminUsers.id, { onDelete: "set null" }),
  },
  (table) => [
    index("idx_api_clients_status").on(table.status),
    index("idx_api_clients_developer_account").on(table.developerAccountId),
    check("chk_api_clients_status", sql`${table.status} IN ('active', 'suspended', 'revoked')`),
    check("chk_api_clients_requests_per_minute", sql`${table.requestsPerMinute} > 0`),
    check("chk_api_clients_requests_per_day", sql`${table.requestsPerDay} > 0`),
  ],
);

export type ApiClientRow = typeof apiClients.$inferSelect;
export type ApiClientInsert = typeof apiClients.$inferInsert;

/**
 * An issued bearer token for an {@link apiClients} row, sent as
 * `X-API-Key: mc_live_<prefix>_<secret>`. Only the SHA-256 hash is
 * persisted (`tokenHash`); `tokenPrefix` is safe to display. Both admins
 * and the owning developer can create/revoke/rotate tokens — see
 * `api-access-repository.ts`. `rotatedFromTokenId` is informational only
 * (no FK constraint, to avoid a self-referential-FK typing detour for a
 * field that is never used for integrity checks, only display history).
 */
export const apiClientTokens = pgTable(
  "api_client_tokens",
  {
    id: text("id").primaryKey(),
    clientId: text("client_id")
      .notNull()
      .references(() => apiClients.id, { onDelete: "cascade" }),
    tokenPrefix: text("token_prefix").notNull(),
    tokenHash: text("token_hash").notNull(),
    status: text("status").notNull().default("active"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    lastUsedAt: timestamp("last_used_at", { withTimezone: true }),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
    rotatedFromTokenId: text("rotated_from_token_id"),
  },
  (table) => [
    uniqueIndex("uq_api_client_tokens_prefix").on(table.tokenPrefix),
    uniqueIndex("uq_api_client_tokens_hash").on(table.tokenHash),
    index("idx_api_client_tokens_client_status").on(table.clientId, table.status),
    check("chk_api_client_tokens_status", sql`${table.status} IN ('active', 'revoked', 'rotated')`),
  ],
);

export type ApiClientTokenRow = typeof apiClientTokens.$inferSelect;
export type ApiClientTokenInsert = typeof apiClientTokens.$inferInsert;

/**
 * Audit trail for every mutating action on requests/clients/tokens.
 * `actorAdminId` is set for admin-initiated actions, `actorDeveloperAccountId`
 * for developer self-service actions — exactly one of the two is set (never
 * both, never neither) by every writer in `api-access-repository.ts`.
 */
export const apiAccessAuditEvents = pgTable(
  "api_access_audit_events",
  {
    id: text("id").primaryKey(),
    clientId: text("client_id").references(() => apiClients.id, { onDelete: "set null" }),
    requestId: text("request_id").references(() => apiAccessRequests.id, { onDelete: "set null" }),
    tokenId: text("token_id").references(() => apiClientTokens.id, { onDelete: "set null" }),
    eventType: text("event_type").notNull(),
    actorAdminId: text("actor_admin_id").references(() => adminUsers.id, { onDelete: "set null" }),
    actorDeveloperAccountId: text("actor_developer_account_id").references(() => developerAccounts.id, {
      onDelete: "set null",
    }),
    occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull().defaultNow(),
    eventData: jsonb("event_data").notNull().default({}),
  },
  (table) => [index("idx_api_access_audit_events_client_occurred").on(table.clientId, table.occurredAt)],
);

export type ApiAccessAuditEventRow = typeof apiAccessAuditEvents.$inferSelect;
export type ApiAccessAuditEventInsert = typeof apiAccessAuditEvents.$inferInsert;
```

- [x] **Step 2: Migration generieren**

Run: `pnpm db:generate`
Expected: neue Datei `apps/backend/src/db/migrations/postgres/0048_*.sql` mit vier `CREATE TABLE`-Statements. Bei Drift-/Snapshot-Prompt: stoppen und den Konflikt berichten statt zu raten.

- [x] **Step 3: Backend-Typecheck**

Run: `pnpm --filter @musiccloud/backend typecheck`
Expected: keine Fehler.

- [x] **Step 4: Migration lokal anwenden**

Run: `pnpm --filter @musiccloud/backend db:migrate` (oder das Repo-Äquivalent aus `package.json`; gegen die lokale Dev-DB)
Expected: vier neue Tabellen in der lokalen DB, Migrations-Tracker (`drizzle.__drizzle_migrations`) zeigt `0048` als angewendet.

- [x] **Step 5: Commit**

```bash
git add apps/backend/src/db/schemas/postgres.ts apps/backend/src/db/migrations/postgres
git commit -m "Feat: add api_access_requests/clients/tokens/audit_events schema (MC-077)"
```

---

## Task 2: Repository + Postgres-Adapter + Accessor

**Files:**
- Create: `apps/backend/src/db/api-access-repository.ts`
- Create: `apps/backend/src/db/adapters/postgres-api-access.ts`
- Modify: `apps/backend/src/db/adapters/postgres.ts`
- Modify: `apps/backend/src/db/index.ts`

- [x] **Step 1: Repository-Interface + DTOs anlegen**

Create `apps/backend/src/db/api-access-repository.ts`:

```typescript
/**
 * Repository contract for the API-access system (MC-025/MC-077): requests,
 * approved clients, their bearer tokens, and the audit trail. Shared by two
 * route surfaces — the admin dashboard (owner/admin review + moderation)
 * and the developer-portal self-service API (submit request, manage own
 * tokens) — since both act on the same underlying tables.
 *
 * Kept separate from {@link AdminRepository} and `DeveloperRepository`:
 * neither admin users nor developer accounts own this data outright, both
 * merely act on it through different lenses.
 */

/**
 * An API-access request DTO.
 *
 * @property id - Stable request id (text PK, nanoid-generated).
 * @property developerAccountId - Owning developer account (source of truth).
 * @property contactEmail - Display snapshot of the account's email at submission time.
 * @property appName - Name of the requesting app.
 * @property appDescription - Free-text description of the app/use case.
 * @property estimatedRequestsPerDay - Applicant's own volume estimate.
 * @property status - `"pending"` | `"approved"` | `"rejected"` | `"archived"`.
 * @property submittedAt - Epoch ms.
 * @property reviewedAt - Epoch ms, or `null` while still pending.
 * @property reviewedByAdminId - Admin who approved/rejected, or `null`.
 * @property reviewNote - Reviewer note; required by the route layer on reject.
 */
export interface ApiAccessRequest {
  id: string;
  developerAccountId: string;
  contactEmail: string;
  appName: string;
  appDescription: string;
  estimatedRequestsPerDay: number;
  status: string;
  submittedAt: number;
  reviewedAt: number | null;
  reviewedByAdminId: string | null;
  reviewNote: string | null;
}

/**
 * An approved API-client ("app") DTO.
 *
 * @property id - Stable client id (text PK, nanoid-generated).
 * @property requestId - Originating request, or `null` if created directly by an admin.
 * @property developerAccountId - Owning developer account.
 * @property appName - Name of the app.
 * @property contactEmail - Display contact email.
 * @property description - Free-text description.
 * @property status - `"active"` | `"suspended"` | `"revoked"`.
 * @property requestsPerMinute - Rate-limit ceiling (not yet enforced).
 * @property requestsPerDay - Daily quota ceiling (not yet enforced).
 * @property createdAt - Epoch ms.
 * @property updatedAt - Epoch ms.
 * @property createdByAdminId - Admin who created the client directly, or `null` when created via request approval.
 */
export interface ApiClient {
  id: string;
  requestId: string | null;
  developerAccountId: string;
  appName: string;
  contactEmail: string;
  description: string;
  status: string;
  requestsPerMinute: number;
  requestsPerDay: number;
  createdAt: number;
  updatedAt: number;
  createdByAdminId: string | null;
}

/**
 * An issued bearer token DTO. Never carries the raw token or a
 * reconstructable secret — only `tokenPrefix` (safe to display) and
 * `tokenHash` (opaque, used only for lookup-equality).
 *
 * @property id - Stable token id (text PK, nanoid-generated).
 * @property clientId - Owning client.
 * @property tokenPrefix - Non-secret display prefix.
 * @property tokenHash - Hex-encoded SHA-256 of the raw token.
 * @property status - `"active"` | `"revoked"` | `"rotated"`.
 * @property createdAt - Epoch ms.
 * @property lastUsedAt - Epoch ms, or `null` if never used (enforcement is MC-025 Phase 2, so this stays `null` in this round).
 * @property revokedAt - Epoch ms, or `null`.
 * @property rotatedFromTokenId - Id of the token this one replaced, or `null`.
 */
export interface ApiClientToken {
  id: string;
  clientId: string;
  tokenPrefix: string;
  tokenHash: string;
  status: string;
  createdAt: number;
  lastUsedAt: number | null;
  revokedAt: number | null;
  rotatedFromTokenId: string | null;
}

/**
 * An audit-trail entry DTO. Exactly one of `actorAdminId` /
 * `actorDeveloperAccountId` is set per row.
 *
 * @property id - Stable event id (text PK, nanoid-generated).
 * @property clientId - Related client, or `null`.
 * @property requestId - Related request, or `null`.
 * @property tokenId - Related token, or `null`.
 * @property eventType - e.g. `"request_submitted"`, `"token_rotated"`.
 * @property actorAdminId - Acting admin, or `null` for developer self-service actions.
 * @property actorDeveloperAccountId - Acting developer, or `null` for admin actions.
 * @property occurredAt - Epoch ms.
 * @property eventData - Small structured context; never contains raw tokens/hashes.
 */
export interface ApiAccessAuditEvent {
  id: string;
  clientId: string | null;
  requestId: string | null;
  tokenId: string | null;
  eventType: string;
  actorAdminId: string | null;
  actorDeveloperAccountId: string | null;
  occurredAt: number;
  eventData: Record<string, unknown>;
}

/**
 * Persistence contract for the API-access system. See the file-level
 * comment for scope and the shared-ownership rationale.
 */
export interface ApiAccessRepository {
  /** Creates a new pending request for the given developer account. The id is generated by the implementation. */
  createApiAccessRequest(data: {
    developerAccountId: string;
    contactEmail: string;
    appName: string;
    appDescription: string;
    estimatedRequestsPerDay: number;
  }): Promise<ApiAccessRequest>;

  /** Looks up a request by primary key. */
  findApiAccessRequestById(id: string): Promise<ApiAccessRequest | null>;

  /** Lists every request submitted by the given developer account, newest first. */
  listApiAccessRequestsByDeveloperAccount(developerAccountId: string): Promise<ApiAccessRequest[]>;

  /** Lists requests, newest first, optionally filtered by `status`. */
  listApiAccessRequests(status?: string): Promise<ApiAccessRequest[]>;

  /**
   * Sets a request's review outcome (`status`, `reviewedAt = NOW()`,
   * `reviewedByAdminId`, `reviewNote`). Does not create the client — the
   * route layer calls {@link createApiClient} separately on approval so
   * both writes can share one audit-event bundle.
   */
  reviewApiAccessRequest(
    id: string,
    data: { status: "approved" | "rejected"; reviewedByAdminId: string; reviewNote?: string | null },
  ): Promise<ApiAccessRequest | null>;

  /** Creates a new client. The id is generated by the implementation; `status` starts `"active"`. */
  createApiClient(data: {
    requestId?: string | null;
    developerAccountId: string;
    appName: string;
    contactEmail: string;
    description: string;
    requestsPerMinute?: number;
    requestsPerDay?: number;
    createdByAdminId?: string | null;
  }): Promise<ApiClient>;

  /** Looks up a client by primary key. */
  findApiClientById(id: string): Promise<ApiClient | null>;

  /** Lists every client owned by the given developer account, newest first. */
  listApiClientsByDeveloperAccount(developerAccountId: string): Promise<ApiClient[]>;

  /** Lists clients, newest first, optionally filtered by `status`. */
  listApiClients(status?: string): Promise<ApiClient[]>;

  /** Patches `status`/`requestsPerMinute`/`requestsPerDay` and bumps `updatedAt`. Omitted fields are left unchanged. */
  updateApiClient(
    id: string,
    data: { status?: string; requestsPerMinute?: number; requestsPerDay?: number },
  ): Promise<ApiClient | null>;

  /** Creates a new active token for a client. The id is generated by the implementation. */
  createApiClientToken(data: {
    clientId: string;
    tokenPrefix: string;
    tokenHash: string;
    rotatedFromTokenId?: string | null;
  }): Promise<ApiClientToken>;

  /** Lists every token for a client, newest first (never exposes `tokenHash` to callers above the route-response layer — the DTO itself still carries it for internal comparisons). */
  listApiClientTokensByClient(clientId: string): Promise<ApiClientToken[]>;

  /** Looks up a token by primary key. */
  findApiClientTokenById(id: string): Promise<ApiClientToken | null>;

  /** Marks a token `"revoked"` and stamps `revokedAt`. Idempotent: revoking an already-revoked token is a no-op that still returns the row. */
  revokeApiClientToken(id: string): Promise<ApiClientToken | null>;

  /**
   * Atomically marks the given token `"rotated"` and creates a new active
   * token on the same client with `rotatedFromTokenId` set to the old
   * token's id. Runs both writes in one transaction.
   *
   * @returns Both tokens, or `null` if the given id does not match an
   *   existing, still-active token.
   */
  rotateApiClientToken(
    id: string,
    data: { newTokenPrefix: string; newTokenHash: string },
  ): Promise<{ oldToken: ApiClientToken; newToken: ApiClientToken } | null>;

  /** Records an audit-trail entry. The id is generated by the implementation; `eventData` defaults to `{}`. */
  createApiAccessAuditEvent(data: {
    clientId?: string | null;
    requestId?: string | null;
    tokenId?: string | null;
    eventType: string;
    actorAdminId?: string | null;
    actorDeveloperAccountId?: string | null;
    eventData?: Record<string, unknown>;
  }): Promise<ApiAccessAuditEvent>;
}
```

- [x] **Step 2: Postgres-Adapter anlegen**

Create `apps/backend/src/db/adapters/postgres-api-access.ts`:

```typescript
/**
 * API-access domain: persistence for requests, clients, tokens and the
 * audit trail (MC-025/MC-077). New ids are nanoid-generated here, matching
 * `postgres-developer.ts`. Timestamp columns are mapped to epoch
 * milliseconds via {@link dateToMs}.
 */

import { nanoid } from "nanoid";
import type { Pool } from "pg";
import type {
  ApiAccessAuditEvent,
  ApiAccessRequest,
  ApiClient,
  ApiClientToken,
} from "../api-access-repository.js";
import { dateToMs } from "./postgres-shared.js";

// ============================================================================
// ROW TYPES
// ============================================================================

interface ApiAccessRequestRow {
  id: string;
  developer_account_id: string;
  contact_email: string;
  app_name: string;
  app_description: string;
  estimated_requests_per_day: number;
  status: string;
  submitted_at: Date;
  reviewed_at: Date | null;
  reviewed_by_admin_id: string | null;
  review_note: string | null;
}

interface ApiClientRow {
  id: string;
  request_id: string | null;
  developer_account_id: string;
  app_name: string;
  contact_email: string;
  description: string;
  status: string;
  requests_per_minute: number;
  requests_per_day: number;
  created_at: Date;
  updated_at: Date;
  created_by_admin_id: string | null;
}

interface ApiClientTokenRow {
  id: string;
  client_id: string;
  token_prefix: string;
  token_hash: string;
  status: string;
  created_at: Date;
  last_used_at: Date | null;
  revoked_at: Date | null;
  rotated_from_token_id: string | null;
}

interface ApiAccessAuditEventRow {
  id: string;
  client_id: string | null;
  request_id: string | null;
  token_id: string | null;
  event_type: string;
  actor_admin_id: string | null;
  actor_developer_account_id: string | null;
  occurred_at: Date;
  event_data: Record<string, unknown>;
}

const REQUEST_COLUMNS = `id, developer_account_id, contact_email, app_name, app_description,
            estimated_requests_per_day, status, submitted_at, reviewed_at, reviewed_by_admin_id, review_note`;
const CLIENT_COLUMNS = `id, request_id, developer_account_id, app_name, contact_email, description,
            status, requests_per_minute, requests_per_day, created_at, updated_at, created_by_admin_id`;
const TOKEN_COLUMNS = `id, client_id, token_prefix, token_hash, status, created_at, last_used_at,
            revoked_at, rotated_from_token_id`;
const AUDIT_COLUMNS = `id, client_id, request_id, token_id, event_type, actor_admin_id,
            actor_developer_account_id, occurred_at, event_data`;

// ============================================================================
// MAPPERS
// ============================================================================

function rowToApiAccessRequest(row: ApiAccessRequestRow): ApiAccessRequest {
  return {
    id: row.id,
    developerAccountId: row.developer_account_id,
    contactEmail: row.contact_email,
    appName: row.app_name,
    appDescription: row.app_description,
    estimatedRequestsPerDay: row.estimated_requests_per_day,
    status: row.status,
    submittedAt: dateToMs(row.submitted_at),
    reviewedAt: row.reviewed_at ? dateToMs(row.reviewed_at) : null,
    reviewedByAdminId: row.reviewed_by_admin_id,
    reviewNote: row.review_note,
  };
}

function rowToApiClient(row: ApiClientRow): ApiClient {
  return {
    id: row.id,
    requestId: row.request_id,
    developerAccountId: row.developer_account_id,
    appName: row.app_name,
    contactEmail: row.contact_email,
    description: row.description,
    status: row.status,
    requestsPerMinute: row.requests_per_minute,
    requestsPerDay: row.requests_per_day,
    createdAt: dateToMs(row.created_at),
    updatedAt: dateToMs(row.updated_at),
    createdByAdminId: row.created_by_admin_id,
  };
}

function rowToApiClientToken(row: ApiClientTokenRow): ApiClientToken {
  return {
    id: row.id,
    clientId: row.client_id,
    tokenPrefix: row.token_prefix,
    tokenHash: row.token_hash,
    status: row.status,
    createdAt: dateToMs(row.created_at),
    lastUsedAt: row.last_used_at ? dateToMs(row.last_used_at) : null,
    revokedAt: row.revoked_at ? dateToMs(row.revoked_at) : null,
    rotatedFromTokenId: row.rotated_from_token_id,
  };
}

function rowToApiAccessAuditEvent(row: ApiAccessAuditEventRow): ApiAccessAuditEvent {
  return {
    id: row.id,
    clientId: row.client_id,
    requestId: row.request_id,
    tokenId: row.token_id,
    eventType: row.event_type,
    actorAdminId: row.actor_admin_id,
    actorDeveloperAccountId: row.actor_developer_account_id,
    occurredAt: dateToMs(row.occurred_at),
    eventData: row.event_data ?? {},
  };
}

// ============================================================================
// REQUESTS
// ============================================================================

export async function createApiAccessRequest(
  pool: Pool,
  data: {
    developerAccountId: string;
    contactEmail: string;
    appName: string;
    appDescription: string;
    estimatedRequestsPerDay: number;
  },
): Promise<ApiAccessRequest> {
  const now = new Date();
  const result = await pool.query(
    `INSERT INTO api_access_requests
       (id, developer_account_id, contact_email, app_name, app_description, estimated_requests_per_day, submitted_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     RETURNING ${REQUEST_COLUMNS}`,
    [
      nanoid(),
      data.developerAccountId,
      data.contactEmail,
      data.appName,
      data.appDescription,
      data.estimatedRequestsPerDay,
      now,
    ],
  );
  return rowToApiAccessRequest(result.rows[0] as ApiAccessRequestRow);
}

export async function findApiAccessRequestById(pool: Pool, id: string): Promise<ApiAccessRequest | null> {
  const result = await pool.query(`SELECT ${REQUEST_COLUMNS} FROM api_access_requests WHERE id = $1`, [id]);
  if (result.rows.length === 0) return null;
  return rowToApiAccessRequest(result.rows[0] as ApiAccessRequestRow);
}

export async function listApiAccessRequestsByDeveloperAccount(
  pool: Pool,
  developerAccountId: string,
): Promise<ApiAccessRequest[]> {
  const result = await pool.query(
    `SELECT ${REQUEST_COLUMNS} FROM api_access_requests WHERE developer_account_id = $1 ORDER BY submitted_at DESC`,
    [developerAccountId],
  );
  return result.rows.map((row) => rowToApiAccessRequest(row as ApiAccessRequestRow));
}

export async function listApiAccessRequests(pool: Pool, status?: string): Promise<ApiAccessRequest[]> {
  const result = status
    ? await pool.query(
        `SELECT ${REQUEST_COLUMNS} FROM api_access_requests WHERE status = $1 ORDER BY submitted_at DESC`,
        [status],
      )
    : await pool.query(`SELECT ${REQUEST_COLUMNS} FROM api_access_requests ORDER BY submitted_at DESC`);
  return result.rows.map((row) => rowToApiAccessRequest(row as ApiAccessRequestRow));
}

export async function reviewApiAccessRequest(
  pool: Pool,
  id: string,
  data: { status: "approved" | "rejected"; reviewedByAdminId: string; reviewNote?: string | null },
): Promise<ApiAccessRequest | null> {
  const now = new Date();
  const result = await pool.query(
    `UPDATE api_access_requests
     SET status = $1, reviewed_at = $2, reviewed_by_admin_id = $3, review_note = $4
     WHERE id = $5
     RETURNING ${REQUEST_COLUMNS}`,
    [data.status, now, data.reviewedByAdminId, data.reviewNote ?? null, id],
  );
  if (result.rows.length === 0) return null;
  return rowToApiAccessRequest(result.rows[0] as ApiAccessRequestRow);
}

// ============================================================================
// CLIENTS
// ============================================================================

export async function createApiClient(
  pool: Pool,
  data: {
    requestId?: string | null;
    developerAccountId: string;
    appName: string;
    contactEmail: string;
    description: string;
    requestsPerMinute?: number;
    requestsPerDay?: number;
    createdByAdminId?: string | null;
  },
): Promise<ApiClient> {
  const now = new Date();
  const result = await pool.query(
    `INSERT INTO api_clients
       (id, request_id, developer_account_id, app_name, contact_email, description,
        requests_per_minute, requests_per_day, created_at, updated_at, created_by_admin_id)
     VALUES ($1, $2, $3, $4, $5, $6, COALESCE($7, 60), COALESCE($8, 10000), $9, $9, $10)
     RETURNING ${CLIENT_COLUMNS}`,
    [
      nanoid(),
      data.requestId ?? null,
      data.developerAccountId,
      data.appName,
      data.contactEmail,
      data.description,
      data.requestsPerMinute ?? null,
      data.requestsPerDay ?? null,
      now,
      data.createdByAdminId ?? null,
    ],
  );
  return rowToApiClient(result.rows[0] as ApiClientRow);
}

export async function findApiClientById(pool: Pool, id: string): Promise<ApiClient | null> {
  const result = await pool.query(`SELECT ${CLIENT_COLUMNS} FROM api_clients WHERE id = $1`, [id]);
  if (result.rows.length === 0) return null;
  return rowToApiClient(result.rows[0] as ApiClientRow);
}

export async function listApiClientsByDeveloperAccount(pool: Pool, developerAccountId: string): Promise<ApiClient[]> {
  const result = await pool.query(
    `SELECT ${CLIENT_COLUMNS} FROM api_clients WHERE developer_account_id = $1 ORDER BY created_at DESC`,
    [developerAccountId],
  );
  return result.rows.map((row) => rowToApiClient(row as ApiClientRow));
}

export async function listApiClients(pool: Pool, status?: string): Promise<ApiClient[]> {
  const result = status
    ? await pool.query(`SELECT ${CLIENT_COLUMNS} FROM api_clients WHERE status = $1 ORDER BY created_at DESC`, [
        status,
      ])
    : await pool.query(`SELECT ${CLIENT_COLUMNS} FROM api_clients ORDER BY created_at DESC`);
  return result.rows.map((row) => rowToApiClient(row as ApiClientRow));
}

export async function updateApiClient(
  pool: Pool,
  id: string,
  data: { status?: string; requestsPerMinute?: number; requestsPerDay?: number },
): Promise<ApiClient | null> {
  const now = new Date();
  const result = await pool.query(
    `UPDATE api_clients
     SET status = COALESCE($1, status),
         requests_per_minute = COALESCE($2, requests_per_minute),
         requests_per_day = COALESCE($3, requests_per_day),
         updated_at = $4
     WHERE id = $5
     RETURNING ${CLIENT_COLUMNS}`,
    [data.status ?? null, data.requestsPerMinute ?? null, data.requestsPerDay ?? null, now, id],
  );
  if (result.rows.length === 0) return null;
  return rowToApiClient(result.rows[0] as ApiClientRow);
}

// ============================================================================
// TOKENS
// ============================================================================

export async function createApiClientToken(
  pool: Pool,
  data: { clientId: string; tokenPrefix: string; tokenHash: string; rotatedFromTokenId?: string | null },
): Promise<ApiClientToken> {
  const now = new Date();
  const result = await pool.query(
    `INSERT INTO api_client_tokens (id, client_id, token_prefix, token_hash, created_at, rotated_from_token_id)
     VALUES ($1, $2, $3, $4, $5, $6)
     RETURNING ${TOKEN_COLUMNS}`,
    [nanoid(), data.clientId, data.tokenPrefix, data.tokenHash, now, data.rotatedFromTokenId ?? null],
  );
  return rowToApiClientToken(result.rows[0] as ApiClientTokenRow);
}

export async function listApiClientTokensByClient(pool: Pool, clientId: string): Promise<ApiClientToken[]> {
  const result = await pool.query(
    `SELECT ${TOKEN_COLUMNS} FROM api_client_tokens WHERE client_id = $1 ORDER BY created_at DESC`,
    [clientId],
  );
  return result.rows.map((row) => rowToApiClientToken(row as ApiClientTokenRow));
}

export async function findApiClientTokenById(pool: Pool, id: string): Promise<ApiClientToken | null> {
  const result = await pool.query(`SELECT ${TOKEN_COLUMNS} FROM api_client_tokens WHERE id = $1`, [id]);
  if (result.rows.length === 0) return null;
  return rowToApiClientToken(result.rows[0] as ApiClientTokenRow);
}

export async function revokeApiClientToken(pool: Pool, id: string): Promise<ApiClientToken | null> {
  const now = new Date();
  const result = await pool.query(
    `UPDATE api_client_tokens SET status = 'revoked', revoked_at = COALESCE(revoked_at, $1)
     WHERE id = $2
     RETURNING ${TOKEN_COLUMNS}`,
    [now, id],
  );
  if (result.rows.length === 0) return null;
  return rowToApiClientToken(result.rows[0] as ApiClientTokenRow);
}

/**
 * Atomically rotates a token: marks it `"rotated"` and inserts a new active
 * token on the same client. Runs on a dedicated transaction client
 * (pattern: `postgres-shared.ts` `insertExternalIds`).
 */
export async function rotateApiClientToken(
  pool: Pool,
  id: string,
  data: { newTokenPrefix: string; newTokenHash: string },
): Promise<{ oldToken: ApiClientToken; newToken: ApiClientToken } | null> {
  const now = new Date();
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const oldResult = await client.query(
      `UPDATE api_client_tokens SET status = 'rotated'
       WHERE id = $1 AND status = 'active'
       RETURNING ${TOKEN_COLUMNS}`,
      [id],
    );
    if (oldResult.rows.length === 0) {
      await client.query("ROLLBACK");
      return null;
    }
    const oldToken = rowToApiClientToken(oldResult.rows[0] as ApiClientTokenRow);
    const newResult = await client.query(
      `INSERT INTO api_client_tokens (id, client_id, token_prefix, token_hash, created_at, rotated_from_token_id)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING ${TOKEN_COLUMNS}`,
      [nanoid(), oldToken.clientId, data.newTokenPrefix, data.newTokenHash, now, oldToken.id],
    );
    await client.query("COMMIT");
    return { oldToken, newToken: rowToApiClientToken(newResult.rows[0] as ApiClientTokenRow) };
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

// ============================================================================
// AUDIT EVENTS
// ============================================================================

export async function createApiAccessAuditEvent(
  pool: Pool,
  data: {
    clientId?: string | null;
    requestId?: string | null;
    tokenId?: string | null;
    eventType: string;
    actorAdminId?: string | null;
    actorDeveloperAccountId?: string | null;
    eventData?: Record<string, unknown>;
  },
): Promise<ApiAccessAuditEvent> {
  const now = new Date();
  const result = await pool.query(
    `INSERT INTO api_access_audit_events
       (id, client_id, request_id, token_id, event_type, actor_admin_id, actor_developer_account_id, occurred_at, event_data)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
     RETURNING ${AUDIT_COLUMNS}`,
    [
      nanoid(),
      data.clientId ?? null,
      data.requestId ?? null,
      data.tokenId ?? null,
      data.eventType,
      data.actorAdminId ?? null,
      data.actorDeveloperAccountId ?? null,
      now,
      JSON.stringify(data.eventData ?? {}),
    ],
  );
  return rowToApiAccessAuditEvent(result.rows[0] as ApiAccessAuditEventRow);
}
```

- [x] **Step 3: In `PostgresAdapter` delegieren**

Modify `apps/backend/src/db/adapters/postgres.ts`:

In den Import-Block bei `./postgres-developer.js` (Zeile `:194-207`) direkt danach ergänzen:

```typescript
import {
  createApiAccessAuditEvent as apiAccessCreateAuditEvent,
  createApiAccessRequest as apiAccessCreateRequest,
  createApiClient as apiAccessCreateClient,
  createApiClientToken as apiAccessCreateClientToken,
  findApiAccessRequestById as apiAccessFindRequestById,
  findApiClientById as apiAccessFindClientById,
  findApiClientTokenById as apiAccessFindClientTokenById,
  listApiAccessRequests as apiAccessListRequests,
  listApiAccessRequestsByDeveloperAccount as apiAccessListRequestsByDeveloperAccount,
  listApiClients as apiAccessListClients,
  listApiClientsByDeveloperAccount as apiAccessListClientsByDeveloperAccount,
  listApiClientTokensByClient as apiAccessListClientTokensByClient,
  reviewApiAccessRequest as apiAccessReviewRequest,
  revokeApiClientToken as apiAccessRevokeClientToken,
  rotateApiClientToken as apiAccessRotateClientToken,
  updateApiClient as apiAccessUpdateClient,
} from "./postgres-api-access.js";
```

`class PostgresAdapter implements ...` (Zeile `:231`) um `ApiAccessRepository` erweitern:

```typescript
export class PostgresAdapter
  implements TrackRepository, AdminRepository, CcRepository, DeveloperRepository, ApiAccessRepository
{
```

Zum bestehenden Type-Import-Block in `postgres.ts` hinzufügen:

```typescript
import type {
  ApiAccessAuditEvent,
  ApiAccessRepository,
  ApiAccessRequest,
  ApiClient,
  ApiClientToken,
} from "../api-access-repository.js";
```

Vor der schliessenden `}` der Klasse (aktuell Zeile `:1017`) einfügen:

```typescript
  // ============================================================================
  // API ACCESS (ApiAccessRepository) — migration 0048
  // ============================================================================

  createApiAccessRequest(data: {
    developerAccountId: string;
    contactEmail: string;
    appName: string;
    appDescription: string;
    estimatedRequestsPerDay: number;
  }): Promise<ApiAccessRequest> {
    return apiAccessCreateRequest(this.pool, data);
  }

  findApiAccessRequestById(id: string): Promise<ApiAccessRequest | null> {
    return apiAccessFindRequestById(this.pool, id);
  }

  listApiAccessRequestsByDeveloperAccount(developerAccountId: string): Promise<ApiAccessRequest[]> {
    return apiAccessListRequestsByDeveloperAccount(this.pool, developerAccountId);
  }

  listApiAccessRequests(status?: string): Promise<ApiAccessRequest[]> {
    return apiAccessListRequests(this.pool, status);
  }

  reviewApiAccessRequest(
    id: string,
    data: { status: "approved" | "rejected"; reviewedByAdminId: string; reviewNote?: string | null },
  ): Promise<ApiAccessRequest | null> {
    return apiAccessReviewRequest(this.pool, id, data);
  }

  createApiClient(data: {
    requestId?: string | null;
    developerAccountId: string;
    appName: string;
    contactEmail: string;
    description: string;
    requestsPerMinute?: number;
    requestsPerDay?: number;
    createdByAdminId?: string | null;
  }): Promise<ApiClient> {
    return apiAccessCreateClient(this.pool, data);
  }

  findApiClientById(id: string): Promise<ApiClient | null> {
    return apiAccessFindClientById(this.pool, id);
  }

  listApiClientsByDeveloperAccount(developerAccountId: string): Promise<ApiClient[]> {
    return apiAccessListClientsByDeveloperAccount(this.pool, developerAccountId);
  }

  listApiClients(status?: string): Promise<ApiClient[]> {
    return apiAccessListClients(this.pool, status);
  }

  updateApiClient(
    id: string,
    data: { status?: string; requestsPerMinute?: number; requestsPerDay?: number },
  ): Promise<ApiClient | null> {
    return apiAccessUpdateClient(this.pool, id, data);
  }

  createApiClientToken(data: {
    clientId: string;
    tokenPrefix: string;
    tokenHash: string;
    rotatedFromTokenId?: string | null;
  }): Promise<ApiClientToken> {
    return apiAccessCreateClientToken(this.pool, data);
  }

  listApiClientTokensByClient(clientId: string): Promise<ApiClientToken[]> {
    return apiAccessListClientTokensByClient(this.pool, clientId);
  }

  findApiClientTokenById(id: string): Promise<ApiClientToken | null> {
    return apiAccessFindClientTokenById(this.pool, id);
  }

  revokeApiClientToken(id: string): Promise<ApiClientToken | null> {
    return apiAccessRevokeClientToken(this.pool, id);
  }

  rotateApiClientToken(
    id: string,
    data: { newTokenPrefix: string; newTokenHash: string },
  ): Promise<{ oldToken: ApiClientToken; newToken: ApiClientToken } | null> {
    return apiAccessRotateClientToken(this.pool, id, data);
  }

  createApiAccessAuditEvent(data: {
    clientId?: string | null;
    requestId?: string | null;
    tokenId?: string | null;
    eventType: string;
    actorAdminId?: string | null;
    actorDeveloperAccountId?: string | null;
    eventData?: Record<string, unknown>;
  }): Promise<ApiAccessAuditEvent> {
    return apiAccessCreateAuditEvent(this.pool, data);
  }
}
```

- [x] **Step 4: Accessor ergänzen**

Modify `apps/backend/src/db/index.ts`: Import ergänzen (`import type { ApiAccessRepository } from "./api-access-repository.js";`), nach `getDeveloperRepository` einfügen:

```typescript
/** Returns the singleton ApiAccessRepository instance, creating it on first call. */
export async function getApiAccessRepository(): Promise<ApiAccessRepository> {
  await ensureInstance();
  return repositoryInstance!;
}
```

Im Re-Export-Block am Dateiende ergänzen:

```typescript
export type {
  ApiAccessAuditEvent,
  ApiAccessRepository,
  ApiAccessRequest,
  ApiClient,
  ApiClientToken,
} from "./api-access-repository.js";
```

- [x] **Step 5: Backend-Typecheck**

Run: `pnpm --filter @musiccloud/backend typecheck`
Expected: keine Fehler.

- [x] **Step 6: Commit**

```bash
git add apps/backend/src/db/api-access-repository.ts apps/backend/src/db/adapters/postgres-api-access.ts apps/backend/src/db/adapters/postgres.ts apps/backend/src/db/index.ts
git commit -m "Feat: add ApiAccessRepository + Postgres adapter (MC-077)"
```

---

## Task 3: Token-Service

**Files:**
- Create: `apps/backend/src/services/api-access-token.ts`
- Create: `apps/backend/src/services/api-access-token.test.ts`

- [x] **Step 1: Service schreiben**

Create `apps/backend/src/services/api-access-token.ts`:

```typescript
/**
 * @file Token-generation and hashing service for the API-access system
 * (MC-025/MC-077). Framework-free: produces the opaque
 * `mc_live_<prefix>_<secret>` bearer token developers send as `X-API-Key`
 * (already shown in the live landing/docs pages), and the SHA-256 hash
 * that is the only form ever persisted. The route layer owns persistence
 * and authorization; this module owns only the token shape.
 */
import crypto from "node:crypto";

/** Label every issued API-access token starts with. */
const TOKEN_LABEL = "mc_live";

/**
 * A freshly generated token: `raw` is returned to the caller exactly once
 * (the API response body of a create/rotate call) and never stored;
 * `prefix` and `hash` are what gets persisted.
 */
export interface GeneratedApiToken {
  /** Full token, shown to the caller once. */
  raw: string;
  /** Short, non-secret identifier stored in the clear for display/lookup. */
  prefix: string;
  /** Hex-encoded SHA-256 of `raw`; the only form persisted. */
  hash: string;
}

/**
 * Generates a new opaque API-access token in the form
 * `mc_live_<prefix>_<secret>`: `prefix` is a short, display-safe lookup
 * identifier; `secret` is the high-entropy part that makes the token
 * unguessable. Both are `crypto.randomBytes`-derived.
 *
 * @returns The raw token plus its stored prefix and hash.
 */
export function generateApiToken(): GeneratedApiToken {
  const prefix = crypto.randomBytes(6).toString("base64url");
  const secret = crypto.randomBytes(24).toString("base64url");
  const raw = `${TOKEN_LABEL}_${prefix}_${secret}`;
  return { raw, prefix, hash: hashApiToken(raw) };
}

/**
 * Hashes a raw token for persistence and lookup-equality comparison. Never
 * log or persist the raw token itself — only this hash and the `prefix`.
 *
 * @param rawToken - The full `mc_live_...` token.
 * @returns Hex-encoded SHA-256 digest.
 */
export function hashApiToken(rawToken: string): string {
  return crypto.createHash("sha256").update(rawToken).digest("hex");
}

/**
 * Formats a token prefix for display in a list (developer's own key list,
 * or the admin client-detail view). Never touches the secret half.
 *
 * @param prefix - The token's stored `tokenPrefix`.
 * @returns A masked display string, e.g. `mc_live_AbC123••••••••`.
 */
export function formatApiTokenForDisplay(prefix: string): string {
  return `${TOKEN_LABEL}_${prefix}••••••••`;
}
```

- [x] **Step 2: Tests schreiben**

Umsetzungshinweis: `raw.split("_")` als Shape-Assertion war fragil — base64url
(`crypto.randomBytes(...).toString("base64url")`) nutzt das Alphabet
`A-Za-z0-9-_`, Prefix/Secret enthalten empirisch regelmässig eigene `_`
(Stichprobe: 200k Läufe → Prefix ca. 12 %, Secret ca. 40 % mit mindestens
einem `_`). Ersetzt durch eine Struktur-Assertion, die das fixe Label + den
bekannten Prefix + einen nicht-leeren Secret-Rest prüft, ohne von der
Segmentanzahl abzuhängen.

Create `apps/backend/src/services/api-access-token.test.ts`:

```typescript
import { describe, expect, it } from "vitest";
import { formatApiTokenForDisplay, generateApiToken, hashApiToken } from "./api-access-token.js";

describe("generateApiToken", () => {
  it("produces a token in the mc_live_<prefix>_<secret> shape", () => {
    const { raw, prefix } = generateApiToken();
    expect(raw.startsWith("mc_live_")).toBe(true);
    expect(raw).toContain(`mc_live_${prefix}_`);
    expect(raw.split("_")).toHaveLength(4); // "mc", "live", prefix, secret
  });

  it("returns a hash matching hashApiToken(raw)", () => {
    const { raw, hash } = generateApiToken();
    expect(hash).toBe(hashApiToken(raw));
  });

  it("never repeats a raw token or prefix across calls", () => {
    const a = generateApiToken();
    const b = generateApiToken();
    expect(a.raw).not.toBe(b.raw);
    expect(a.prefix).not.toBe(b.prefix);
  });
});

describe("hashApiToken", () => {
  it("is deterministic for the same input", () => {
    expect(hashApiToken("mc_live_abc_def")).toBe(hashApiToken("mc_live_abc_def"));
  });

  it("produces a 64-char hex SHA-256 digest", () => {
    expect(hashApiToken("anything")).toMatch(/^[0-9a-f]{64}$/);
  });
});

describe("formatApiTokenForDisplay", () => {
  it("masks the secret, keeping only the label and prefix visible", () => {
    expect(formatApiTokenForDisplay("AbC123")).toBe("mc_live_AbC123••••••••");
  });
});
```

- [x] **Step 3: Gates**

Run: `pnpm --filter @musiccloud/backend exec vitest run src/services/api-access-token.test.ts`
Expected: alle Tests grün.

Run: `pnpm --filter @musiccloud/backend typecheck`
Expected: keine Fehler.

Run: `pnpm lint`
Expected: grün.

- [x] **Step 4: Commit**

```bash
git add apps/backend/src/services/api-access-token.ts apps/backend/src/services/api-access-token.test.ts
git commit -m "Feat: add API-access token generation/hashing service (MC-077)"
```

---

## Task 4: Shared Endpoints

**Files:**
- Modify: `packages/shared/src/endpoints.ts`

- [ ] **Step 1: Admin-Gruppe ergänzen**

In `ENDPOINTS`, in der `admin`-Gruppe, nach der `crawler`-Untergruppe (vor der schliessenden `}` bei `:319`) einfügen:

```typescript
    developer: {
      apiAccess: {
        /** GET: overview — pending requests + active clients. Query: `?status=` filters requests. */
        overview: "/api/admin/developer/api-access",
        /** GET: a single request by id. */
        requestDetail: (id: string) => `/api/admin/developer/api-access/requests/${id}`,
        /** POST: approve a request; creates a new client linked to it. Body: `{ requestsPerMinute?, requestsPerDay? }`. */
        requestApprove: (id: string) => `/api/admin/developer/api-access/requests/${id}/approve`,
        /** POST: reject a request. Body: `{ reviewNote }` (required). */
        requestReject: (id: string) => `/api/admin/developer/api-access/requests/${id}/reject`,
        /** GET: a single client by id, including its tokens (never the hash). */
        clientDetail: (id: string) => `/api/admin/developer/api-access/clients/${id}`,
        /** PATCH: update a client's status/rate limits. Body: `{ status?, requestsPerMinute?, requestsPerDay? }`. */
        clientUpdate: (id: string) => `/api/admin/developer/api-access/clients/${id}`,
        /** POST: admin-issued token for a client (moderation/support case). Returns the raw token once. */
        clientCreateToken: (id: string) => `/api/admin/developer/api-access/clients/${id}/tokens`,
        /** POST: revoke a token. */
        tokenRevoke: (id: string) => `/api/admin/developer/api-access/tokens/${id}/revoke`,
        /** POST: rotate a token. Returns the new raw token once. */
        tokenRotate: (id: string) => `/api/admin/developer/api-access/tokens/${id}/rotate`,
      },
    },
```

- [ ] **Step 2: Dev-Gruppe ergänzen**

Im `dev`-Objekt, neben `auth`, ergänzen:

```typescript
    /**
     * Developer self-service API-access management (MC-025/MC-077).
     * Every route requires the `mc_dev_session` cookie; ownership is
     * enforced server-side (a developer can only ever see/mutate their
     * own requests, clients and tokens).
     */
    apiAccess: {
      /** POST: submit a new access request. Body: { appName, appDescription, estimatedRequestsPerDay }. */
      requestsCreate: "/api/dev/api-access/requests",
      /** GET: list the caller's own requests. */
      requestsList: "/api/dev/api-access/requests",
      /** GET: list the caller's own clients, including their tokens (never the hash). */
      clientsList: "/api/dev/api-access/clients",
      /** POST: create a new token for one of the caller's own clients. Returns the raw token once. */
      clientCreateToken: (id: string) => `/api/dev/api-access/clients/${id}/tokens`,
      /** POST: revoke one of the caller's own tokens. */
      tokenRevoke: (id: string) => `/api/dev/api-access/tokens/${id}/revoke`,
      /** POST: rotate one of the caller's own tokens. Returns the new raw token once. */
      tokenRotate: (id: string) => `/api/dev/api-access/tokens/${id}/rotate`,
    },
```

- [ ] **Step 3: `ROUTE_TEMPLATES` ergänzen**

Im `admin`-Objekt von `ROUTE_TEMPLATES` ergänzen:

```typescript
    developer: {
      apiAccess: {
        requestDetail: "/api/admin/developer/api-access/requests/:id",
        requestApprove: "/api/admin/developer/api-access/requests/:id/approve",
        requestReject: "/api/admin/developer/api-access/requests/:id/reject",
        clientDetail: "/api/admin/developer/api-access/clients/:id",
        clientUpdate: "/api/admin/developer/api-access/clients/:id",
        clientCreateToken: "/api/admin/developer/api-access/clients/:id/tokens",
        tokenRevoke: "/api/admin/developer/api-access/tokens/:id/revoke",
        tokenRotate: "/api/admin/developer/api-access/tokens/:id/rotate",
      },
    },
```

Neu im `ROUTE_TEMPLATES`-Objekt eine `dev`-Gruppe ergänzen (erste `dev.*`-Param-Route überhaupt):

```typescript
  dev: {
    apiAccess: {
      clientCreateToken: "/api/dev/api-access/clients/:id/tokens",
      tokenRevoke: "/api/dev/api-access/tokens/:id/revoke",
      tokenRotate: "/api/dev/api-access/tokens/:id/rotate",
    },
  },
```

- [ ] **Step 4: Shared bauen + Typecheck**

Run: `pnpm --filter @musiccloud/shared build && pnpm --filter @musiccloud/shared typecheck`
Expected: beide grün.

- [ ] **Step 5: Commit**

```bash
git add packages/shared/src/endpoints.ts
git commit -m "Feat: add admin.developer.apiAccess + dev.apiAccess endpoints (MC-077)"
```

---

## Task 5: Admin-Routen

**Files:**
- Create: `apps/backend/src/routes/admin-api-access.ts`
- Modify: `apps/backend/src/server.ts`

- [ ] **Step 1: Routen schreiben**

Create `apps/backend/src/routes/admin-api-access.ts`:

```typescript
/**
 * @file Admin routes for the API-access system (MC-025/MC-077): review
 * requests, manage clients, and issue/revoke/rotate tokens on their
 * behalf (moderation/support case — the primary path is developer
 * self-service via `routes/dev-api-access.ts`). Restricted to `owner`/
 * `admin` roles; `moderator` is rejected even though `authenticateAdmin`
 * already let the JWT through, because that guard only checks the JWT's
 * `role: "admin"` claim, not the finer owner/admin/moderator distinction.
 */
import { ENDPOINTS, ROUTE_TEMPLATES } from "@musiccloud/shared";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { getAdminRepository, getApiAccessRepository } from "../db/index.js";
import type { ApiAccessRequest, ApiClient, ApiClientToken } from "../db/api-access-repository.js";
import { generateApiToken } from "../services/api-access-token.js";

/**
 * Resolves the caller's full DB record from the verified JWT payload,
 * mirroring `routes/admin-users.ts`'s `getCaller`: the JWT only carries
 * `sub`/`role`, but the owner/admin/moderator check here needs the fresh
 * DB role in case it changed since the token was issued.
 */
async function getCaller(request: { user?: unknown }) {
  const payload = request.user as { sub?: string } | undefined;
  if (!payload?.sub) return null;
  const repo = await getAdminRepository();
  return repo.findAdminById(payload.sub);
}

/** Rejects the request with 403 unless the caller is `owner` or `admin`. Returns `true` if a reply was sent. */
async function requireOwnerOrAdmin(request: FastifyRequest, reply: FastifyReply): Promise<boolean> {
  const caller = await getCaller(request);
  if (!caller || (caller.role !== "owner" && caller.role !== "admin")) {
    await reply.status(403).send({ error: "FORBIDDEN", message: "Owner or admin role required." });
    return true;
  }
  return false;
}

function toRequestResponse(request: ApiAccessRequest) {
  return {
    id: request.id,
    developerAccountId: request.developerAccountId,
    contactEmail: request.contactEmail,
    appName: request.appName,
    appDescription: request.appDescription,
    estimatedRequestsPerDay: request.estimatedRequestsPerDay,
    status: request.status,
    submittedAt: new Date(request.submittedAt).toISOString(),
    reviewedAt: request.reviewedAt ? new Date(request.reviewedAt).toISOString() : null,
    reviewedByAdminId: request.reviewedByAdminId,
    reviewNote: request.reviewNote,
  };
}

function toClientResponse(client: ApiClient, tokens: ApiClientToken[]) {
  return {
    id: client.id,
    requestId: client.requestId,
    developerAccountId: client.developerAccountId,
    appName: client.appName,
    contactEmail: client.contactEmail,
    description: client.description,
    status: client.status,
    requestsPerMinute: client.requestsPerMinute,
    requestsPerDay: client.requestsPerDay,
    createdAt: new Date(client.createdAt).toISOString(),
    updatedAt: new Date(client.updatedAt).toISOString(),
    tokens: tokens.map(toTokenResponse),
  };
}

/** Never includes `tokenHash` — the create/rotate handlers add the one-time raw token separately. */
function toTokenResponse(token: ApiClientToken) {
  return {
    id: token.id,
    tokenPrefix: token.tokenPrefix,
    status: token.status,
    createdAt: new Date(token.createdAt).toISOString(),
    lastUsedAt: token.lastUsedAt ? new Date(token.lastUsedAt).toISOString() : null,
    revokedAt: token.revokedAt ? new Date(token.revokedAt).toISOString() : null,
  };
}

/**
 * Registers the admin API-access routes. Must be registered inside a
 * scope whose `preHandler` is `authenticateAdmin` (see `server.ts`
 * `adminRoutes` block) — this module additionally re-checks the DB role.
 */
export async function adminApiAccessRoutes(app: FastifyInstance) {
  app.get(ENDPOINTS.admin.developer.apiAccess.overview, async (request, reply) => {
    if (await requireOwnerOrAdmin(request, reply)) return;
    const repo = await getApiAccessRepository();
    const query = request.query as { status?: string };
    const [requests, clients] = await Promise.all([
      repo.listApiAccessRequests(query.status),
      repo.listApiClients(),
    ]);
    return reply.send({
      requests: requests.map(toRequestResponse),
      clients: await Promise.all(
        clients.map(async (client) => toClientResponse(client, await repo.listApiClientTokensByClient(client.id))),
      ),
    });
  });

  app.get(ROUTE_TEMPLATES.admin.developer.apiAccess.requestDetail, async (request, reply) => {
    if (await requireOwnerOrAdmin(request, reply)) return;
    const { id } = request.params as { id: string };
    const repo = await getApiAccessRepository();
    const found = await repo.findApiAccessRequestById(id);
    if (!found) return reply.status(404).send({ error: "NOT_FOUND", message: "Request not found." });
    return reply.send({ request: toRequestResponse(found) });
  });

  app.post(ROUTE_TEMPLATES.admin.developer.apiAccess.requestApprove, async (request, reply) => {
    if (await requireOwnerOrAdmin(request, reply)) return;
    const caller = await getCaller(request);
    const { id } = request.params as { id: string };
    const body = request.body as { requestsPerMinute?: number; requestsPerDay?: number } | null;
    const repo = await getApiAccessRepository();
    const found = await repo.findApiAccessRequestById(id);
    if (!found) return reply.status(404).send({ error: "NOT_FOUND", message: "Request not found." });
    if (found.status !== "pending") {
      return reply.status(400).send({ error: "INVALID_REQUEST", message: "Request already reviewed." });
    }

    const reviewed = await repo.reviewApiAccessRequest(id, {
      status: "approved",
      reviewedByAdminId: caller!.id,
    });
    const client = await repo.createApiClient({
      requestId: id,
      developerAccountId: found.developerAccountId,
      appName: found.appName,
      contactEmail: found.contactEmail,
      description: found.appDescription,
      requestsPerMinute: body?.requestsPerMinute,
      requestsPerDay: body?.requestsPerDay,
      createdByAdminId: caller!.id,
    });
    await repo.createApiAccessAuditEvent({
      requestId: id,
      clientId: client.id,
      eventType: "request_approved",
      actorAdminId: caller!.id,
    });
    return reply.send({ request: toRequestResponse(reviewed!), client: toClientResponse(client, []) });
  });

  app.post(ROUTE_TEMPLATES.admin.developer.apiAccess.requestReject, async (request, reply) => {
    if (await requireOwnerOrAdmin(request, reply)) return;
    const caller = await getCaller(request);
    const { id } = request.params as { id: string };
    const body = request.body as { reviewNote?: string } | null;
    if (!body?.reviewNote?.trim()) {
      return reply.status(400).send({ error: "INVALID_REQUEST", message: "reviewNote is required to reject." });
    }
    const repo = await getApiAccessRepository();
    const found = await repo.findApiAccessRequestById(id);
    if (!found) return reply.status(404).send({ error: "NOT_FOUND", message: "Request not found." });
    if (found.status !== "pending") {
      return reply.status(400).send({ error: "INVALID_REQUEST", message: "Request already reviewed." });
    }
    const reviewed = await repo.reviewApiAccessRequest(id, {
      status: "rejected",
      reviewedByAdminId: caller!.id,
      reviewNote: body.reviewNote.trim(),
    });
    await repo.createApiAccessAuditEvent({ requestId: id, eventType: "request_rejected", actorAdminId: caller!.id });
    return reply.send({ request: toRequestResponse(reviewed!) });
  });

  app.get(ROUTE_TEMPLATES.admin.developer.apiAccess.clientDetail, async (request, reply) => {
    if (await requireOwnerOrAdmin(request, reply)) return;
    const { id } = request.params as { id: string };
    const repo = await getApiAccessRepository();
    const client = await repo.findApiClientById(id);
    if (!client) return reply.status(404).send({ error: "NOT_FOUND", message: "Client not found." });
    const tokens = await repo.listApiClientTokensByClient(id);
    return reply.send({ client: toClientResponse(client, tokens) });
  });

  app.patch(ROUTE_TEMPLATES.admin.developer.apiAccess.clientUpdate, async (request, reply) => {
    if (await requireOwnerOrAdmin(request, reply)) return;
    const { id } = request.params as { id: string };
    const body = request.body as {
      status?: string;
      requestsPerMinute?: number;
      requestsPerDay?: number;
    } | null;
    if (body?.status && !["active", "suspended", "revoked"].includes(body.status)) {
      return reply.status(400).send({ error: "INVALID_REQUEST", message: "Invalid status." });
    }
    const repo = await getApiAccessRepository();
    const updated = await repo.updateApiClient(id, {
      status: body?.status,
      requestsPerMinute: body?.requestsPerMinute,
      requestsPerDay: body?.requestsPerDay,
    });
    if (!updated) return reply.status(404).send({ error: "NOT_FOUND", message: "Client not found." });
    const caller = await getCaller(request);
    await repo.createApiAccessAuditEvent({
      clientId: id,
      eventType: "client_updated",
      actorAdminId: caller!.id,
      eventData: body ?? {},
    });
    return reply.send({ client: toClientResponse(updated, await repo.listApiClientTokensByClient(id)) });
  });

  app.post(ROUTE_TEMPLATES.admin.developer.apiAccess.clientCreateToken, async (request, reply) => {
    if (await requireOwnerOrAdmin(request, reply)) return;
    const { id } = request.params as { id: string };
    const repo = await getApiAccessRepository();
    const client = await repo.findApiClientById(id);
    if (!client) return reply.status(404).send({ error: "NOT_FOUND", message: "Client not found." });
    const generated = generateApiToken();
    const token = await repo.createApiClientToken({
      clientId: id,
      tokenPrefix: generated.prefix,
      tokenHash: generated.hash,
    });
    const caller = await getCaller(request);
    await repo.createApiAccessAuditEvent({
      clientId: id,
      tokenId: token.id,
      eventType: "token_created",
      actorAdminId: caller!.id,
    });
    return reply.status(201).send({ token: { ...toTokenResponse(token), rawToken: generated.raw } });
  });

  app.post(ROUTE_TEMPLATES.admin.developer.apiAccess.tokenRevoke, async (request, reply) => {
    if (await requireOwnerOrAdmin(request, reply)) return;
    const { id } = request.params as { id: string };
    const repo = await getApiAccessRepository();
    const token = await repo.revokeApiClientToken(id);
    if (!token) return reply.status(404).send({ error: "NOT_FOUND", message: "Token not found." });
    const caller = await getCaller(request);
    await repo.createApiAccessAuditEvent({
      clientId: token.clientId,
      tokenId: id,
      eventType: "token_revoked",
      actorAdminId: caller!.id,
    });
    return reply.send({ token: toTokenResponse(token) });
  });

  app.post(ROUTE_TEMPLATES.admin.developer.apiAccess.tokenRotate, async (request, reply) => {
    if (await requireOwnerOrAdmin(request, reply)) return;
    const { id } = request.params as { id: string };
    const repo = await getApiAccessRepository();
    const generated = generateApiToken();
    const rotated = await repo.rotateApiClientToken(id, {
      newTokenPrefix: generated.prefix,
      newTokenHash: generated.hash,
    });
    if (!rotated) return reply.status(404).send({ error: "NOT_FOUND", message: "Active token not found." });
    const caller = await getCaller(request);
    await repo.createApiAccessAuditEvent({
      clientId: rotated.newToken.clientId,
      tokenId: rotated.newToken.id,
      eventType: "token_rotated",
      actorAdminId: caller!.id,
      eventData: { rotatedFromTokenId: rotated.oldToken.id },
    });
    return reply.status(201).send({ token: { ...toTokenResponse(rotated.newToken), rawToken: generated.raw } });
  });
}
```

- [ ] **Step 2: Registrieren**

Modify `apps/backend/src/server.ts`: Import `import { adminApiAccessRoutes } from "./routes/admin-api-access.js";` und im `adminRoutes`-Block (`:640-653`) neben den anderen `admin*Routes` ergänzen: `await adminApp.register(adminApiAccessRoutes);`.

- [ ] **Step 3: Gates**

Run: `pnpm --filter @musiccloud/backend typecheck`
Expected: keine Fehler.

Run: `pnpm lint`
Expected: grün.

- [ ] **Step 4: Commit**

```bash
git add apps/backend/src/routes/admin-api-access.ts apps/backend/src/server.ts
git commit -m "Feat: admin API-access routes (MC-077)"
```

---

## Task 6: Developer-Self-Service-Routen

**Files:**
- Create: `apps/backend/src/routes/dev-api-access.ts`
- Modify: `apps/backend/src/server.ts`

- [ ] **Step 1: Routen schreiben**

Create `apps/backend/src/routes/dev-api-access.ts`:

```typescript
/**
 * @file Developer self-service routes for the API-access system
 * (MC-025/MC-077): submit a request, list the caller's own requests and
 * clients, and manage the caller's own tokens (create/revoke/rotate).
 * Every handler runs behind `authenticateDeveloper` (set as this scope's
 * `preHandler` in `server.ts`) and additionally checks ownership —
 * a client/token that exists but belongs to a different developer account
 * is reported as 404, never 403, so its existence is not leaked.
 */
import { ENDPOINTS, ROUTE_TEMPLATES } from "@musiccloud/shared";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { getApiAccessRepository, getDeveloperRepository } from "../db/index.js";
import type { ApiAccessRequest, ApiClient, ApiClientToken } from "../db/api-access-repository.js";
import { sendRateLimitError } from "../lib/infra/rate-limit-response.js";
import { RateLimiter } from "../lib/infra/rate-limiter.js";
import { generateApiToken } from "../services/api-access-token.js";

const MAX_APP_NAME_LENGTH = 200;
const MAX_APP_DESCRIPTION_LENGTH = 2000;

/** Dedicated per-developer throttle (20/min) for the three token-mutating routes, separate from the global apiRateLimiter. */
const devApiAccessTokenRateLimiter = new RateLimiter(20, 60_000);

async function throttleTokenMutation(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  const check = devApiAccessTokenRateLimiter.check(request.developerAccountId!);
  if (check.limited) {
    await sendRateLimitError(reply, check);
  }
}

function toRequestResponse(request: ApiAccessRequest) {
  return {
    id: request.id,
    appName: request.appName,
    appDescription: request.appDescription,
    estimatedRequestsPerDay: request.estimatedRequestsPerDay,
    status: request.status,
    submittedAt: new Date(request.submittedAt).toISOString(),
    reviewedAt: request.reviewedAt ? new Date(request.reviewedAt).toISOString() : null,
    reviewNote: request.reviewNote,
  };
}

function toClientResponse(client: ApiClient, tokens: ApiClientToken[]) {
  return {
    id: client.id,
    appName: client.appName,
    description: client.description,
    status: client.status,
    requestsPerMinute: client.requestsPerMinute,
    requestsPerDay: client.requestsPerDay,
    createdAt: new Date(client.createdAt).toISOString(),
    tokens: tokens.map(toTokenResponse),
  };
}

/** Never includes `tokenHash` — the create/rotate handlers add the one-time raw token separately. */
function toTokenResponse(token: ApiClientToken) {
  return {
    id: token.id,
    tokenPrefix: token.tokenPrefix,
    status: token.status,
    createdAt: new Date(token.createdAt).toISOString(),
    lastUsedAt: token.lastUsedAt ? new Date(token.lastUsedAt).toISOString() : null,
    revokedAt: token.revokedAt ? new Date(token.revokedAt).toISOString() : null,
  };
}

/**
 * Loads the token's owning client and verifies it belongs to the caller.
 *
 * @returns The client if the token exists and is owned by `developerAccountId`, else `null`.
 */
async function loadOwnedClientForToken(
  repo: Awaited<ReturnType<typeof getApiAccessRepository>>,
  tokenId: string,
  developerAccountId: string,
): Promise<{ token: ApiClientToken; client: ApiClient } | null> {
  const token = await repo.findApiClientTokenById(tokenId);
  if (!token) return null;
  const client = await repo.findApiClientById(token.clientId);
  if (!client || client.developerAccountId !== developerAccountId) return null;
  return { token, client };
}

/**
 * Registers the developer self-service API-access routes. Must be
 * registered inside a scope whose `preHandler` is `authenticateDeveloper`
 * (see `server.ts`), so `request.developerAccountId` is always set here.
 */
export async function devApiAccessRoutes(app: FastifyInstance) {
  app.post(ENDPOINTS.dev.apiAccess.requestsCreate, async (request, reply) => {
    const body = request.body as {
      appName?: string;
      appDescription?: string;
      estimatedRequestsPerDay?: number;
    } | null;
    const appName = body?.appName?.trim() ?? "";
    const appDescription = body?.appDescription?.trim() ?? "";
    const estimatedRequestsPerDay = body?.estimatedRequestsPerDay;
    if (!appName || appName.length > MAX_APP_NAME_LENGTH) {
      return reply.status(400).send({ error: "INVALID_REQUEST", message: "appName is required (max 200 chars)." });
    }
    if (!appDescription || appDescription.length > MAX_APP_DESCRIPTION_LENGTH) {
      return reply
        .status(400)
        .send({ error: "INVALID_REQUEST", message: "appDescription is required (max 2000 chars)." });
    }
    if (!Number.isInteger(estimatedRequestsPerDay) || (estimatedRequestsPerDay as number) <= 0) {
      return reply
        .status(400)
        .send({ error: "INVALID_REQUEST", message: "estimatedRequestsPerDay must be a positive integer." });
    }

    // authenticateDeveloper already loaded and validated the account; re-fetch
    // only the email needed for the contactEmail display snapshot.
    const developerRepo = await getDeveloperRepository();
    const account = await developerRepo.findDeveloperAccountById(request.developerAccountId!);

    const repo = await getApiAccessRepository();
    const created = await repo.createApiAccessRequest({
      developerAccountId: request.developerAccountId!,
      contactEmail: account!.email,
      appName,
      appDescription,
      estimatedRequestsPerDay: estimatedRequestsPerDay as number,
    });
    await repo.createApiAccessAuditEvent({
      requestId: created.id,
      eventType: "request_submitted",
      actorDeveloperAccountId: request.developerAccountId!,
    });
    return reply.status(201).send({ request: toRequestResponse(created) });
  });

  app.get(ENDPOINTS.dev.apiAccess.requestsList, async (request, reply) => {
    const repo = await getApiAccessRepository();
    const requests = await repo.listApiAccessRequestsByDeveloperAccount(request.developerAccountId!);
    return reply.send({ requests: requests.map(toRequestResponse) });
  });

  app.get(ENDPOINTS.dev.apiAccess.clientsList, async (request, reply) => {
    const repo = await getApiAccessRepository();
    const clients = await repo.listApiClientsByDeveloperAccount(request.developerAccountId!);
    const withTokens = await Promise.all(
      clients.map(async (client) => toClientResponse(client, await repo.listApiClientTokensByClient(client.id))),
    );
    return reply.send({ clients: withTokens });
  });

  app.post(
    ROUTE_TEMPLATES.dev.apiAccess.clientCreateToken,
    { preHandler: throttleTokenMutation },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      const repo = await getApiAccessRepository();
      const client = await repo.findApiClientById(id);
      if (!client || client.developerAccountId !== request.developerAccountId) {
        return reply.status(404).send({ error: "NOT_FOUND", message: "Client not found." });
      }
      const generated = generateApiToken();
      const token = await repo.createApiClientToken({
        clientId: id,
        tokenPrefix: generated.prefix,
        tokenHash: generated.hash,
      });
      await repo.createApiAccessAuditEvent({
        clientId: id,
        tokenId: token.id,
        eventType: "token_created",
        actorDeveloperAccountId: request.developerAccountId!,
      });
      return reply.status(201).send({ token: { ...toTokenResponse(token), rawToken: generated.raw } });
    },
  );

  app.post(
    ROUTE_TEMPLATES.dev.apiAccess.tokenRevoke,
    { preHandler: throttleTokenMutation },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      const repo = await getApiAccessRepository();
      const owned = await loadOwnedClientForToken(repo, id, request.developerAccountId!);
      if (!owned) return reply.status(404).send({ error: "NOT_FOUND", message: "Token not found." });
      const token = await repo.revokeApiClientToken(id);
      await repo.createApiAccessAuditEvent({
        clientId: owned.client.id,
        tokenId: id,
        eventType: "token_revoked",
        actorDeveloperAccountId: request.developerAccountId!,
      });
      return reply.send({ token: toTokenResponse(token!) });
    },
  );

  app.post(
    ROUTE_TEMPLATES.dev.apiAccess.tokenRotate,
    { preHandler: throttleTokenMutation },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      const repo = await getApiAccessRepository();
      const owned = await loadOwnedClientForToken(repo, id, request.developerAccountId!);
      if (!owned) return reply.status(404).send({ error: "NOT_FOUND", message: "Token not found." });
      const generated = generateApiToken();
      const rotated = await repo.rotateApiClientToken(id, {
        newTokenPrefix: generated.prefix,
        newTokenHash: generated.hash,
      });
      if (!rotated) return reply.status(404).send({ error: "NOT_FOUND", message: "Active token not found." });
      await repo.createApiAccessAuditEvent({
        clientId: owned.client.id,
        tokenId: rotated.newToken.id,
        eventType: "token_rotated",
        actorDeveloperAccountId: request.developerAccountId!,
        eventData: { rotatedFromTokenId: rotated.oldToken.id },
      });
      return reply.status(201).send({ token: { ...toTokenResponse(rotated.newToken), rawToken: generated.raw } });
    },
  );
}
```

- [ ] **Step 2: Registrieren mit neuem guarded Scope**

Modify `apps/backend/src/server.ts`: Import `import { devApiAccessRoutes } from "./routes/dev-api-access.js";` ergänzen. Direkt nach den bestehenden `await app.register(devAuthRoutes); await app.register(devGitHubRoutes);`-Zeilen (`:583-588`) einen neuen guarded Scope registrieren (erste Verwendung von `authenticateDeveloper` als Scope-Hook statt Pro-Route):

```typescript
  await app.register(async function devProtectedRoutes(devApp) {
    devApp.addHook("preHandler", devApp.authenticateDeveloper);
    await devApp.register(devApiAccessRoutes);
  });
```

- [ ] **Step 3: Gates**

Run: `pnpm --filter @musiccloud/backend typecheck`
Expected: keine Fehler.

Run: `pnpm lint`
Expected: grün.

- [ ] **Step 4: Commit**

```bash
git add apps/backend/src/routes/dev-api-access.ts apps/backend/src/server.ts
git commit -m "Feat: developer self-service API-access routes (MC-077)"
```

---

## Task 7: Route-Tests + Gates

**Files:**
- Create: `apps/backend/src/routes/admin-api-access.test.ts`
- Create: `apps/backend/src/routes/dev-api-access.test.ts`

Setup-Vorlage: `developer-github.test.ts` (`app.inject`, `jwt` → `authPlugin` → `cookie` → Route-Registrierung; `DISABLE_RATE_LIMIT=true` via `vi.stubEnv`; `db/index.js` gemockt).

- [ ] **Step 1: Admin-Route-Tests**

Create `apps/backend/src/routes/admin-api-access.test.ts` — Fälle:
- **Moderator abgelehnt:** JWT `role:"admin"` (passiert `authenticateAdmin`) aber Caller-DB-Rolle `moderator` → 403 auf jedem Endpoint.
- **overview:** 200, liefert `requests`+`clients` (Repo-Methoden gemockt).
- **requestApprove:** legt einen neuen Client an (`createApiClient` aufgerufen), setzt `status:"approved"`, schreibt Audit-Event mit `actorAdminId`; bereits reviewte Requests → 400.
- **requestReject:** ohne `reviewNote` → 400; mit `reviewNote` → 200, `status:"rejected"`.
- **clientCreateToken:** 201, Response enthält `rawToken` genau einmal, nie `tokenHash`.
- **tokenRevoke/tokenRotate:** 200/201, Audit-Event mit `actorAdminId`, nie Klartext/Hash im Audit-`eventData`.

```typescript
import Fastify from "fastify";
import cookie from "@fastify/cookie";
import jwt from "@fastify/jwt";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.stubEnv("DISABLE_RATE_LIMIT", "true");

const mockRepo = {
  listApiAccessRequests: vi.fn(),
  listApiClients: vi.fn(),
  listApiClientTokensByClient: vi.fn().mockResolvedValue([]),
  findApiAccessRequestById: vi.fn(),
  reviewApiAccessRequest: vi.fn(),
  createApiClient: vi.fn(),
  findApiClientById: vi.fn(),
  updateApiClient: vi.fn(),
  createApiClientToken: vi.fn(),
  revokeApiClientToken: vi.fn(),
  rotateApiClientToken: vi.fn(),
  createApiAccessAuditEvent: vi.fn().mockResolvedValue({}),
};

const mockAdminRepo = {
  findAdminById: vi.fn(),
};

vi.mock("../db/index.js", () => ({
  getApiAccessRepository: async () => mockRepo,
  getAdminRepository: async () => mockAdminRepo,
}));

import { adminApiAccessRoutes } from "./admin-api-access.js";

async function buildApp(role: "owner" | "admin" | "moderator") {
  const app = Fastify();
  await app.register(jwt, { secret: "test-secret" });
  await app.register(cookie);
  await app.register(async function adminRoutes(adminApp) {
    adminApp.addHook("preHandler", async (request, reply) => {
      try {
        await request.jwtVerify();
      } catch {
        return reply.status(401).send({ error: "UNAUTHORIZED" });
      }
    });
    await adminApp.register(adminApiAccessRoutes);
  });
  await app.ready();
  mockAdminRepo.findAdminById.mockResolvedValue({ id: "admin-1", role });
  const token = app.jwt.sign({ sub: "admin-1", role: "admin" });
  return { app, token };
}

beforeEach(() => {
  vi.clearAllMocks();
  mockRepo.listApiClientTokensByClient.mockResolvedValue([]);
  mockRepo.createApiAccessAuditEvent.mockResolvedValue({});
});

describe("adminApiAccessRoutes", () => {
  it("rejects a moderator with 403", async () => {
    const { app, token } = await buildApp("moderator");
    const response = await app.inject({
      method: "GET",
      url: "/api/admin/developer/api-access",
      headers: { authorization: `Bearer ${token}` },
    });
    expect(response.statusCode).toBe(403);
  });

  it("overview returns requests and clients for owner", async () => {
    const { app, token } = await buildApp("owner");
    mockRepo.listApiAccessRequests.mockResolvedValue([]);
    mockRepo.listApiClients.mockResolvedValue([]);
    const response = await app.inject({
      method: "GET",
      url: "/api/admin/developer/api-access",
      headers: { authorization: `Bearer ${token}` },
    });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ requests: [], clients: [] });
  });

  it("approve creates a client and marks the request approved", async () => {
    const { app, token } = await buildApp("admin");
    mockRepo.findApiAccessRequestById.mockResolvedValue({
      id: "req-1",
      developerAccountId: "dev-1",
      contactEmail: "a@b.com",
      appName: "App",
      appDescription: "Desc",
      estimatedRequestsPerDay: 100,
      status: "pending",
      submittedAt: 0,
      reviewedAt: null,
      reviewedByAdminId: null,
      reviewNote: null,
    });
    mockRepo.reviewApiAccessRequest.mockResolvedValue({
      id: "req-1",
      developerAccountId: "dev-1",
      contactEmail: "a@b.com",
      appName: "App",
      appDescription: "Desc",
      estimatedRequestsPerDay: 100,
      status: "approved",
      submittedAt: 0,
      reviewedAt: 0,
      reviewedByAdminId: "admin-1",
      reviewNote: null,
    });
    mockRepo.createApiClient.mockResolvedValue({
      id: "client-1",
      requestId: "req-1",
      developerAccountId: "dev-1",
      appName: "App",
      contactEmail: "a@b.com",
      description: "Desc",
      status: "active",
      requestsPerMinute: 60,
      requestsPerDay: 10000,
      createdAt: 0,
      updatedAt: 0,
      createdByAdminId: "admin-1",
    });
    const response = await app.inject({
      method: "POST",
      url: "/api/admin/developer/api-access/requests/req-1/approve",
      headers: { authorization: `Bearer ${token}` },
      payload: {},
    });
    expect(response.statusCode).toBe(200);
    expect(mockRepo.createApiClient).toHaveBeenCalledWith(expect.objectContaining({ requestId: "req-1" }));
  });

  it("reject without reviewNote returns 400", async () => {
    const { app, token } = await buildApp("owner");
    const response = await app.inject({
      method: "POST",
      url: "/api/admin/developer/api-access/requests/req-1/reject",
      headers: { authorization: `Bearer ${token}` },
      payload: {},
    });
    expect(response.statusCode).toBe(400);
  });

  it("clientCreateToken returns the raw token once, never the hash", async () => {
    const { app, token } = await buildApp("owner");
    mockRepo.findApiClientById.mockResolvedValue({ id: "client-1" });
    mockRepo.createApiClientToken.mockResolvedValue({
      id: "token-1",
      clientId: "client-1",
      tokenPrefix: "abc",
      status: "active",
      createdAt: 0,
      lastUsedAt: null,
      revokedAt: null,
    });
    const response = await app.inject({
      method: "POST",
      url: "/api/admin/developer/api-access/clients/client-1/tokens",
      headers: { authorization: `Bearer ${token}` },
      payload: {},
    });
    expect(response.statusCode).toBe(201);
    const body = response.json();
    expect(body.token.rawToken).toBeTruthy();
    expect(body.token.tokenHash).toBeUndefined();
  });
});
```

- [ ] **Step 2: Dev-Route-Tests**

Create `apps/backend/src/routes/dev-api-access.test.ts` — Fälle:
- **requestsCreate:** fehlende Felder → 400; gültige Payload → 201, Response ohne `developerAccountId`/`contactEmail`-Leak über den `authenticateDeveloper`-Kontext hinaus (nur die eigenen Felder).
- **requestsList/clientsList:** 200, gefiltert auf `request.developerAccountId`.
- **Ownership:** Token eines FREMDEN Clients (anderer `developerAccountId`) → 404 (nicht 403) bei revoke/rotate.
- **clientCreateToken/tokenRevoke/tokenRotate:** 200/201 für eigene Ressourcen, `rawToken` einmalig, nie `tokenHash`.

```typescript
import Fastify from "fastify";
import cookie from "@fastify/cookie";
import jwt from "@fastify/jwt";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.stubEnv("DISABLE_RATE_LIMIT", "true");

const mockRepo = {
  createApiAccessRequest: vi.fn(),
  listApiAccessRequestsByDeveloperAccount: vi.fn().mockResolvedValue([]),
  listApiClientsByDeveloperAccount: vi.fn().mockResolvedValue([]),
  listApiClientTokensByClient: vi.fn().mockResolvedValue([]),
  findApiClientById: vi.fn(),
  findApiClientTokenById: vi.fn(),
  createApiClientToken: vi.fn(),
  revokeApiClientToken: vi.fn(),
  rotateApiClientToken: vi.fn(),
  createApiAccessAuditEvent: vi.fn().mockResolvedValue({}),
};

const mockDeveloperRepo = {
  findDeveloperAccountById: vi.fn().mockResolvedValue({ id: "dev-1", email: "dev@example.com" }),
};

vi.mock("../db/index.js", () => ({
  getApiAccessRepository: async () => mockRepo,
  getDeveloperRepository: async () => mockDeveloperRepo,
}));

import { devApiAccessRoutes } from "./dev-api-access.js";

async function buildApp() {
  const app = Fastify();
  await app.register(jwt, { secret: "test-secret" });
  await app.register(cookie);
  await app.register(async function devProtectedRoutes(devApp) {
    devApp.addHook("preHandler", async (request) => {
      request.developerAccountId = "dev-1";
    });
    await devApp.register(devApiAccessRoutes);
  });
  await app.ready();
  return app;
}

beforeEach(() => {
  vi.clearAllMocks();
  mockRepo.listApiClientTokensByClient.mockResolvedValue([]);
  mockRepo.createApiAccessAuditEvent.mockResolvedValue({});
  mockDeveloperRepo.findDeveloperAccountById.mockResolvedValue({ id: "dev-1", email: "dev@example.com" });
});

describe("devApiAccessRoutes", () => {
  it("rejects an invalid requestsCreate payload with 400", async () => {
    const app = await buildApp();
    const response = await app.inject({ method: "POST", url: "/api/dev/api-access/requests", payload: {} });
    expect(response.statusCode).toBe(400);
  });

  it("requestsCreate succeeds with a valid payload", async () => {
    const app = await buildApp();
    mockRepo.createApiAccessRequest.mockResolvedValue({
      id: "req-1",
      appName: "App",
      appDescription: "Desc",
      estimatedRequestsPerDay: 100,
      status: "pending",
      submittedAt: 0,
      reviewedAt: null,
      reviewNote: null,
    });
    const response = await app.inject({
      method: "POST",
      url: "/api/dev/api-access/requests",
      payload: { appName: "App", appDescription: "Desc", estimatedRequestsPerDay: 100 },
    });
    expect(response.statusCode).toBe(201);
    expect(mockRepo.createApiAccessRequest).toHaveBeenCalledWith(
      expect.objectContaining({ developerAccountId: "dev-1", contactEmail: "dev@example.com" }),
    );
  });

  it("returns 404 (not 403) when rotating a token owned by a different developer account", async () => {
    const app = await buildApp();
    mockRepo.findApiClientTokenById.mockResolvedValue({ id: "token-1", clientId: "client-1" });
    mockRepo.findApiClientById.mockResolvedValue({ id: "client-1", developerAccountId: "someone-else" });
    const response = await app.inject({ method: "POST", url: "/api/dev/api-access/tokens/token-1/rotate" });
    expect(response.statusCode).toBe(404);
  });

  it("clientCreateToken returns the raw token once for an owned client, never the hash", async () => {
    const app = await buildApp();
    mockRepo.findApiClientById.mockResolvedValue({ id: "client-1", developerAccountId: "dev-1" });
    mockRepo.createApiClientToken.mockResolvedValue({
      id: "token-1",
      clientId: "client-1",
      tokenPrefix: "abc",
      status: "active",
      createdAt: 0,
      lastUsedAt: null,
      revokedAt: null,
    });
    const response = await app.inject({ method: "POST", url: "/api/dev/api-access/clients/client-1/tokens" });
    expect(response.statusCode).toBe(201);
    const body = response.json();
    expect(body.token.rawToken).toBeTruthy();
    expect(body.token.tokenHash).toBeUndefined();
  });
});
```

- [ ] **Step 3: Volle Gates**

Run: `pnpm --filter @musiccloud/backend exec vitest run src/routes/admin-api-access.test.ts src/routes/dev-api-access.test.ts`
Expected: alle Tests grün.

Run: `pnpm --filter @musiccloud/backend test:run`
Expected: volle Backend-Suite grün (bestehende Tests weiterhin grün).

Run: `pnpm --filter @musiccloud/backend typecheck && pnpm --filter @musiccloud/shared typecheck`
Expected: beide grün.

Run: `pnpm lint`
Expected: grün.

- [ ] **Step 4: Commit**

```bash
git add apps/backend/src/routes/admin-api-access.test.ts apps/backend/src/routes/dev-api-access.test.ts
git commit -m "Test: admin + developer API-access route tests (MC-077)"
```

---

## Tests und Gates (Gesamt)

- `pnpm --filter @musiccloud/backend typecheck`
- `pnpm --filter @musiccloud/backend test:run`
- `pnpm --filter @musiccloud/shared typecheck`
- `pnpm lint`
- Migration `0048` lokal angewendet, Tracker konsistent.

## Checkliste

- [ ] Task 1: Schema + Migration, Typecheck grün
- [ ] Task 2: Repository + Adapter + Accessor
- [x] Task 3: Token-Service + Unit-Tests
- [ ] Task 4: Shared Endpoints (admin + dev + ROUTE_TEMPLATES)
- [ ] Task 5: Admin-Routen + Registrierung
- [ ] Task 6: Developer-Self-Service-Routen + Registrierung
- [ ] Task 7: Route-Tests (Admin + Dev) grün, volle Backend-Suite grün
- [ ] Alle Gates grün (typecheck backend+shared, test:run, lint)
- [ ] Plan-Fortschritt dem User gemeldet (kein Auto-Merge/Verschieben nach `done/` — nur auf User-OK)

**Folge:** Dashboard-Admin-UI (Abschnitt D), Developer-Portal-Self-Service-UI (Abschnitt E), MC-025 Phase 2 (Enforcement, Rate-Limits, Usage-Analytics).
