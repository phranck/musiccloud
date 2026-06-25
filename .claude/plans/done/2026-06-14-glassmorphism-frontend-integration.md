# Glassmorphism-Material + Admin-Design-Config ins Frontend

Plan-Nr.: MC-035

> Status: offen · angelegt 2026-06-14
> Quelle der Analyse: Multi-Agent-Workflow `glass-frontend-integration-analysis` (6 Subsystem-Analysten + Synthese, refs durch echtes Datei-Lesen verifiziert) plus eigene Stichproben-Greps am Plan-Schreibzeitpunkt.

## Präambel

Der Prototyp [`card-prototype.html`](../../../card-prototype.html) (Repo-Root, bewusst uncommitted) ist der visuelle und funktionale Referenz-Stand des neuen UI-Materials: eine tunebare, matte Glasmorphismus-Oberfläche (vertikaler Tint-Gradient + `backdrop-filter`-Frost + abgeschrägte Kanten), gesteuert über ~70 CSS-Custom-Properties pro Control × Tag/Nacht, weich übergeblendet via `--g-dayness`, plus ein voll bedienbares Info-Overlay. Das Production-Frontend rendert heute noch das **alte, opake neumorphic-Material** und kennt **keinerlei Runtime-Theming**.

Ziel dieses Plans: das Material in `apps/frontend` produktiv machen **und** es über das Dashboard zur Laufzeit konfigurierbar machen — ein Admin trägt das vom Prototyp exportierte Settings-JSON ein, speichert, und das Live-Frontend übernimmt die Werte beim nächsten Render **ohne Redeploy**.

## Grundprinzip — keine Altlasten (vom User bekräftigt 2026-06-14)

**Bei der Umstellung wird von Beginn an komplett aufgeräumt. Es werden keine Altlasten mitgenommen.** Das alte neumorphic-Material wird nicht eingemottet, nicht hinter einem Schalter geparkt und nicht "eine Release lang" als Fallback behalten — es wird **restlos gelöscht** und zum neuen Glas portiert. Für jede Phase gilt:

- **Kein** Fallback-Pfad und **kein** `body.glass`-Gate als Umschalter — nach der Umstellung gibt es nichts mehr, wovon umzuschalten wäre; Glas ist das einzige Material, die Regeln gelten direkt auf den Surface-Klassen.
- **Keine** Wrapper oder Adapter um alten Code, **keine** Legacy-Calls.
- **Keine** Platzhalter, Dead-Code-Reste oder auskommentierten Blöcke dort, wo alter Code stand.
- Alter Code wird **gelöscht**, nicht "deaktiviert" — und im selben Schritt durch das Neue ersetzt.

## Werkzeug beim Execute: Graphify zuerst (vom User verlangt 2026-06-14)

Für jede Struktur-, Architektur- oder Abhängigkeitsfrage während der Umsetzung (welche Komponenten nutzen X, wer ruft Y auf, wie hängt Z zusammen) **zuerst den Graphify-Wissensgraphen befragen** statt reflexiv `grep`/`find` zu starten. Der Graph ist frisch gebaut (`graphify-out/graph.json`, 5933 Nodes / 13953 Edges / 283 Communities, Full-Update 2026-06-14, inkl. der neuen `DesignSettingsPage`).

- `graphify query "<Frage>"` für den Überblick (Struktur, betroffene Module, Bridge-Nodes), **dann** `grep`/`Read` für die exakten Werte und Zeilen.
- Reihenfolge immer: Graphify (Karte/Struktur) → Read (exakte Werte). Siehe [[feedback_graphify_first]].
- God-Nodes des aktuellen Graphen, die diese Integration berühren: `PostgresAdapter`, `useI18n()`, `cn()`, `fetchWithTimeout()`, `getRepository()` — beim Anfassen dieser Hubs besonders auf Fan-out achten.
- Nach größeren Code-Änderungen den Graphen aktualisieren (`/graphify --update` oder Full-Rebuild), damit er den IST-Stand abbildet.

## Getroffene Entscheidungen (vom User bestätigt 2026-06-14)

1. **Config-Scope = Material + Nachthimmel.** Das Dashboard-JSON steuert den **kompletten** Prototyp-Export: Material-Tokens (glass/text/vfd/footer/cover/backdrop + cardRadius) **und** die ~43 Shader-Parameter des WebGL-Nachthimmels (PARAMS + COLORS).
2. **Rollout = restlose Ersetzung, keine Altlasten.** Glas wird das einzige Material. Das gesamte neumorphic-Material (die `::before`-Rim-Regeln in `neumorphic.css`, die Inline-Style-Objekte in `neumorphic.ts`) wird von Beginn an **gelöscht** und durch das Glas ersetzt — **kein** `body.glass`-Gate, **kein** Fallback, **keine** Wrapper/Legacy-Calls/Platzhalter (siehe Grundprinzip).
3. **Day/Night = Live-Crossfade direkt in v1.** Der kontinuierliche `--g-dayness`-Crossfade ist Teil von v1, inklusive des neuen Worker→Main-Publish-Kanals.

## Geklärte Detail-Fragen (Empfehlung übernommen, kein User-Input nötig)

- **`footer`-Key-Quirk:** Das exportierte JSON nutzt den Top-Level-Key `footer`, der intern auf die Gruppe `skytext` mappt. Die Pipeline keyt auf `footer` (1:1 zum Export), das interne Mapping bleibt im Applier gekapselt.
- **`cardRadius`-Default = 32.** Der aktuelle Prototyp-Default ist 32 (JS `CARD_RADIUS_DEFAULT`); ein veralteter CSS-Kommentar sagt 22px. Production pinnt **32** als Default; der Wert wird auf das bestehende Radius-Cascade-Root-Token gemappt (siehe Radius-Reconciliation), nicht über die Prototyp-eigene flache `--mc-*`-Kette.
- **`muted`-Textebene wird gebunden.** Im Prototyp schreibt `applyText` zwar `--text-muted-*`, aber keine CSS-Regel konsumiert sie. Production hat eine echte dritte Textebene (`--color-text-muted` in `global.css`), daher wird `muted` in der Portierung an die entsprechenden Konsumenten gebunden statt verworfen.
- **Demo-Content wird nicht portiert.** `VFD_LINES` und die hartkodierte Qobuz-Cover-URL im Prototyp sind Demo-Daten. Production speist die VFD/Cover aus echten Track-Daten (MediaCard/SongInfo); portiert wird nur die Render-Mechanik, nicht die Datenquelle.
- **`BACKDROP`-Defaults = 0.32 / blur 3** (tatsächliche Prototyp-Werte; ein Kommentar nennt veraltet 0.7/none).

## Ist-Zustand (verifiziert)

**Material:** Jede Karten-/Control-Oberfläche ist opak-neumorphic. Zwei CSS-Klassen, `.embossed-gradient-border` und `.recessed-gradient-border` ([neumorphic.css:24-196](../../../apps/frontend/src/styles/neumorphic.css)), malen einen 1px-Gradient-Rand via `::before` mit `mask-composite` + `transform: translateZ(0)` (Safari-Paint-Race-Fix, siehe [[project_safari_paint_race]]). Surface-Hintergrund + Box-Shadow kommen aus React-Inline-Styles ([neumorphic.ts](../../../apps/frontend/src/styles/neumorphic.ts)), nicht aus der Klasse. **Genau 5 Quellen** tragen das Material: [EmbossedCard.tsx](../../../apps/frontend/src/components/cards/EmbossedCard.tsx), [RecessedCardParts.tsx](../../../apps/frontend/src/components/cards/RecessedCardParts.tsx), [EmbossedButton.tsx](../../../apps/frontend/src/components/ui/EmbossedButton.tsx), [EmbossedSegmentedControl.tsx](../../../apps/frontend/src/components/ui/EmbossedSegmentedControl.tsx) (+ ein Test). **Kein `backdrop-filter`** irgendwo, **kein `document.documentElement.style.setProperty`** irgendwo (grep-verifiziert null Treffer über `apps/` + `packages/`).

**Radius:** Vererbungs-Cascade aus [cardGeometry.ts](../../../apps/frontend/src/components/cards/cardGeometry.ts) (`embossedCardOuterRadius` 1.375rem, `embossedCardContentInset` 0.75rem, `recessedSurfaceRadius`, `recessedControlInset` 0.1875rem, `raisedControlRadius`), Kette `--emb-radius → --neu-radius → --mc-card-inner-radius` mit responsiven `-sm`-Swaps bei 640px. Die flache `--mc-card-radius`-Kette des Prototyps existiert in Production **nicht**.

**Day/Night:** Produktiv-live. [dayNightMode.ts](../../../apps/frontend/src/components/background/dayNightMode.ts) hält einen von vier Modi (`DayNightMode` Enum, Default `Night`, persistiert unter `mc.background.dayNightMode`), [dayNightPolicy.ts](../../../apps/frontend/src/components/background/dayNightPolicy.ts) mappt Modus → 0..1-Dayness (kontinuierlich nur für `Automatic`). Der WebGL-Treiber ([nightSky/loop.ts](../../../apps/frontend/src/components/background/nightSky/loop.ts) `tickFade`-Smoothstep, [BackgroundScene.tsx](../../../apps/frontend/src/components/background/BackgroundScene.tsx)) berechnet die kontinuierliche Dayness, aber sie lebt **nur** im Worker/Driver-Settings-Objekt und der GLSL-`u_dayness`-Uniform — sie wird **nie** zurück ins DOM publiziert. Datenfluss ist strikt einseitig **in** den Worker. Es gibt **kein** `--g-dayness` im App-Source.

**Config-Store:** [`site_settings`](../../../apps/backend/src/db/schemas/postgres.ts) (postgres.ts:869) ist ein String-only Key/Value-Store (key PK, value text, updated_at). Service `getAllSettings`/`getSetting`/`setSetting` über einen dedizierten `max:2`-Pool ([services/site-settings.ts](../../../apps/backend/src/services/site-settings.ts)). Admin `GET`/`PATCH /api/admin/site-settings` akzeptiert **beliebige Keys, keine Whitelist** ([routes/site-settings.ts:66-83](../../../apps/backend/src/routes/site-settings.ts)). Public `GET /api/v1/site-settings/tracking` ist auf den einen `tracking_enabled`-Bool hartkodiert, unauthenticated, `Cache-Control: private, max-age=60` (routes/site-settings.ts:27-56). **Warnung/Präzedenz:** Diese Public-Route hat null Frontend-Konsumenten; Tracking wird real über die Build-Time-Env `PUBLIC_TRACKING_ENABLED` gegated — der Admin-Toggle ist ein toter Draht. **Diesen Fehler nicht wiederholen** (Tokens müssen aus dem DB-Store gelesen werden, nicht aus einer Env).

**Frontend-Datenpfad:** Astro SSR (`output: server`). [BaseLayout.astro](../../../apps/frontend/src/layouts/BaseLayout.astro) ist die einzige Shell, `await fetchNavigation` im Frontmatter (BaseLayout.astro:33), importiert `global.css` (Tailwind v4 `@theme` → `:root`-Vars zur Build-Zeit). [api/client.ts](../../../apps/frontend/src/api/client.ts) ist das BFF (`internalHeaders` + `X-API-Key`, `fetchWithTimeout`, `X-Forwarded-For`); **kein Cache-Layer**, jeder Render re-fetcht. Server→Client-Scalar-Injektion-Präzedenz: `<script is:inline define:vars>` ([pages/index.astro](../../../apps/frontend/src/pages/index.astro)). **Kein** Präzedenz für ein server-gerendertes `<style>` das `:root` emittiert.

**Dashboard:** React 19 + react-router SPA. Sidebar-Sektionen `isAdmin`-gated ([Sidebar.tsx:752-789](../../../apps/dashboard/src/components/layout/Sidebar.tsx)), zentrales [routes.tsx](../../../apps/dashboard/src/routes.tsx) + [routeComponents.tsx](../../../apps/dashboard/src/routeComponents.tsx). [SystemPage.tsx:94-119](../../../apps/dashboard/src/features/system/SystemPage.tsx) (`TrackingToggle`) ist das exakte siteSettings-get/patch-Muster. Strenger React-Doctor (`no-fetch-in-effect` = error → React Query nutzen) + domain-literals-Plugin (siehe [[react-doctor-prevention]]), [doctor.config.ts](../../../doctor.config.ts).

## Ziel-Architektur

- **Material:** Das Glas-Recipe **ersetzt** das neumorphic-Material in denselben 5 Surface-Konsumenten. In `neumorphic.css` werden die `::before`-Rim-Regeln + die neumorphic-Box-Shadow/Bg-Logik **gelöscht** und durch die Glas-Regeln ersetzt (vertikaler Tint-Gradient + 4-Layer-Chamfer-Box-Shadow), `backdrop-filter` **nur** auf Outer-Cards (`.embossed-card`/`.section-card`), nie auf verschachtelten Controls. Die ~70 Glass-Vars werden als **plain `:root`-Runtime-Vars** (nicht `@theme`) konsumiert und via `color-mix`/`calc` auf `--g-dayness` übergeblendet. Die `neumorphic.ts`-Inline-Style-Objekte werden entfernt bzw. auf das Glas neu geschrieben (keine Wrapper). TftScreen/VfdDisplay bleiben opak.
- **Day/Night-Bridge:** Ein **neuer Reverse-Publish-Kanal** reicht die Live-`dayness` des Treibers an den Main-Thread (throttled/change-only, **nicht** per Frame) und schreibt `document.documentElement.style.setProperty("--g-dayness", value)`. Das ist die einzige netto-neue Architektur-Fähigkeit, die das Material braucht. Die vier JS-Lerp-Layer (VFD-Canvas, Footer-Text-Stroke, TFT-Cover-Gradienten, Overlay-Backdrop) re-applizieren bei jeder Dayness-Änderung, weil CSS-`color-mix` kein 2D-Canvas erreicht und keine Gradienten komponiert.
- **Config-Pipeline:** Eine neue Design-Page im Dashboard `PATCH`t einen `design_tokens`-Key (JSON-im-String) an das bestehende `/api/admin/site-settings` (null Backend-Write-Änderung). Ein **neuer Public-Read-Endpoint** liefert einen **whitelisted, validierten** Token-Blob (hinter `INTERNAL_API_KEY`). Ein **neuer Fetcher** in `api/client.ts` zieht ihn beim SSR (mit In-Process-TTL-Cache); `BaseLayout.astro` injiziert ihn als inline `<style>:root{...}` im synchronen `<head>` (kein FOUC). Die Runtime-`setProperty`-Schicht (aus der Day/Night-Bridge) re-appliziert dieselben Tokens für optionalen In-Session-Refresh nach einem Admin-Save.

## Phasen

> Phasen sind so geschnitten, dass jede einzeln shippable + verifizierbar ist. Reihenfolge: erst das Material sichtbar machen, dann die Live-Steuerung darauf.

### Phase 0 — Token-Modell als Single Source of Truth (`packages/shared`)

**Ziel:** Das exportierte Prototyp-JSON-Schema als typisiertes, validierbares Modell zentralisieren, das Frontend (Apply) **und** Backend (Whitelist/Validierung) **und** Dashboard (Editor) teilen.

- Neues Modul `packages/shared/src/design-tokens.ts`: TypeScript-Typen für den kompletten Export (`DesignTokens` = `{ shader: {...PARAMS+COLORS}, cardRadius, glass, text, vfd, footer, cover, backdrop }`), die kanonischen Defaults (1:1 aus dem Prototyp `G_DEFAULTS`/`PARAMS`/`COLORS`/`TEXT_DEFAULTS`/`VFD_DEFAULTS`/`SKYTEXT_DEFAULTS`/`COVER_DEFAULTS`/`BACKDROP_DEFAULTS`), und eine reine Validierungs-/Sanitisierungs-Funktion `parseDesignTokens(raw): { tokens, errors }` (Hex/rgb/Zahl/Range/bekannte-Keys-Allowlist, deep-merge auf Defaults, unbekannte Keys verworfen).
- Domain-Literal-Namespaces für die Control-/Mode-Keys nach `PascalCase.PascalCase`-Konvention (siehe [[react-doctor-prevention]]).
- Tests für `parseDesignTokens` (gültiges JSON, Teil-JSON, Müll, Injection-Versuche).
- **Files:** `packages/shared/src/design-tokens.ts` (neu), `packages/shared/src/index.ts` (export), `packages/shared/src/design-tokens.test.ts` (neu).
- **Gate:** `pnpm test` (shared) grün; Clean-State-Test (siehe [[monorepo-package-config]]).

### Phase 1 — Glas-Material ersetzt neumorphic in den 5 Konsumenten (statisch, hardcoded Defaults)

**Ziel:** Das Frontend rendert das Glas mit den Default-Tokens als **einziges** Material; noch keine Config, noch kein Live-Crossfade (Dayness diskret aus dem bestehenden Modus). Das neumorphic-Material wird in dieser Phase **restlos entfernt** (siehe Grundprinzip).

- `neumorphic.css`: Die `::before`-Rim-Regeln + die neumorphic-Box-Shadow/Bg-Logik **löschen** und durch das Glas-Recipe aus dem Prototyp ersetzen (Tint-Gradient + Chamfer-Box-Shadows), die per-control Var-Auflösung (`color-mix`/`calc` auf `--g-dayness`), `backdrop-filter` **nur** auf `.embossed-card`/`.section-card` (die "noFrost"-Regel des Prototyps verbatim), die grouped-corner-Styles, die Overlay-/Backdrop-Regeln, `.md-content`. Glass-Vars + `--g-dayness` als plain `:root`-Defaults (nicht `@theme`). **Kein `body.glass`-Prefix** — die Regeln gelten direkt auf den Surface-Klassen.
- `neumorphic.ts`: die alten Inline-Style-Objekte (rim/bg/box-shadow) **entfernen**; was das Glas an React-Inline-Styles braucht, sauber neu schreiben (kein Wrapper um Altes).
- Default-Tokens aus Phase 0 als initiale `:root`-Werte rendern (statisch, bis Phase 3 sie überschreibt).
- Die 5 Konsumenten direkt auf das Glas umstellen — alte Rim-/Inline-Bg-Pfade **gelöscht**, **keine** Fallback-Verzweigung.
- **Radius-Reconciliation:** `cardRadius` aus dem Token-Modell auf das bestehende `cardGeometry.ts`-Root-Token mappen (Cascade beibehalten, responsive `-sm` bleibt); die flache `--mc-*`-Kette des Prototyps **nicht** importieren.
- TftScreen/VfdDisplay bleiben opak (vom Glas ausgenommen).
- **Files:** `apps/frontend/src/styles/neumorphic.css`, `neumorphic.ts`, `EmbossedCard.tsx`, `RecessedCardParts.tsx`, `EmbossedButton.tsx`, `EmbossedSegmentedControl.tsx`, `cardGeometry.ts`, `BaseLayout.astro`.
- **Gate:** Browser-Verifikation via chrome-devtools-mcp gegen den Prototyp als Referenz (siehe [[feedback_browser_verification]]); Safari-Paint-Race-Re-Check (Chamfer statt `::before` — kein First-Paint-Artefakt, [[project_safari_paint_race]]); grep-Check, dass **keine** neumorphic-Rim-Reste, `body.glass`-Gates oder auskommentierter Alt-Code übrig sind; `pnpm doctor:diff` grün.

### Phase 2 — Day/Night Live-Crossfade (`--g-dayness`-Publish-Kanal + JS-Lerp-Applier)

**Ziel:** Das Glas blendet kontinuierlich Tag↔Nacht über, gekoppelt an den bestehenden Himmel-Treiber als einzige Wahrheitsquelle.

- Reverse-Publish-Kanal: Worker→Main-Message (und Fallback-Path-Callback) der die Live-`settings.dayness` rausreicht — **throttled/change-only**, einzelne vorallokierte Message (Zero-per-Frame-Policy + Zero-Allocation-Contract des Loops einhalten). Auf dem Main-Thread `setProperty("--g-dayness", value)` auf `document.documentElement`.
- Niemals `settings.dayness` direkt vom Main-Thread lesen (Cross-Context-Footgun) — der Kanal ist der einzige Lesepfad.
- Die vier JS-Lerp-Applier aus dem Prototyp portieren (`applyVfd`/`redrawVfd`, `applySkyText`, `applyCover`, `applyBackdrop`), gewired an Dayness-Änderung (CSS `color-mix` erreicht weder Canvas noch Gradient-Komposition).
- CSS-Konsumenten tragen **keine** eigene Transition (würde gegen den Smoothstep-Fade des Treibers kämpfen) — sie spiegeln strikt `--g-dayness`.
- **Day/Night-Umschalter wieder einbauen + aktivieren (User-Entscheidung 2026-06-14, revidiert 2026-06-13).** Der `DayNightSwitcher` (Day / Night / System / Automatic) existiert voll funktional ([DayNightSwitcher.tsx](../../../apps/frontend/src/components/navigation/DayNightSwitcher.tsx), inkl. Test), nur sein Mount-Punkt im Header ist seit der früheren User-Entscheidung 2026-06-13 deaktiviert ([PageHeader.tsx:45](../../../apps/frontend/src/components/layout/PageHeader.tsx) "deliberately NOT mounted"). Der Umschalter wieder in den `PageHeader` mounten, den "deliberately NOT mounted"-Kommentar entfernen (keine Altlast/auskommentierter Code stehen lassen, siehe Grundprinzip). Er ist der UI-Control für den `dayNightMode`-Store, der die `dayness` und damit den Glas-Crossfade dieser Phase treibt — ohne ihn gäbe es keinen sichtbaren Day/Night-Steuerpunkt. Store/Policy/`BackgroundScene` verarbeiten alle vier Modi bereits.
- **Files:** `nightSky/worker.ts`, `nightSky/loop.ts`, `nightSky/protocol.ts`, `BackgroundScene.tsx`, neue Applier-Module unter `apps/frontend/src/styles/` oder `components/cards/`, `components/navigation/DayNightSwitcher.tsx` (bereits vorhanden), `components/layout/PageHeader.tsx` (Mount + Kommentar bereinigen).
- **Gate:** Browser-Crossfade-Verifikation (sichtbarer weicher Übergang, kein Doppel-Animieren, kein Lag — vgl. die im Prototyp gefundenen Backdrop-/Opacity-Fallen); Performance-Check (kein Per-Frame-postMessage, Loop-Idle-FPS unverändert); der Day/Night-Umschalter ist im Header sichtbar und schaltet alle vier Modi durch — Himmel **und** Glas-Crossfade folgen synchron.

### Phase 3 — Config-Pipeline (Admin → DB → SSR → live, ohne Redeploy)

**Ziel:** Gespeicherte Tokens überschreiben die Defaults beim nächsten Render.

- **Public-Read-Endpoint** `GET /api/v1/site-settings/design-tokens` ([routes/site-settings.ts](../../../apps/backend/src/routes/site-settings.ts) erweitern): liest den `design_tokens`-Key über `getSetting`, gibt **nur** diesen via `parseDesignTokens` validiert/whitelisted zurück (niemals `getAllSettings` roh — Leak-Schutz), hinter `INTERNAL_API_KEY` (`internalHeaders`), `Cache-Control` gesetzt.
- **Shared-Endpoint-Eintrag** `ENDPOINTS.v1.siteSettings.designTokens` ([packages/shared/src/endpoints.ts:63](../../../packages/shared/src/endpoints.ts)).
- **SSR-Fetcher** `fetchDesignTokens()` in [api/client.ts](../../../apps/frontend/src/api/client.ts) (Muster: `fetchNavigation`), **mit In-Process-TTL-Cache** (BFF hat keinen Cache, `output: server` re-fetcht sonst jeden Render auf den `max:2`-Pool + den geteilten `apiRateLimiter`, siehe [[project_ratelimiter_shared_bucket_pattern]]).
- **SSR-Inline** in `BaseLayout.astro`: das validierte Token-Set als inline `<style>:root{...}` in den **synchronen** `<head>`, **nach** dem `global.css`-Output in der gerenderten Reihenfolge (Cascade-Sieg über `@theme`), `--g-dayness:0` (Night) als SSR-Snapshot-Seed gegen FOUC. Werte ausschließlich aus `parseDesignTokens` (kein roher String → CSS-Injection-Schutz).
- **Runtime-`setProperty`-Layer** (baut auf Phase 2): nach einem Admin-Save in derselben Session kann das Frontend die Tokens via `setProperty` ohne Full-Reload aktualisieren (optional).
- **Files:** `apps/backend/src/routes/site-settings.ts`, `packages/shared/src/endpoints.ts`, `apps/frontend/src/api/client.ts`, `apps/frontend/src/layouts/BaseLayout.astro`.
- **Gate:** End-to-End ohne Redeploy: Token-Key in DB setzen → Reload → Frontend zeigt neue Werte; FOUC-Check (kein Default-Aufblitzen); Public-Endpoint leakt nur Token-Keys; CSS-Injection-Versuch wird sanitisiert.

### Phase 4 — Dashboard Design-Page

**Ziel:** Admin-UI zum Eintragen/Speichern des JSON.

- Neue Feature-Page `apps/dashboard/src/features/system/DesignSettingsPage.tsx`: Textarea für das JSON, Live-Validierung via `parseDesignTokens` (Fehler anzeigen), Speichern via **React Query** `useMutation` → `api.patch(ENDPOINTS.admin.siteSettings.base, { design_tokens })` + `invalidateQueries` (kein fetch-in-effect, Doctor-Regel), Erfolgs-/Fehler-Feedback über `dashboard-ui`-Primitives.
- Sidebar-Eintrag in der System-Sektion ([Sidebar.tsx:752-789](../../../apps/dashboard/src/components/layout/Sidebar.tsx)), Route + Lazy-Component ([routes.tsx](../../../apps/dashboard/src/routes.tsx) + [routeComponents.tsx](../../../apps/dashboard/src/routeComponents.tsx)), Rollengating wie `/system` (`RequireNonModerator`).
- i18n: `messages.ts` 3-fach im Gleichschritt (Interface + `de` + `en`).
- Domain-Literals/Doctor-Konventionen beachten ([[react-doctor-prevention]]).
- **Files:** `apps/dashboard/src/features/system/DesignSettingsPage.tsx` (neu), `Sidebar.tsx`, `routes.tsx`, `routeComponents.tsx`, `apps/dashboard/src/i18n/messages.ts`, ggf. `packages/dashboard-ui`.
- **Gate:** `pnpm doctor:diff` + Typecheck + `pnpm lint` grün ([[feedback_pre_push_gates]]); Dashboard-Smoke via chrome-devtools-mcp ([[project_local_admin_credentials]]): JSON eintragen → speichern → Frontend übernimmt.

### Phase 5 — Nachthimmel über dieselbe Pipeline (Scope-Erweiterung)

**Ziel:** Die ~43 Shader-Parameter (PARAMS + COLORS) aus dem Token-Blob speisen den WebGL-Treiber.

- Mapping `tokens.shader` → das bestehende Night-Sky-Settings-Objekt (`NIGHT_SKY_DEFAULTS`/`NIGHT_SKY_RANGES` in [nightSky/settings.ts](../../../apps/frontend/src/components/background/nightSky/settings.ts)); Werte beim Init in den Treiber geben (existierender Einweg-Kanal in den Worker, `BackgroundScene.tsx:213-238`).
- Range-Clamping über das bestehende `NIGHT_SKY_RANGES` (kein neuer Validator).
- **Files:** `BackgroundScene.tsx`, `nightSky/settings.ts`, `nightSky/protocol.ts`, `packages/shared/src/design-tokens.ts` (Shader-Teil des Schemas).
- **Gate:** Token-Änderung an einem Shader-Param (z.B. `cloudCoverage`) → sichtbar im Himmel ohne Redeploy.

## Risiken & Mitigationen (verifiziert)

- **FOUC / Flash-of-Default:** Override muss im synchronen `<head>` von `BaseLayout` stehen, `--g-dayness:0` (Night) als SSR-Seed. Kein server:defer-Island, kein Client-only-Script.
- **CSS-Source-Order vs `@theme`:** Tailwind v4 `@theme` emittiert Vars in einem Layer; das Inline-Override muss in der **gerenderten** Reihenfolge nach dem `global.css`-Output stehen — Import-Reihenfolge im Frontmatter garantiert das nicht. Gerenderte Head-Order verifizieren oder Spezifität erhöhen.
- **`backdrop-filter`-Fehlplatzierung:** Verschachtelter Filter sampelt den rohen Himmel statt das geblurte Eltern-Ergebnis (harter none↔active-Sprung). "noFrost"-Regel verbatim portieren — Frost nur auf Outer-Cards.
- **Per-Frame-postMessage** würde die Zero-per-Frame-Policy des Night-Sky verletzen. Throttled/change-only, vorallokierte Message.
- **Cross-Context-Dayness:** `settings.dayness` lebt im Worker; Main-Thread liest sie nie direkt — nur über den Reverse-Kanal.
- **Doppel-Animieren:** CSS-Konsumenten tragen keine Transition; sie spiegeln strikt `--g-dayness`.
- **`@theme` = Build-Time:** Glass-/Dayness-Vars als plain `:root`-Runtime-Vars definieren, nicht als `@theme`-Einträge.
- **Caching:** In-Process-TTL-Cache für den Token-Fetch + `Cache-Control`; `X-Forwarded-For` durchreichen (siehe [[project_ratelimiter_shared_bucket_pattern]]).
- **CSS-Injection:** Persistierte, admin-editierbare Werte nur nach `parseDesignTokens`-Validierung in `<style>` emittieren — nie rohe Strings.
- **Public-Leak:** Public-Handler whitelistet exakt den/die Token-Key(s); nie `getAllSettings` roh.
- **Safari-mask-composite:** Das `::before` (und sein `translateZ(0)`-Fix) entfällt mit dem gelöschten neumorphic-Material komplett; Chamfer-Box-Shadow auf First-Paint prüfen, ggf. eigenen GPU-Layer-Pre-Alloc auf der Glas-Fläche ([[project_safari_paint_race]]).
- **Dual Migration Trackers:** Bevorzugt der bestehende K/V-Store (null Schema-Änderung). Falls je eine Tabelle nötig: Drizzle-only + beide Tracker synchron halten ([[project_dual_migration_trackers]]).
- **React-Doctor blocking:** `no-fetch-in-effect` ist error — React Query statt `useEffect`-Fetch; Discriminants als `PascalCase`-as-const; `pnpm doctor:diff` vor Commit.
- **`messages.ts` 3-fach:** Interface + `de` + `en` im Gleichschritt, sonst Typecheck-Bruch.
- **Toter Tracking-Präzedenz:** Nicht den Env-Var-Pfad kopieren (Admin-Edit ginge nie live). Tokens immer aus dem DB-Store.

## Verified Facts (Plan-Schreibzeitpunkt 2026-06-14)

Alle folgenden Referenzen wurden vom Analyse-Workflow durch **echtes Datei-Lesen** ermittelt; die mit (✓grep) markierten habe ich zusätzlich selbst per `grep -n` am Plan-Schreibzeitpunkt bestätigt:

- `site_settings`-Tabelle: `apps/backend/src/db/schemas/postgres.ts:869` (✓grep `siteSettings = pgTable("site_settings"`).
- Public-Route + Admin-Route: `apps/backend/src/routes/site-settings.ts:27` (`siteSettingsPublicRoutes`), :66-83 (Admin GET/PATCH, arbitrary keys) (✓grep).
- Shared-Endpoints: `packages/shared/src/endpoints.ts:63` (`v1.siteSettings.tracking`), :196 (`admin.siteSettings`) (✓grep).
- Material-Klassen: `apps/frontend/src/styles/neumorphic.css:24-25,59,132,136` (`embossed-/recessed-gradient-border`); **kein** `backdrop-filter` (✓grep, null Treffer).
- 5 Material-Konsumenten: `EmbossedCard.tsx:245-267`, `RecessedCardParts.tsx:235-262`, `EmbossedButton.tsx:1-15/55`, `EmbossedSegmentedControl.tsx:58-103`.
- Radius-Cascade: `apps/frontend/src/components/cards/cardGeometry.ts:1-5`, `EmbossedCard.tsx:240-262`, `neumorphic.css:59-120`.
- Day/Night-Store: `dayNightMode.ts:14` (`DayNightMode` Enum), :28 (Default `Night`), :32 (subscribers) (✓grep); Policy `dayNightPolicy.ts:34-45`. Umschalter: `components/navigation/DayNightSwitcher.tsx:47` (✓grep, voll funktional, alle 4 Modi + Test), Mount deaktiviert in `components/layout/PageHeader.tsx:45` ("deliberately NOT mounted", ✓grep).
- Night-Sky-Module: `apps/frontend/src/components/background/nightSky/{loop,settings,worker,scene,protocol}.ts` (✓ls); kontinuierliche Dayness `loop.ts:163-173`, Treiber-Kanal `BackgroundScene.tsx:183-238/26-37/213-238`.
- SSR-Shell: `BaseLayout.astro:33` (`await fetchNavigation`), :38-62 (Head), :70-72 (`transition:persist`).
- BFF: `api/client.ts:21-53` (`internalHeaders`/`fetchWithTimeout`), :185-194 (`fetchNavigation`-Muster). Server→Client-Injektion-Präzedenz: `pages/index.astro:59-64` (`is:inline define:vars`).
- Dashboard: `SystemPage.tsx:94-119` (siteSettings get/patch), `Sidebar.tsx:752-789`, `routes.tsx:58-71`, `routeComponents.tsx:111-115`, `dashboard-ui/.../DashboardControls.tsx:31-91`, `messages.ts:760-761`, `doctor.config.ts:10-26`.
- Prototyp-Export-Schema: `card-prototype.html:1538-1545` (Export-Dump), :2463-2502 (`G_CONTROLS`/`G_DEFAULTS`), :446-611 (Material-CSS).

## Checklist

- [ ] Struktur-/Architektur-Fragen zuerst via Graphify (`graphify query`) geklärt, dann grep/Read — Graph frisch gebaut ([[feedback_graphify_first]])
- [ ] Alle Code-Referenzen verifiziert (Funktionen, Scripts, Pfade, Env-Vars, Package-Manager-Kommandos) — beim Execute re-grep gegen aktuelles Repo (Plans altern, [[feedback_plan_drift_prevention]])
- [ ] Phase 0: `design-tokens.ts` Modell + `parseDesignTokens` + Tests grün (Clean-State)
- [ ] Phase 1: neumorphic restlos gelöscht + Glas-CSS + 5 Konsumenten + Radius-Reconciliation, Browser-verifiziert gegen Prototyp; grep-Check keine Alt-Reste/`body.glass`/Dead-Code
- [ ] Phase 2: `--g-dayness`-Publish-Kanal + 4 JS-Lerp-Applier + DayNightSwitcher im Header (re)aktiviert, Crossfade Browser-verifiziert (alle 4 Modi schalten Himmel + Glas synchron)
- [ ] Phase 3: Public-Endpoint + Shared-Entry + SSR-Fetcher (TTL-Cache) + SSR-Inline, E2E ohne Redeploy verifiziert
- [ ] Phase 4: Dashboard Design-Page + Sidebar/Route + i18n 3-fach, Doctor/Typecheck/Lint grün, Dashboard-Smoke
- [ ] Phase 5: Shader-Params über dieselbe Pipeline, Himmel-Änderung ohne Redeploy verifiziert
- [ ] Pre-Push-Gates komplett: Typecheck + `pnpm lint` + `pnpm doctor:diff` ([[feedback_pre_push_gates]])
- [ ] Bei Completion: `## Completed`-Sektion ergänzen, `git mv` nach `.claude/plans/done/`, `WHATS-NEXT.md` aktualisieren ([[git]])

## Offene Punkte für den Execute-Start

- Genaue Mapping-Tabelle Prototyp-Shader-Keys → `NIGHT_SKY_DEFAULTS`/`NIGHT_SKY_RANGES` (beim Lesen von `nightSky/settings.ts` im Execute erstellen).
- Exakter Einfügepunkt + gerenderte Head-Reihenfolge für das Inline-`<style>` (im Execute an `BaseLayout.astro` verifizieren).
- Ob der In-Session-Runtime-Refresh (Phase 3) wirklich gewünscht ist oder ein simpler Reload nach Save reicht (mit User klären, sobald Phase 3 ansteht).

## Completed (2026-06-15)

Alle sechs Phasen umgesetzt und browser-verifiziert (chrome-devtools-mcp). Gates grün: Tests (Backend 980, Frontend 139, Shared 39, Dashboard), Typechecks (alle 4 Packages, 0 Errors), Biome-Lint (654 Files, 0 Errors), React-Doctor (Frontend + Dashboard, 0 Issues).

- **Phase 0** — `packages/shared/src/design-tokens.ts`: `DesignTokens`-Modell + `parseDesignTokens` (Hex/rgb/Range/Allowlist/Deep-Merge, CSS-Injection-safe) + 18 Tests. Export in `index.ts`.
- **Phase 1** — `neumorphic.css` komplett auf Glas umgeschrieben (per-control Resolver + shared Recipe + Chamfer-Box-Shadows + Frost nur auf Outer-Cards/`noFrost`), `neumorphic.ts` gelöscht, alle 5 Klassen-Konsumenten + ~9 opake-Bg-Konsumenten entkoppelt, `mc-raised-control` Dead-Code entfernt, Radius-Default 22→32px tunebar via `--mc-card-radius`. Browser-verifiziert (Computed Styles: Nacht-Defaults, Frost-Platzierung, kein `body.glass`).
- **Phase 2** — Reverse-Publish-Kanal `--g-dayness` (Worker→Main, change-gated, zero-alloc im Loop) + Text-Crossfade (CSS `color-mix` auf `--color-text-*`) + DayNightSwitcher im Header re-aktiviert. Browser-verifiziert (dayness rampt 0→1, Himmel+Glas+Text synchron). **Abweichung:** Die 4 Prototyp-Canvas/Gradient-Applier (VFD/Cover/Footer-Stroke/Backdrop-Scrim) bewusst deferred (separater Follow-up-Task) — Production nutzt eigene Hardware-Palette-Components (VFD/TFT plan-designated „opak"), kein Dead-Code geshippt.
- **Phase 3** — Public-Endpoint `GET /api/v1/site-settings/design-tokens` (validiert via `parseDesignTokens`, nie `getAllSettings` roh) + Shared-Entry + SSR-Fetcher (In-Process-TTL-Cache) + SSR-Inline `<style html:root>` (FOUC-safe via Spezifität). **Drift behoben:** kein `INTERNAL_API_KEY`-Gate existiert → unauthenticated Public-Pattern gespiegelt. E2E ohne Redeploy verifiziert.
- **Phase 4** — `DesignSettingsPage` Body (React Query, JSON-Textarea, Live-Validierung, Save→`api.patch`) + i18n 3-fach. Wiring (Sidebar/Routes/Lazy) war in WIP komplett. Dashboard-Smoke E2E verifiziert (UI-Save → DB → Frontend-Übernahme).
- **Phase 5** — `tokens.shader` → Night-Sky-Treiber (`NightSkyBackground.astro`→Island-Prop→`mergeShaderTokens`, geclampt via `NIGHT_SKY_RANGES`, mode-owned Keys ausgenommen). **Abweichung:** `SHADER_DEFAULTS` an `NIGHT_SKY_DEFAULTS` angeglichen (no-override = Production-Himmel, nicht Prototyp). **Bug gefunden+gefixt:** `parseDesignTokens` war nicht idempotent für den Shader (flach vs. nested) — Fix + Test. Browser-verifiziert (magenta Himmel via Token-Override, ohne Redeploy).

**Offen (eigener Task):** Phase-2-Follow-up — die 4 peripheren JS-Lerp-Applier an ihre Production-Components verdrahten (nur sichtbar relevant, sobald day≠night-Tokens getunt werden).
