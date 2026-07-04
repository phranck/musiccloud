# Dashboard Developer-Management – Backend & Foundation

Plan-Nr.: MC-090

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Backend-Endpoints + Shared-Types + Dashboard-Foundation für das Developer-Management im Admin-Dashboard bereitstellen.

**Architecture:** Neuer `listDeveloperAccounts()`-Repository-Method + Route, Stats-Erweiterung, Shared-Endpoints, Dashboard-Types/i18n/API-Client. Nach diesem Plan sind alle Daten-Endpoints per curl testbar und die Dashboard-Foundation (Typen, i18n, API-Client) steht.

**Tech Stack:** TypeScript, Drizzle ORM (Postgres), Fastify, React, React Query, Phosphor Icons

**Spec:** `docs/superpowers/specs/2026-07-04-dashboard-developer-management-design.md`

---

### Task 1: `listDeveloperAccounts()` – Repository-Interface + Postgres-Adapter

**Files:**
- Modify: `apps/backend/src/db/developer-repository.ts` (Interface)
- Modify: `apps/backend/src/db/adapters/postgres-developer.ts` (Adapter)

- [ ] **Step 1: Interface-Methode hinzufügen**

In `DeveloperRepository`-Interface nach `findDeveloperAccountByEmail` einfügen (nach Zeile 136):

```ts
/**
 * Lists all developer accounts ordered by creation time (newest first).
 * Includes the count of active API clients each account owns for the
 * dashboard overview.
 *
 * @returns Array of account DTOs, each extended with `clientCount`.
 */
listDeveloperAccounts(): Promise<(DeveloperAccount & { clientCount: number })[]>;
```

- [ ] **Step 2: Postgres-Adapter-Implementierung**

In `postgres-developer.ts` neue Export-Funktion nach `findDeveloperAccountByEmail` einfügen:

```ts
export async function listDeveloperAccounts(pool: Pool): Promise<(DeveloperAccount & { clientCount: number })[]> {
  const result = await pool.query(
    `SELECT da.*, COUNT(ac.id)::int AS client_count
     FROM developer_accounts da
     LEFT JOIN api_clients ac ON ac.developer_account_id = da.id
     GROUP BY da.id
     ORDER BY da.created_at DESC`,
  );
  return result.rows.map((row) => ({
    ...rowToDeveloperAccount(row as DeveloperAccountRow),
    clientCount: (row as any).client_count as number,
  }));
}
```

Falls `rowToDeveloperAccount` Column-Namen camelCased: `developer_account_id` braucht ggf. Aliasing. Prüfe die bestehende Row-Map-Funktion auf Spaltennamen.

- [ ] **Step 3: `createDeveloperRepository`-Factory updaten**

In der Factory-Funktion, die `DeveloperRepository` instanziiert, den neuen Methoden-Handler hinzufügen:

```ts
listDeveloperAccounts: () => listDeveloperAccounts(pool),
```

- [ ] **Step 4: Typecheck**

```bash
cd apps/backend && pnpm exec tsc --noEmit
```

Expected: keine neuen Fehler.

---

### Task 2: `GET /api/admin/developer/accounts` – Backend-Route

**Files:**
- Modify: `apps/backend/src/routes/admin-api-access.ts`

- [ ] **Step 1: Route registrieren**

In `adminApiAccessRoutes()` nach dem `app.get(ENDPOINTS.admin.developer.apiAccess.overview, ...)`-Handler einen neuen GET-Handler einfügen:

```ts
app.get(ENDPOINTS.admin.developer.accounts, async (request, reply) => {
  if (!(await requireOwnerOrAdmin(request, reply))) return;
  const repo = getDeveloperRepository();
  const accounts = await repo.listDeveloperAccounts();
  return reply.send({
    accounts: accounts.map((a) => ({
      id: a.id,
      email: a.email,
      emailVerifiedAt: a.emailVerifiedAt ? new Date(a.emailVerifiedAt).toISOString() : null,
      displayName: a.displayName,
      avatarUrl: a.avatarUrl,
      plan: a.plan,
      status: a.status,
      clientCount: a.clientCount,
      createdAt: new Date(a.createdAt).toISOString(),
      lastLoginAt: a.lastLoginAt ? new Date(a.lastLoginAt).toISOString() : null,
    })),
  });
});
```

Import von `getDeveloperRepository` prüfen – existiert unter `../db/index.js`. Falls nicht vorhanden, `db/index.ts` checken und ergänzen.

- [ ] **Step 2: Typecheck**

```bash
cd apps/backend && pnpm exec tsc --noEmit
```

Expected: keine Fehler. Falls `ENDPOINTS.admin.developer.accounts` noch nicht existiert → Task 3 macht das.

---

### Task 3: Shared-Endpoints + Route-Templates

**Files:**
- Modify: `packages/shared/src/endpoints.ts`

- [ ] **Step 1: ENDPOINTS ergänzen**

In `ENDPOINTS.admin.developer` nach `apiAccess` einfügen:

```ts
/** GET: list all developer accounts with client counts. */
accounts: "/api/admin/developer/accounts",
```

- [ ] **Step 2: ROUTE_TEMPLATES ergänzen**

In `ROUTE_TEMPLATES.admin.developer` nach `apiAccess` einfügen:

```ts
accounts: "/api/admin/developer/accounts",
```

- [ ] **Step 3: Typecheck Shared-Package**

```bash
cd packages/shared && pnpm exec tsc --noEmit
```

Expected: keine Fehler.

---

### Task 4: Stats-Endpoint – `pendingApiAccessRequests`

**Files:**
- Modify: `apps/backend/src/routes/admin-data.ts`
- Modify: `apps/backend/src/db/api-access-repository.ts` (Interface, falls `countPendingRequests` fehlt)
- Modify: `apps/backend/src/db/adapters/postgres-api-access.ts` (Adapter)

- [ ] **Step 1: Repository-Methode prüfen/ergänzen**

Prüfe, ob `ApiAccessRepository` bereits `countPendingApiAccessRequests()` oder Ähnliches hat:

```bash
grep -n "countPending\|pending" apps/backend/src/db/api-access-repository.ts
```

Falls nicht vorhanden, ergänzen:

```ts
/** Returns the number of api_access_requests with status = 'pending'. */
countPendingApiAccessRequests(): Promise<number>;
```

- [ ] **Step 2: Adapter-Implementierung**

In `postgres-api-access.ts`:

```ts
export async function countPendingApiAccessRequests(pool: Pool): Promise<number> {
  const result = await pool.query(
    `SELECT COUNT(*)::int AS cnt FROM api_access_requests WHERE status = 'pending'`,
  );
  return (result.rows[0] as { cnt: number }).cnt;
}
```

- [ ] **Step 3: Stats-Endpoint erweitern**

In `admin-data.ts` den Stats-Handler (ab Zeile 225) um `pendingApiAccessRequests` erweitern:

```ts
app.get(ENDPOINTS.admin.stats, async () => {
  const repo = await getAdminRepository();
  const apiAccessRepo = await getApiAccessRepository();
  const [counts, adminCount, pendingApiAccessRequests] = await Promise.all([
    repo.countAllData(),
    repo.countAdmins(),
    apiAccessRepo.countPendingApiAccessRequests(),
  ]);
  return {
    tracks: counts.tracks,
    albums: counts.albums,
    artists: counts.artists,
    artistProfiles: counts.artistProfiles,
    artistEntities: counts.artistEntities,
    users: adminCount,
    pendingApiAccessRequests,
  };
});
```

- [ ] **Step 4: Typecheck**

```bash
cd apps/backend && pnpm exec tsc --noEmit
```

Expected: keine Fehler.

---

### Task 5: Dashboard-Types + i18n-Messages

**Files:**
- Modify: `apps/dashboard/src/shared/types/admin.ts`
- Modify: `apps/dashboard/src/i18n/messages.ts`

- [ ] **Step 1: AdminStats-Typ erweitern**

In `admin.ts`:

```ts
export interface AdminStats {
  tracks: number;
  albums: number;
  artists: number;
  artistProfiles?: number;
  artistEntities?: number;
  users: number;
  pendingApiAccessRequests?: number;
}
```

- [ ] **Step 2: Sidebar-i18n ergänzen**

In `DashboardMessages["layout"]["sidebar"]` drei neue Keys:

```ts
sectionDeveloper: string;
apiAccessRequests: string;
clientsAndTokens: string;
developerAccounts: string;
```

- [ ] **Step 3: `cards`-Interface erweitern**

In `DashboardMessages["dashboard"]["cards"]` ergänzen:

```ts
pendingApiAccessRequests: string;
```

- [ ] **Step 4: Neuen `developer`-Namespace in DashboardMessages**

Nach `dashboard` einfügen:

```ts
developer: {
  requestsTitle: string;
  requestsFilterAll: string;
  requestsFilterPending: string;
  requestsFilterApproved: string;
  requestsFilterRejected: string;
  colApp: string;
  colDeveloper: string;
  colTraffic: string;
  colSubmitted: string;
  colStatus: string;
  detailBackLabel: string;
  detailApprove: string;
  detailReject: string;
  detailRejectReasonLabel: string;
  detailRejectReasonPlaceholder: string;
  detailRejectConfirm: string;
  detailRejectCancel: string;
  detailRateLimitMinute: string;
  detailRateLimitDay: string;
  statusPending: string;
  statusApproved: string;
  statusRejected: string;
  statusActive: string;
  statusSuspended: string;
  statusRevoked: string;
  clientsTitle: string;
  clientsEmpty: string;
  clientsTokensLabel: string;
  clientsNoTokens: string;
  clientsCreateToken: string;
  clientsRevokeToken: string;
  clientsRotateToken: string;
  tokenRevealTitle: string;
  tokenRevealHint: string;
  tokenRevealCopy: string;
  accountsTitle: string;
  colEmail: string;
  colDisplayName: string;
  colPlan: string;
  colClients: string;
  colRegistered: string;
  overviewCardLabel: string;
};
```

- [ ] **Step 5: DE-Übersetzungen**

In `DASHBOARD_MESSAGES.de` die neuen Werte befüllen:

```ts
developer: {
  requestsTitle: "API Access Requests",
  requestsFilterAll: "Alle",
  requestsFilterPending: "Pending",
  requestsFilterApproved: "Genehmigt",
  requestsFilterRejected: "Abgelehnt",
  colApp: "App",
  colDeveloper: "Developer",
  colTraffic: "Traffic Est.",
  colSubmitted: "Eingereicht",
  colStatus: "Status",
  detailBackLabel: "← API Access Requests",
  detailApprove: "Genehmigen",
  detailReject: "Ablehnen",
  detailRejectReasonLabel: "Begründung (erforderlich)",
  detailRejectReasonPlaceholder: "Begründung für die Ablehnung…",
  detailRejectConfirm: "Ablehnen",
  detailRejectCancel: "Abbrechen",
  detailRateLimitMinute: "Requests / Minute",
  detailRateLimitDay: "Requests / Tag",
  statusPending: "Pending",
  statusApproved: "Genehmigt",
  statusRejected: "Abgelehnt",
  statusActive: "Aktiv",
  statusSuspended: "Suspendiert",
  statusRevoked: "Widerrufen",
  clientsTitle: "Clients & Tokens",
  clientsEmpty: "Keine aktiven Clients",
  clientsTokensLabel: "Tokens",
  clientsNoTokens: "Keine Tokens",
  clientsCreateToken: "Token erstellen",
  clientsRevokeToken: "Widerrufen",
  clientsRotateToken: "Rotieren",
  tokenRevealTitle: "Token wird nur einmal angezeigt",
  tokenRevealHint: "Kopiere ihn jetzt. Nach dem Schließen ist er nicht mehr abrufbar.",
  tokenRevealCopy: "In Zwischenablage kopieren",
  accountsTitle: "Developer Accounts",
  colEmail: "E-Mail",
  colDisplayName: "Name",
  colPlan: "Plan",
  colClients: "Clients",
  colRegistered: "Registriert",
  overviewCardLabel: "Pending API Requests",
},
```

Und die Sidebar-Strings in `layout.sidebar`:

```ts
sectionDeveloper: "Developer",
apiAccessRequests: "API Access Requests",
clientsAndTokens: "Clients & Tokens",
developerAccounts: "Developer Accounts",
```

Und in `dashboard.cards`:

```ts
pendingApiAccessRequests: "Offene API-Requests",
```

- [ ] **Step 6: EN-Übersetzungen**

Analog in `DASHBOARD_MESSAGES.en` – gleiche Struktur, englische Texte. `layout.sidebar`-Werte identisch (bereits Englisch). `dashboard.cards.pendingApiAccessRequests`: `"Pending API Requests"`.

---

### Task 6: API-Client (`features/developer/api.ts`)

**Files:**
- Create: `apps/dashboard/src/features/developer/api.ts`

- [ ] **Step 1: API-Client-Datei erstellen**

```ts
import { ENDPOINTS } from "@musiccloud/shared";
import { api } from "@/lib/api";

export interface ApiAccessRequestResponse {
  id: string;
  developerAccountId: string;
  contactEmail: string;
  appName: string;
  appDescription: string;
  estimatedRequestsPerDay: number;
  status: string;
  submittedAt: string;
  reviewedAt: string | null;
  reviewedByAdminId: string | null;
  reviewNote: string | null;
}

export interface ApiClientTokenResponse {
  id: string;
  tokenPrefix: string;
  status: string;
  createdAt: string;
  lastUsedAt: string | null;
  revokedAt: string | null;
}

export interface ApiClientResponse {
  id: string;
  requestId: string;
  developerAccountId: string;
  appName: string;
  contactEmail: string;
  description: string;
  status: string;
  requestsPerMinute: number;
  requestsPerDay: number;
  createdAt: string;
  updatedAt: string;
  tokens: ApiClientTokenResponse[];
}

export interface ApiAccessOverview {
  requests: ApiAccessRequestResponse[];
  clients: ApiClientResponse[];
}

export interface DeveloperAccountResponse {
  id: string;
  email: string;
  emailVerifiedAt: string | null;
  displayName: string | null;
  avatarUrl: string | null;
  plan: string;
  status: string;
  clientCount: number;
  createdAt: string;
  lastLoginAt: string | null;
}

export function fetchApiAccessOverview(status?: string): Promise<ApiAccessOverview> {
  const qs = status ? `?status=${status}` : "";
  return api.get<ApiAccessOverview>(ENDPOINTS.admin.developer.apiAccess.overview + qs);
}

export function fetchApiAccessRequest(id: string): Promise<{ request: ApiAccessRequestResponse }> {
  return api.get<{ request: ApiAccessRequestResponse }>(
    ENDPOINTS.admin.developer.apiAccess.requestDetail(id),
  );
}

export function approveApiAccessRequest(
  id: string,
  body?: { requestsPerMinute?: number; requestsPerDay?: number },
): Promise<{ request: ApiAccessRequestResponse; client: ApiClientResponse }> {
  return api.post<{ request: ApiAccessRequestResponse; client: ApiClientResponse }>(
    ENDPOINTS.admin.developer.apiAccess.requestApprove(id),
    body,
  );
}

export function rejectApiAccessRequest(
  id: string,
  body: { reviewNote: string },
): Promise<{ request: ApiAccessRequestResponse }> {
  return api.post<{ request: ApiAccessRequestResponse }>(
    ENDPOINTS.admin.developer.apiAccess.requestReject(id),
    body,
  );
}

export function fetchApiClient(
  id: string,
): Promise<{ client: ApiClientResponse }> {
  return api.get<{ client: ApiClientResponse }>(
    ENDPOINTS.admin.developer.apiAccess.clientDetail(id),
  );
}

export function updateApiClient(
  id: string,
  body: { status?: string; requestsPerMinute?: number; requestsPerDay?: number },
): Promise<{ client: ApiClientResponse }> {
  return api.patch<{ client: ApiClientResponse }>(
    ENDPOINTS.admin.developer.apiAccess.clientUpdate(id),
    body,
  );
}

export function createClientToken(
  id: string,
): Promise<{ token: ApiClientTokenResponse & { rawToken: string } }> {
  return api.post<{ token: ApiClientTokenResponse & { rawToken: string } }>(
    ENDPOINTS.admin.developer.apiAccess.clientCreateToken(id),
  );
}

export function revokeToken(
  id: string,
): Promise<{ token: ApiClientTokenResponse }> {
  return api.post<{ token: ApiClientTokenResponse }>(
    ENDPOINTS.admin.developer.apiAccess.tokenRevoke(id),
  );
}

export function rotateToken(
  id: string,
): Promise<{ token: ApiClientTokenResponse & { rawToken: string } }> {
  return api.post<{ token: ApiClientTokenResponse & { rawToken: string } }>(
    ENDPOINTS.admin.developer.apiAccess.tokenRotate(id),
  );
}

export function fetchDeveloperAccounts(): Promise<{ accounts: DeveloperAccountResponse[] }> {
  return api.get<{ accounts: DeveloperAccountResponse[] }>(
    ENDPOINTS.admin.developer.accounts,
  );
}
```

- [ ] **Step 2: Typecheck**

```bash
cd apps/dashboard && pnpm exec tsc --noEmit
```

Expected: `ENDPOINTS.admin.developer.accounts` wird gemoppert falls Task 3 nicht vorher lief. Ansonsten clean.

---

### Task 7: Domain-Literale (PascalCase-Namespaces)

**Files:**
- Create: `apps/dashboard/src/features/developer/domain.ts`

- [ ] **Step 1: Status-Namespaces definieren**

```ts
export const ApiAccessRequestStatus = {
  Pending: "pending",
  Approved: "approved",
  Rejected: "rejected",
  Archived: "archived",
} as const;
export type ApiAccessRequestStatus = (typeof ApiAccessRequestStatus)[keyof typeof ApiAccessRequestStatus];

export const ApiClientStatus = {
  Active: "active",
  Suspended: "suspended",
  Revoked: "revoked",
} as const;
export type ApiClientStatus = (typeof ApiClientStatus)[keyof typeof ApiClientStatus];

export const ApiTokenStatus = {
  Active: "active",
  Revoked: "revoked",
  Rotated: "rotated",
} as const;
export type ApiTokenStatus = (typeof ApiTokenStatus)[keyof typeof ApiTokenStatus];

export const DeveloperAccountStatus = {
  Active: "active",
  Suspended: "suspended",
} as const;
export type DeveloperAccountStatus = (typeof DeveloperAccountStatus)[keyof typeof DeveloperAccountStatus];
```

- [ ] **Step 2: Commit Foundation**

```bash
git add -A && git commit -m "Feat: add developer management backend endpoints + dashboard foundation (MC-090)"
```

---

## Gates

- [ ] Backend-Typecheck: `cd apps/backend && pnpm exec tsc --noEmit` grün
- [ ] Shared-Typecheck: `cd packages/shared && pnpm exec tsc --noEmit` grün
- [ ] Dashboard-Typecheck: `cd apps/dashboard && pnpm exec tsc --noEmit` grün

## Verifizierte Fakten

- **DeveloperRepository**: Interface in `apps/backend/src/db/developer-repository.ts:102`, `DeveloperAccount`-DTO ab `:39`, `clientCount` ist neu
- **Postgres-Adapter**: `apps/backend/src/db/adapters/postgres-developer.ts` (431 Zeilen), Factory in `apps/backend/src/db/index.ts`
- **Admin-Stats-Endpoint**: `apps/backend/src/routes/admin-data.ts:225`, gibt `{ tracks, albums, artists, artistProfiles, artistEntities, users }`
- **Shared-Endpoints**: `packages/shared/src/endpoints.ts:359-379` (ENDPOINTS.admin.developer.apiAccess.*), `:494-501` (ROUTE_TEMPLATES), `:247` (stats)
- **AdminStats-Type**: `apps/dashboard/src/shared/types/admin.ts:21`, Feld `pendingApiAccessRequests` ist neu
- **i18n**: `DashboardMessages` in `apps/dashboard/src/i18n/messages.ts:3`, DE ab `:828`, EN ab `:1635`
- **API-Client-Pattern**: `apps/dashboard/src/lib/api.ts` (Bearer-Auth, `/api/*`-Präfix-Erkennung)
- **Domain-Literale-Pattern**: `as const`-Namespaces im PascalCase, Doctor-Regel `domain-literals/prefer-pascal-case-literal-namespaces`
- **Plan-Nr.**: `plans next` → `MC-090`
