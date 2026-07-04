# Dashboard Developer-Management-UI

## Kontext

Das Developer-Portal (`apps/developer`, MC-089) ist live: Developer können sich registrieren, API-Access-Requests stellen und ihre Tokens verwalten. Was fehlt, ist die **Admin-Dashboard-UI**, um diese Requests zu reviewen, Clients/Tokens zu managen und Developer-Accounts einzusehen.

Die komplette Backend-API für Requests/Clients/Tokens existiert bereits unter `/api/admin/developer/api-access/` (10 Endpoints, `admin-api-access.ts`). Nur die Dashboard-Frontend-Seiten fehlen.

## Ziel

- Neue Sidebar-Section "Developer" (zwischen Analytics und System, nur Owner+Admin)
- Drei neue Seiten: API Access Requests (Liste + Detail mit Approve/Reject), Clients & Tokens, Developer Accounts
- Ein neuer Backend-Endpoint `GET /api/admin/developer/accounts` für die Account-Liste

## Design

### Sidebar

Neue `SidebarDeveloperSection`-Komponente im Pattern von `SidebarAnalyticsSection`, gerendert unterhalb der Analytics-Section, nur für `isAdmin` (owner+admin). Nutzt `DashboardSection`-Komponenten.

```
Developer
 ├── API Access Requests  (Badge: Anzahl Pending)
 ├── Clients & Tokens
 └── Developer Accounts
```

Eingefügt in `Sidebar.tsx` zwischen `SidebarAnalyticsSection` und der System-Section.

### Routen

Alle unter `<RequireNonModerator>` (deckt owner+admin):

| Route | Page | Beschreibung |
|---|---|---|
| `/developer/requests` | `ApiAccessRequestsPage` | Tabelle aller Requests, Filter nach Status |
| `/developer/requests/:id` | `RequestDetailPage` | Detail-Ansicht mit Approve/Reject |
| `/developer/clients` | `ApiClientsPage` | Cards pro Client mit Token-Management |
| `/developer/accounts` | `DeveloperAccountsPage` | Tabelle aller Developer-Accounts |

### Seiten-Details

**API Access Requests (`ApiAccessRequestsPage`)**:
- Tabelle: App-Name, Developer-Email, Traffic-Estimate, Eingereicht-Datum, Status-Badge
- Filter-Pills: Alle / Pending / Approved / Rejected (Pattern: TracksPage-Filter)
- Klick auf Zeile → Request-Detail-Page
- Pattern: `TracksPage` (Tabelle, Filter, Badge-Count)

**Request Detail (`RequestDetailPage`)**:
- Back-Label "← API Access Requests" (Pattern: `TrackEditPage`)
- Info-Cards: Developer-Email, Beschreibung, Traffic-Estimate, Eingereicht-Datum
- Rate-Limit-Override-Felder (Minute/Tag) mit sinnvollen Defaults
- Approve-Button (sofort, kein Dialog)
- Reject-Button → Inline-Form mit Pflichtfeld `reviewNote`
- Nach Approve: Client wird erstellt, Developer kriegt E-Mail (Backend übernimmt)
- Pattern: `TrackEditPage` (Back-Nav, Info-Blöcke, Actions)

**Clients & Tokens (`ApiClientsPage`)**:
- Cards pro Client: App-Name, Status-Badge, Developer-Email, Rate-Limits
- Token-Liste pro Client: maskierter Prefix, Status, Created/LastUsed, Revoke/Rotate-Buttons
- Token-Reveal nach Create/Rotate: Einmalige Anzeige des Raw-Tokens mit Copy-Button
- Token-Revoke mit Bestätigung
- Leerzustand: "Keine aktiven Clients"
- Pattern: `ServicesPage` (Cards, Status-Badges, Actions)

**Developer Accounts (`DeveloperAccountsPage`)**:
- Tabelle: Email, Display-Name, Plan, Anzahl Clients, Status, Registriert-Datum
- Read-only – Developer verwalten ihren Account selbst im Developer-Portal
- Clients-Spalte als Zahl (optional: Link auf Clients-Seite)
- Pattern: `UsersPage`-Tabelle

### API-Client

Neue Datei `features/developer/api.ts` im Pattern von `features/services/api.ts`:

```ts
import { ENDPOINTS } from "@musiccloud/shared";
import { api } from "@/lib/api";

// Requests
export function fetchApiAccessOverview(status?: string) { ... }
export function fetchApiAccessRequest(id: string) { ... }
export function approveApiAccessRequest(id: string, body?: { requestsPerMinute?: number; requestsPerDay?: number }) { ... }
export function rejectApiAccessRequest(id: string, body: { reviewNote: string }) { ... }
// Clients
export function fetchApiClient(id: string) { ... }
export function updateApiClient(id: string, body: { status?: string; requestsPerMinute?: number; requestsPerDay?: number }) { ... }
export function createClientToken(id: string) { ... }
// Tokens
export function revokeToken(id: string) { ... }
export function rotateToken(id: string) { ... }
// Accounts (neuer Endpoint)
export function fetchDeveloperAccounts() { ... }
```

### i18n

Erweiterung von `DashboardMessages["layout"]["sidebar"]`:

```ts
sectionDeveloper: string;
apiAccessRequests: string;
clientsAndTokens: string;
developerAccounts: string;
```

Neuer Namespace `DashboardMessages["developer"]` mit Strings für Tabellen-Header, Status-Labels, Buttons, Reveal-Dialog, Leerzustände. Muster: `messages.system` / `messages.services`.

### AdminStats-Erweiterung

`AdminStats` kriegt ein optionales Feld `pendingApiAccessRequests?: number`. Backend zählt Pending-Requests im Stats-Endpoint. Dashboard-seitig backward-compatible (Feld optional → fällt auf 0 zurück wenn nicht da).

### Dashboard-Overview-Stat-Card

`DashboardPage` kriegt eine zusätzliche `DashboardInfoCard` im Grid:

```tsx
<DashboardInfoCard
  label={dm.cards.pendingApiAccessRequests}
  value={stats?.pendingApiAccessRequests ?? 0}
  accent
  href="/developer/requests"
/>
```

- `accent`-Prop hebt die Karte optisch hervor (farbiger Border + Text)
- `href` macht die Karte klickbar → Link zur Requests-Page
- Grid wächst von 5 auf 6 Karten (passt ins responsive Grid)
- i18n-String `dm.cards.pendingApiAccessRequests` in DE+EN
- Skeleton-Loading-Array von 3 auf 4 erhöht (2×2 statt 3×1 im Mobile-Skeleton)

### Neuer Backend-Endpoint

`GET /api/admin/developer/accounts` — listet alle Developer-Accounts mit Client-Count. Braucht:
- Neue Methode `listDeveloperAccounts()` im `DeveloperRepository`-Interface + Postgres-Adapter
- Neue Route in `admin-api-access.ts` (oder eigener File, aber gleicher Scope)
- Neuer Eintrag in `ENDPOINTS.admin.developer.accounts` + `ROUTE_TEMPLATES`

### Datei-Struktur

```
apps/dashboard/src/features/developer/
├── api.ts                    # API-Client (Pattern: services/api.ts)
├── ApiAccessRequestsPage.tsx  # Requests-Liste
├── RequestDetailPage.tsx      # Request-Detail mit Approve/Reject
├── ApiClientsPage.tsx         # Clients & Tokens
├── DeveloperAccountsPage.tsx  # Developer-Accounts
└── hooks/
    └── useDeveloperData.ts    # React-Query-Hooks (Pattern: useAdminStats)

apps/dashboard/src/components/layout/Sidebar.tsx  # + SidebarDeveloperSection
apps/dashboard/src/routes.tsx                     # + 4 Routes
apps/dashboard/src/routeComponents.tsx            # + 4 lazy Imports
apps/dashboard/src/i18n/messages.ts               # + developer-Namespace + Sidebar-Einträge
apps/dashboard/src/shared/types/admin.ts          # + pendingApiAccessRequests

apps/backend/src/db/developer-repository.ts       # + listDeveloperAccounts
apps/backend/src/db/adapters/postgres-developer.ts # + listDeveloperAccounts Impl
apps/backend/src/routes/admin-api-access.ts        # + GET /accounts
packages/shared/src/endpoints.ts                   # + accounts-Endpoint
```

### Status-Literale

Pro Doctor-Policy: Domain-Literale als PascalCase-`as const`-Namespaces.

- `ApiAccessRequestStatus.Pending / Approved / Rejected / Archived`
- `ApiClientStatus.Active / Suspended / Revoked`
- `ApiTokenStatus.Active / Revoked / Rotated`
- `DeveloperAccountStatus.Active / Suspended`

### Nicht-Ziele (YAGNI)

- Kein Inline-Edit von Developer-Accounts (Status, Plan, etc.)
- Kein Client-Edit-UI (nur Token-Management)
- Keine Paginierung (Datenmengen sind klein)
- Kein Bulk-Approve/Reject
- Keine Audit-Event-Anzeige im Dashboard

## Verifizierte Fakten

- **Sidebar-Pattern**: `DashboardSection` in `components/ui/DashboardSection.tsx:53`, genutzt in `Sidebar.tsx` mit `SidebarGeneralSection`, `SidebarMusicSection`, `SidebarAnalyticsSection` als Referenz
- **Route-Pattern**: `routes.tsx` nutzt `RequireNonModerator`-Wrapper für Admin-Routen, lazy imports via `routeComponents.tsx`
- **API-Client-Pattern**: `features/services/api.ts` — `api.get/post/patch` aus `@/lib/api.ts`, nutzt `ENDPOINTS` aus `@musiccloud/shared`
- **AdminStats**: Interface in `apps/dashboard/src/shared/types/admin.ts:21`, genutzt via `useAdminStats()` Hook
- **Admin Endpoints**: `ENDPOINTS.admin.developer.apiAccess.*` in `packages/shared/src/endpoints.ts:359-379`, `ROUTE_TEMPLATES.admin.developer.apiAccess.*` in `:494-501`
- **Backend admin-api-access.ts**: 10 Endpoints registriert via `adminApiAccessRoutes()`, Guard = `requireOwnerOrAdmin`
- **Developer-Repository**: `apps/backend/src/db/developer-repository.ts` — kein `listDeveloperAccounts()` existiert
- **i18n-Messages**: Interface `DashboardMessages` in `apps/dashboard/src/i18n/messages.ts:3`, DE/EN-Blöcke ab `:828`/`:1635`
- **MC-089**: Developer-Portal-Self-Service ist complete (alle Checklist-Items checked), Backend für `/api/dev/api-access/*` existiert

## Checkliste

- [ ] Backend: `listDeveloperAccounts()` in Repository-Interface + Postgres-Adapter
- [ ] Backend: `GET /api/admin/developer/accounts` Route in `admin-api-access.ts`
- [ ] Shared: `ENDPOINTS.admin.developer.accounts` + `ROUTE_TEMPLATES`
- [ ] Dashboard: `AdminStats.pendingApiAccessRequests` (Typ + Backend-Stats-Endpoint)
- [ ] Dashboard: Overview-Stat-Card "Pending API Requests" in `DashboardPage.tsx` (accent, verlinkt)
- [ ] Dashboard: `features/developer/api.ts` (API-Client)
- [ ] Dashboard: `SidebarDeveloperSection` in `Sidebar.tsx`
- [ ] Dashboard: `ApiAccessRequestsPage` (Liste mit Filtern)
- [ ] Dashboard: `RequestDetailPage` (Approve/Reject)
- [ ] Dashboard: `ApiClientsPage` (Cards + Token-Management + Reveal)
- [ ] Dashboard: `DeveloperAccountsPage` (Tabelle)
- [ ] Dashboard: Routes in `routes.tsx` + Lazy-Imports in `routeComponents.tsx`
- [ ] Dashboard: i18n-Strings (DE + EN) in `messages.ts`
- [ ] Dashboard: Domain-Literale als PascalCase-Namespaces
- [ ] React-Doctor: `doctor:diff` grün
- [ ] Lint: `pnpm lint` grün
- [ ] Typecheck: `tsc --noEmit` grün (dashboard + backend)
- [ ] Test: `test:run` grün
