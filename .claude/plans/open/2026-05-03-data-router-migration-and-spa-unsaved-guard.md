# Plan: Data-Router-Migration + SPA-internal Unsaved-Guard

Plan-Nr.: MC-022

**Goal:** Den `<BrowserRouter>` + `<Routes>`-Setup im Dashboard auf `createBrowserRouter` + `<RouterProvider>` (Data-Router) umstellen, damit `useBlocker` aus `react-router` 7 verfügbar wird, und anschließend den SPA-internen Teil des UnsavedGuard nachrüsten.

**Hintergrund (warum ein eigener Plan):**

Während Phase 4 des Pages-Global-Save-Plans (`2026-05-02-pages-global-save-and-dnd.md`) wurde T20 ursprünglich mit zwei Schutzebenen entworfen:

1. **Browser-level Guard** via `beforeunload` — funktioniert mit beiden Router-Bauweisen.
2. **SPA-internal Guard** via `useBlocker` — funktioniert NUR mit Data-Router.

Aktueller Stand (verifiziert am 2026-05-03):

- `apps/dashboard/src/main.tsx:5,41` — `import { BrowserRouter } from "react-router"` + `<BrowserRouter>` als Wrapper
- `apps/dashboard/src/App.tsx:153` — `<Routes>` mit Component-API (12+ `<Route>`-Definitionen)
- `react-router ^7.13.1` ist installiert (Data-Router-API verfügbar, wird nur nicht genutzt)

`useBlocker` wirft / ist no-op unter `<BrowserRouter>`. Die Router-Migration ist Touch-Everything (alle Routes umbauen, Lazy-Loading-Pattern anpassen, Suspense-Boundaries reorganisieren) — Scope sprengt Phase 4 des Pages-Plans deutlich. Daher dieser separate Plan.

**Was bereits geliefert wurde (T20a, in Phase 4 von `2026-05-02-pages-global-save-and-dnd.md`):**

- `apps/dashboard/src/features/content/state/UnsavedGuard.tsx` mit `beforeunload`-Listener (Browser-Level-Schutz). Tab-Schließen + F5 lösen den Browser-Standard-Dialog aus, sobald `editor.dirty.size() > 0`.

**Was diesem Plan offen ist (T20b):**

- SPA-interne Navigation (Sidebar-Klick, in-app `<Link>`, programmatische `navigate()`) hat heute KEINEN Schutz. Klick auf andere Page → ungespeicherte Änderungen futsch ohne Warnung.

---

## Phase 1 — Data-Router-Migration

### Task 1: `createBrowserRouter` + `RouterProvider` in `main.tsx`

**Files:**
- Modify: `apps/dashboard/src/main.tsx`
- Modify: `apps/dashboard/src/App.tsx` (Routes von Component-API → Route-Objects)

- [ ] `<Routes>`-Tree aus `App.tsx` in eine `routes`-Array-Konstante (oder via `createRoutesFromElements`) extrahieren
- [ ] `createBrowserRouter(routes)` in `main.tsx`
- [ ] `<RouterProvider router={router} />` ersetzt `<BrowserRouter><App /></BrowserRouter>`
- [ ] Alle bestehenden `<Suspense>`-Boundaries pro Route bleiben funktional
- [ ] Lazy-Imports (`lazy(() => import(...))`) bleiben funktional
- [ ] `useNavigate`, `useLocation`, `useParams`, `Link`, `Navigate` etc. funktionieren unverändert (data-router ist API-kompatibel für diese Hooks)

**Verifikation:** `pnpm dev:dashboard` läuft, alle Routen erreichbar, kein Console-Warning, alle existierenden Test-Suites grün.

---

## Phase 2 — SPA-internal Unsaved-Guard nachrüsten (T20b aus Pages-Plan)

### Task 2: `useBlocker` in `UnsavedGuard.tsx` aktivieren

**Files:**
- Modify: `apps/dashboard/src/features/content/state/UnsavedGuard.tsx`

- [ ] `useBlocker(({ currentLocation, nextLocation }) => currentLocation.pathname !== nextLocation.pathname && editor.dirty.size() > 0)` ergänzen
- [ ] 3-Optionen-Modal (`Abbrechen` / `Verwerfen` / `Speichern`) wenn `blocker.state === "blocked"`:
  - **Abbrechen** → `blocker.reset()`
  - **Verwerfen** → `editor.resetAll()` + `blocker.proceed()`
  - **Speichern** → `await save()`; bei Erfolg (`dirty.size() === 0`) → `blocker.proceed()`, sonst → `blocker.reset()`
- [ ] `beforeunload`-Listener bleibt (Browser-Level-Schutz, gilt parallel zur SPA-internen Schicht)

**Verifikation:** Manueller Smoke-Test — Title in `/admin/pages/info` ändern, dann Sidebar-Klick auf andere Page → Modal poppt auf, alle drei Buttons verhalten sich wie spezifiziert.

---

## Verified facts (2026-05-03 beim Plan-Schreiben)

- `apps/dashboard/src/main.tsx:5` `import { BrowserRouter } from "react-router"` (legacy) — `grep` ✓
- `apps/dashboard/src/main.tsx:41-43` `<BrowserRouter><App /></BrowserRouter>` — `grep` ✓
- `apps/dashboard/src/App.tsx:153` `<Routes>` (component-style) — `grep` ✓
- `react-router ^7.13.1` in `apps/dashboard/package.json` — `grep` ✓ (Data-Router-API ab v6.4 vorhanden, in v7 stable)
- `UnsavedGuard.tsx` enthält bereits den `beforeunload`-Listener (T20a) — siehe Pages-Plan `2026-05-02-pages-global-save-and-dnd.md` Phase 4
- T20-Spec im Pages-Plan referenziert das 3-Optionen-Modal, das ohne `useBlocker` nicht implementierbar ist
