# CC-Pfad — Frontend (Hero-Umschalter + CC-Track-Seite) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans. Steps use checkbox (`- [ ]`) syntax. **Browser-Verifikation Pflicht** (Memory feedback_browser_verification: `agent-browser` CLI bzw. chrome-devtools-mcp; Dev-Server via `./app`, nicht manuell).

**Goal:** Den CC-Modus im Frontend verdrahten: ein `commercial | cc`-Umschalter im Hero (mit eigenem grünem Akzent + Modus-Icon), der den Resolve auf die bestehende `/api/v1/cc/resolve`-Route lenkt; die CC-Trefferliste über das bestehende `DisambiguationPanel`; und eine CC-Track-Seite, die das bestehende Grundgerüst teilt, aber den „Listen On"-Service-Grid durch CC-Blöcke (Lizenz-Badge, Attribution, Download, „Auf Jamendo öffnen") ersetzt und den vollen Jamendo-Stream im bestehenden Player abspielt.

**Architecture (gestaffelt):** Maximale Wiederverwendung. `EmbossedSegmentedControl`, `DisambiguationPanel`, der Player-Controller (`AudioPreviewPlayer`) und das `dayNightMode.ts`-Store-Muster existieren bereits und werden nur verdrahtet/erweitert. Der Modus ist ein persistenter Store (`mc:resolveMode`); er wählt pro Resolve den Endpoint (commercial → `/api/resolve`, cc → `/api/cc/resolve`). Der cc-track-Erfolg bekommt einen eigenen State-Zweig + Parser (kein `platforms`). CC-Grün läuft token-konform über zwei neue Glas-Flächen + einen `data-resolve-mode="cc"`-Scope, **keine** ad-hoc Tailwind-Farben (AGENTS.md).

**Nicht in diesem Plan (Plan 3c / später):** Interaktiver Waveform-Scrubber (Seeking existiert heute nicht; der CC-Player nutzt vorerst den bestehenden read-only-Fortschritt mit vollem Stream). CC-Genre-Discovery, CC-Album-/Künstler-Seiten, permanente CC-Share-Page (`/{shortId}`-SSR).

**Tech Stack:** Astro + React 19, Design-Token-System (`packages/shared/src/design-tokens.ts` + `apps/frontend/src/styles/glass.css`), Phosphor-Icons, vitest, Biome, pnpm. domain-literals-Doctor-Rule ist hart: alle neuen Discriminant-Literale als `as const` PascalCase.PascalCase-Namespaces.

**Backend-Voraussetzung (erfüllt):** `ENDPOINTS.v1.ccResolve`, `CcResolveSuccessResponse`/`ApiCcTrack` existieren bereits (Plan 2, via Barrel exportiert). Ein **echter Resolve braucht `JAMENDO_CLIENT_ID`** in `apps/backend/.env.local` — für die Browser-Verifikation muss der User einen kostenlosen Jamendo-Key setzen (sonst liefert die Trefferliste leere/Fehler-Antworten). Unit-/Component-Tests stubben das.

---

## File Structure

- **Create:** `apps/frontend/src/lib/resolve/resolveMode.ts` — Persist-Store (Klon von `components/background/dayNightMode.ts`).
- **Create:** `apps/frontend/src/pages/api/cc/resolve.ts` — Astro-Proxy (Klon von `pages/api/resolve.ts`).
- **Create:** `apps/frontend/public/icons/creative-commons.svg` — CC-Logo-Brand-Asset.
- **Create:** `apps/frontend/src/components/cards/CcInfoCard.tsx` — Lizenz/Attribution/Download/Jamendo-Block (ersetzt den Service-Grid).
- **Modify:** `packages/shared/src/endpoints.ts` — `frontend.ccResolve`.
- **Modify:** `packages/shared/src/design-tokens.ts` — `GlassControl.CcSegTrack`/`.CcSegIndicator` + `GLASS_DEFAULTS`-Klone (grün).
- **Modify:** `apps/frontend/src/styles/glass.css` — `--ccSegTrack-*`/`--ccSegIndicator-*` Fallbacks + Resolver-Klassen + `[data-resolve-mode="cc"]`-Accent-Scope.
- **Modify:** `apps/frontend/src/api/client.ts` — `resolveCcTrack`.
- **Modify:** `apps/frontend/src/lib/types/app.ts` — `ResolveMode`, `AppStateType.CcResult`, `ActiveResultKind.CcSong`, `CcTrackResult`, `AppState`/`AppAction`-Erweiterung.
- **Modify:** `apps/frontend/src/lib/types/media-card.ts` — `CcTrackContentConfiguration`.
- **Modify:** `apps/frontend/src/lib/resolve/parsers.ts` — `parseCcResolveResponse`, `buildCcShareConfig`, `appReducer`-Case.
- **Modify:** `apps/frontend/src/hooks/useAppState.ts` — mode-aware fetch + cc-track-Branch + cc-Pick.
- **Modify:** `apps/frontend/src/components/landing/LandingPage.tsx` — Umschalter über dem Hero + Modus an useAppState + `data-resolve-mode`-Scope.
- **Modify:** `apps/frontend/src/components/landing/HeroInput.tsx` — Modus-Icon links im Feld.
- **Modify:** die CC-Track-Render-Komposition (`MediaCard`/`MediaSummaryCard` + `ServicesCard`-Ersatz) — CC-Variante.

---

## Task 1: Domain-Literale, Mode-Store, CC-Result-Typen

**Files:** `apps/frontend/src/lib/types/app.ts`, `apps/frontend/src/lib/resolve/resolveMode.ts`

- [ ] **Step 1: `ResolveMode`-Namespace + CC-State-Literale** — in `apps/frontend/src/lib/types/app.ts`:
  - Neuen `as const`-Namespace ergänzen (domain-literals-Pflicht, PascalCase.PascalCase):
    ```typescript
    export const ResolveMode = { Commercial: "commercial", Cc: "cc" } as const;
    export type ResolveMode = (typeof ResolveMode)[keyof typeof ResolveMode];
    ```
  - `AppStateType` (`:65-76`) um `CcResult: "cc-result"` erweitern.
  - `ActiveResultKind` (`:59-63`) um `CcSong: "cc-song"` erweitern.
  - `CcTrackResult`-Interface (analog `SongResult` `:78-91`, aber **ohne** `platforms`; mit CC-Feldern):
    ```typescript
    export interface CcTrackResult {
      kind: typeof ActiveResultKind.CcSong;
      jamendoId: string;
      title: string;
      artist: string;
      album?: string;
      releaseDate?: string;
      durationMs?: number;
      artworkUrl: string;
      streamUrl: string;
      licenseCcurl?: string;
      downloadUrl?: string;
      downloadAllowed: boolean;
      waveform?: string;
      jamendoUrl?: string;
      shareUrl: string;
    }
    ```
  - `ActiveResult` (`:116`) → Union um `CcTrackResult` erweitern.
  - `AppState` (`:118-128`) → Zweig ergänzen: `| { type: typeof AppStateType.CcResult; ccActive: CcTrackResult }`.
  - `AppAction` (`:135-146`) → Action ergänzen: `| { type: "RESOLVE_CC_SUCCESS"; ccActive: CcTrackResult }`.

- [ ] **Step 2: `resolveMode.ts`-Store** — `apps/frontend/src/lib/resolve/resolveMode.ts` erstellen. Lies `apps/frontend/src/components/background/dayNightMode.ts` und klone das Muster exakt (module-level Store mit `getResolveMode`/`setResolveMode`/`subscribeResolveMode`, `localStorage` read/write in try/catch, SSR-safe, listener-Set). Konstanten: `STORAGE_KEY = "mc:resolveMode"`, Default `ResolveMode.Commercial`. Validierung: nur `ResolveMode.Commercial`/`ResolveMode.Cc` akzeptieren, sonst Default. TSDoc auf jeder Export-Funktion.

- [ ] **Step 3: Typecheck.** `pnpm --filter @musiccloud/frontend check` → PASS. (Reducer-Case kommt in Task 4 — bis dahin kann der Switch über `AppAction` ein „nicht behandelt" zeigen; falls TS einen exhaustiveness-Fehler in `appReducer` wirft, in diesem Task einen Minimal-Case `case "RESOLVE_CC_SUCCESS": return { screen, stack };` als Platzhalter setzen und in Task 4 ausfüllen — ODER Task 4 vorziehen. Implementer entscheidet nach der echten TS-Fehlerlage.)

- [ ] **Step 4: Biome + Commit**
  ```bash
  pnpm exec biome check --write apps/frontend/src/lib/types/app.ts apps/frontend/src/lib/resolve/resolveMode.ts
  git add apps/frontend/src/lib/types/app.ts apps/frontend/src/lib/resolve/resolveMode.ts
  git commit -m "Feat: add resolve-mode store and CC result types"
  ```

---

## Task 2: CC-Grün (token-konform)

**Files:** `packages/shared/src/design-tokens.ts`, `apps/frontend/src/styles/glass.css`

Kein freistehendes Farb-Token — Farbe lebt je Glas-Fläche als day/night-Paar. Zwei neue Flächen nach dem `navTrack`/`navIndicator`-Muster.

- [ ] **Step 1: Token-Flächen** — `packages/shared/src/design-tokens.ts`:
  - `GlassControl` (`:35-46`) um `CcSegTrack: "ccSegTrack"`, `CcSegIndicator: "ccSegIndicator"` erweitern.
  - `GLASS_DEFAULTS` (`:601-652`, `navTrack`/`navIndicator`-Block) klonen als `ccSegTrack`/`ccSegIndicator`. `ccSegTrack` = identisch zu `segTrack` (neutraler recessed Track). `ccSegIndicator` = `segIndicator`-Klon, aber `tintTop`/`tintBottom` auf ein **ruhiges Grün angelehnt an `#30D158`** (day + night), exakter Ton später im Browser feinjustiert. Validierungs-/Emit-Loops laufen automatisch (`Object.keys(GLASS_DEFAULTS)`).

- [ ] **Step 2: Shared bauen.** `pnpm --filter @musiccloud/shared build` → PASS (emittiert die neuen CSS-Var-Decls).

- [ ] **Step 3: CSS-Fallbacks + Resolver + Accent-Scope** — `apps/frontend/src/styles/glass.css`:
  - `:root`-Fallbacks `--ccSegTrack-*`/`--ccSegIndicator-*` nach dem `navTrack`/`navIndicator`-Muster (`:176-213`).
  - Resolver-Klassen `.mc-glass-cc-seg-track`/`.mc-glass-cc-seg-indicator` nach dem seg/nav-Muster (`:524-573`).
  - Accent-Scope: `[data-resolve-mode="cc"] { --color-accent: <grün>; --color-accent-rgb: <r,g,b>; }` — dadurch recoloren Submit-Button-Fill (`HeroSubmitSlot` liest `var(--color-accent)`) und Focus-Ring (`.hero-field:focus-within`) automatisch. Grün-Wert an `#30D158` angelehnt.

- [ ] **Step 4: Doctor + Biome + Commit**
  ```bash
  pnpm exec biome check --write packages/shared/src/design-tokens.ts apps/frontend/src/styles/glass.css
  pnpm doctor:diff
  git add packages/shared/src/design-tokens.ts apps/frontend/src/styles/glass.css
  git commit -m "Feat: add CC-mode green glass surfaces and accent scope"
  ```

---

## Task 3: Endpoint-Routing (Proxy + Client)

**Files:** `packages/shared/src/endpoints.ts`, `apps/frontend/src/pages/api/cc/resolve.ts`, `apps/frontend/src/api/client.ts`

- [ ] **Step 1: Frontend-Endpoint** — in `packages/shared/src/endpoints.ts` im `frontend`-Objekt, neben `resolve: "/api/resolve"` (`:107`): `ccResolve: "/api/cc/resolve",`. Dann `pnpm --filter @musiccloud/shared build`.

- [ ] **Step 2: Client-Funktion** — `apps/frontend/src/api/client.ts`: `resolveCcTrack(body, clientIp?, origin?)` als Klon von `resolveTrack` (`:143-160`), aber gegen `backendUrl(ENDPOINTS.v1.ccResolve)`. Gleiche Header (X-API-Key/X-Forwarded-For/Origin), 15s Timeout, rohe `Response` zurück. TSDoc.

- [ ] **Step 3: Astro-Proxy** — `apps/frontend/src/pages/api/cc/resolve.ts`: 1:1-Klon von `apps/frontend/src/pages/api/resolve.ts`, nur `resolveTrack` → `resolveCcTrack`. (Verzeichnis `pages/api/cc/` neu anlegen.)

- [ ] **Step 4: Typecheck + Biome + Commit**
  ```bash
  pnpm --filter @musiccloud/frontend check
  pnpm exec biome check --write packages/shared/src/endpoints.ts apps/frontend/src/pages/api/cc apps/frontend/src/api/client.ts
  git add packages/shared/src/endpoints.ts apps/frontend/src/pages/api/cc apps/frontend/src/api/client.ts
  git commit -m "Feat: add CC resolve proxy and client"
  ```

---

## Task 4: CC-Parser, Reducer-Case, Config

**Files:** `apps/frontend/src/lib/resolve/parsers.ts`, `apps/frontend/src/lib/types/media-card.ts`

- [ ] **Step 1: `CcTrackContentConfiguration`** — `apps/frontend/src/lib/types/media-card.ts`: einen Config-Typ analog `SongContentConfiguration` lesen und eine CC-Variante ergänzen (`type: "cc-track"`), **ohne** `platforms`/`platformsLabel`; mit `licenseCcurl?`, `attribution` (Künstler), `downloadUrl?`, `downloadAllowed`, `jamendoUrl?`, `streamUrl`, `waveform?`, `shortUrl`, `shortId?`. Lies die Datei zuerst, um die Basis-Felder (`title`/`artist`/`artworkUrl`/`metaLine`/`srAnnouncement`) exakt zu spiegeln.

- [ ] **Step 2: `parseCcResolveResponse` + `buildCcShareConfig`** — `apps/frontend/src/lib/resolve/parsers.ts`:
  - `parseCcResolveResponse(data: CcResolveSuccessResponse): CcTrackResult` analog `parseResolveResponse` (`:82-98`), mappt `ApiCcTrack` → `CcTrackResult` (kein `apiLinksToPlatformLinks`). `kind: ActiveResultKind.CcSong`, `jamendoUrl = data.track.shareUrl`, `shareUrl = data.shortUrl`.
  - `buildCcShareConfig(cc: CcTrackResult, t): CcTrackContentConfiguration` analog `buildShareConfigFromActive` (`:262-324`, song-Zweig), aber `platforms` weglassen und die CC-Felder füllen; `metaLine` via `buildMetaLine`. `shortId` via `shortIdFromShortUrl(cc.shareUrl)`.
  - **NICHT** in `parseUnifiedResolveResponse` (`:129-133`) mischen (`cc-track` ist kein `UnifiedResolveSuccessResponse`-Member).

- [ ] **Step 3: Reducer-Case** — in `appReducer` (`:30-76`) neben `RESOLVE_SUCCESS`: `case "RESOLVE_CC_SUCCESS": return { screen: { type: AppStateType.CcResult, ccActive: action.ccActive }, stack };` (falls in Task 1 ein Platzhalter-Case gesetzt wurde, hier ausfüllen). Import `AppStateType` falls nötig.

- [ ] **Step 4: Typecheck + Biome + Commit**
  ```bash
  pnpm --filter @musiccloud/frontend check
  pnpm exec biome check --write apps/frontend/src/lib/resolve/parsers.ts apps/frontend/src/lib/types/media-card.ts
  git add apps/frontend/src/lib/resolve/parsers.ts apps/frontend/src/lib/types/media-card.ts
  git commit -m "Feat: add CC resolve parser, reducer case, and content config"
  ```

---

## Task 5: useAppState — mode-aware Resolve

**Files:** `apps/frontend/src/hooks/useAppState.ts`

Der Hook bekommt den Modus als Argument (KISS — die LandingPage liest den Store und reicht ihn durch). Der gewählte Modus wählt Endpoint + Parse pro Resolve.

- [ ] **Step 1:** `useAppState(mode: ResolveMode)`-Signatur (Default `ResolveMode.Commercial`). Den Modus per `useCallback`-Deps in `handleSubmit`/`handleSelectCandidate` einbinden.

- [ ] **Step 2:** In `handleSubmit` (`:84`): Endpoint per Modus wählen — `const endpoint = mode === ResolveMode.Cc ? ENDPOINTS.frontend.ccResolve : ENDPOINTS.frontend.resolve;` an der fetch-Site (`:90`). Nach den bestehenden `status`-Branches (`:106-129`), VOR dem unified-else (`:130`), einen CC-Branch einfügen:
  ```typescript
  if ("type" in data && data.type === CcTrackType.CcTrack) {
    sendMusicSignal(ResolveSignal.Completed);
    dispatch({ type: "RESOLVE_CC_SUCCESS", ccActive: parseCcResolveResponse(data) });
    return;
  }
  ```
  Den Response-Typ-Cast (`:101-105`) um `| CcResolveSuccessResponse` erweitern. `CcTrackType` ist ein `as const`-Namespace (`{ CcTrack: "cc-track" } as const`) — in `app.ts` oder einem geteilten literals-Modul anlegen (domain-literals-Pflicht, kein inline `"cc-track"`).

- [ ] **Step 3:** In `handleSelectCandidate` (`:139`): im CC-Modus den CC-Endpoint treffen UND die cc-track-Antwort verarbeiten statt `{...data, type:"track"}` (`:157`). Konkret: bei `mode === ResolveMode.Cc` → fetch gegen `ccResolve`, Response als `CcResolveSuccessResponse`, `dispatch({ type: "RESOLVE_CC_SUCCESS", ccActive: parseCcResolveResponse(data) })`. Bei commercial → unverändert.
  - **Modus-Konsistenz:** Der Pick muss denselben Modus nutzen wie das Submit, das die Liste erzeugte. Da `useAppState(mode)` den aktuellen Modus kennt und der Umschalter im Ergebnis-View ausgeblendet ist (Task 6: nur Idle sichtbar), kann der Modus zwischen Submit und Pick nicht wechseln — der aktuelle `mode` ist korrekt. (Falls später doch nötig: Modus im `disambiguation_loading`-State mittracken.)

- [ ] **Step 4: Typecheck + Tests + Biome + Commit**
  ```bash
  pnpm --filter @musiccloud/frontend check
  pnpm --filter @musiccloud/frontend test:run
  pnpm exec biome check --write apps/frontend/src/hooks/useAppState.ts apps/frontend/src/lib/types/app.ts
  git add apps/frontend/src/hooks/useAppState.ts apps/frontend/src/lib/types/app.ts
  git commit -m "Feat: route resolve through CC endpoint in CC mode"
  ```

---

## Task 6: Hero-Umschalter + Modus-Icon + CC-Logo

**Files:** `apps/frontend/src/components/landing/LandingPage.tsx`, `apps/frontend/src/components/landing/HeroInput.tsx`, `apps/frontend/public/icons/creative-commons.svg`

- [ ] **Step 1: CC-Logo-Asset** — `apps/frontend/public/icons/creative-commons.svg` anlegen (offizielles CC-Logo, einfarbig/currentColor-fähig, viewBox sauber). Analog zu den Service-SVGs unter `public/icons/`.

- [ ] **Step 2: Modus lesen + Umschalter** — `LandingPage.tsx`:
  - Modus via `useSyncExternalStore(subscribeResolveMode, getResolveMode, () => ResolveMode.Commercial)` lesen (Muster `DayNightSwitcher.tsx:64-91`).
  - `useAppState(mode)` mit dem Modus aufrufen.
  - Im `searchFieldRef`-Block (`:389-406`) DIREKT ÜBER `<HeroInput>` einen `EmbossedSegmentedControl` mit zwei Segmenten (`commercial`/`cc`, lokalisierte Labels) einsetzen, `value={mode}`, `onChange={setResolveMode}`, nur sichtbar wenn `!showCompact` (Idle). Lies `EmbossedSegmentedControl.tsx:48-149` für die `Segment<T>`-API.
  - Auf dem Hero-Subtree (dem Container um Umschalter + HeroInput) `data-resolve-mode={mode}` setzen (aktiviert den Grün-Scope aus Task 2).
  - `mode` als Prop an `HeroInput` durchreichen.

- [ ] **Step 3: Modus-Icon links im Feld** — `HeroInput.tsx`: als ERSTES Flex-Kind im `RecessedCard` VOR dem `<input>` (`:145-146`) ein Modus-Icon einsetzen: `mode === ResolveMode.Cc` → `<img src="/icons/creative-commons.svg" alt="" aria-hidden className="size-5 …" />`, sonst `<CopyrightIcon weight="duotone" aria-hidden className="size-5 …" />` (Import aus `@phosphor-icons/react`). Das Input-`pl-6` (`:162`) auf `pl-2` reduzieren, Gap token-konform. Icon-Tönung darf dem Accent folgen (CC grün) oder neutral bleiben — im Browser justieren.

- [ ] **Step 4: Doctor + Typecheck + Biome + Commit**
  ```bash
  pnpm --filter @musiccloud/frontend check
  pnpm doctor:diff
  pnpm exec biome check --write apps/frontend/src/components/landing
  git add apps/frontend/src/components/landing apps/frontend/public/icons/creative-commons.svg
  git commit -m "Feat: add commercial/cc hero toggle with mode icon and green accent"
  ```

---

## Task 7: CC-Track-Seite (CcInfoCard, voller Stream)

**Files:** `apps/frontend/src/components/cards/CcInfoCard.tsx` (neu), die Render-Komposition (`MediaCard`/`MediaSummaryCard` + `ServicesCard`-Ersatz), `LandingPage.tsx`-Routing zum CC-Result.

- [ ] **Step 1: `CcInfoCard`** — neue Komponente, die für einen `CcTrackContentConfiguration`/`CcTrackResult` rendert: **Lizenz-Badge** (exakte CC-Lizenz aus `licenseCcurl`, verlinkt), **Attribution** (Künstler + Lizenz-Hinweis), **Download**-Button wenn `downloadAllowed && downloadUrl`, **„Auf Jamendo öffnen"** (`jamendoUrl`). Reuse bestehender Button-/Card-Primitives (RecessedCard/Buttons, Phosphor-Icons). TSDoc + a11y (Lizenz-Link mit `rel`, Download mit `download`-Hinweis).

- [ ] **Step 2: CC-Render-Komposition** — die CC-Track-Seite teilt `MediaSummaryCard` (Cover + VFD + Player + Share) und ersetzt nur den Service-Grid-Block durch `CcInfoCard`. Lies `MediaCard.tsx:40-116` und `ShareLayout.tsx:660-679` + `media-card.ts`-Config-Conditions. Sauberster Schnitt: Die bestehende Komposition rendert den Platform-Grid nur wenn `content.platforms.length > 0` (bzw. ein `showPlatforms`-Flag). Bei `CcTrackContentConfiguration` (kein `platforms`) den Grid weglassen und stattdessen `CcInfoCard` einsetzen. Der **Player** bekommt `previewUrl = streamUrl` (voller Stream; die 30s-Default werden von `loadedmetadata` überschrieben, `AudioPreviewPlayer.tsx:104/884` — keine Player-Änderung nötig).

- [ ] **Step 3: LandingPage-Routing** — wenn `state.type === AppStateType.CcResult`, die CC-Komposition mit `buildCcShareConfig(state.ccActive, t)` rendern (analog zum bestehenden `result`-Zweig, der `buildShareConfigFromActive` nutzt). Lies den bestehenden Result-Render-Zweig in `LandingPage.tsx`, um die CC-Variante daneben zu setzen.

- [ ] **Step 4: Doctor + Typecheck + Tests + Biome + Commit**
  ```bash
  pnpm --filter @musiccloud/frontend check
  pnpm --filter @musiccloud/frontend test:run
  pnpm doctor:diff
  pnpm exec biome check --write apps/frontend/src/components
  git add apps/frontend/src/components
  git commit -m "Feat: render CC track page with license/attribution/download block"
  ```

---

## Task 8: Browser-Verifikation + Gesamt-Gates

- [ ] **Step 1: Dev-Server** — via `./app start` (nicht manuell). `JAMENDO_CLIENT_ID` muss in `apps/backend/.env.local` gesetzt sein (sonst keine echten Treffer). Falls nicht gesetzt: dem User melden + Key anfordern, dann verifizieren.
- [ ] **Step 2: Browser-Smoke** (agent-browser / chrome-devtools-mcp): (a) Umschalter sichtbar im Idle, wechselt Modus, Eingabe wird grün (Accent + Focus-Ring), CC-Icon links. (b) CC-Freitext-Query → Trefferliste (DisambiguationPanel). (c) Auswahl → CC-Track-Seite mit vollem Player (spielt Jamendo-Stream), Lizenz-Badge, Attribution, Download, „Auf Jamendo". (d) Zurück zu commercial → blaue Identität + kommerzieller Flow unverändert. Screenshots als Beleg.
- [ ] **Step 3: Grün feinjustieren** am Code, Screenshots dem User zeigen.
- [ ] **Step 4: Volle Gates** — `pnpm --filter @musiccloud/frontend check`, `pnpm --filter @musiccloud/frontend test:run`, `pnpm lint` (Biome), `pnpm doctor:diff` — alle grün.

---

## Self-Review (vom Plan-Autor)

**Spec-Abdeckung:** Hero-Umschalter mit Modus-Persistenz (`mc:resolveMode`) ✓, farbliche Trennung blau/grün + Modus-Icon ✓, CC-Modus → getrennter Resolve-Endpoint ✓, Trefferliste (DisambiguationPanel reused) ✓, CC-Track-Seite mit gleichem Grundgerüst + Lizenz/Attribution/Download/Jamendo statt Service-Grid ✓, voller Stream ✓. **Bewusst gestaffelt:** Waveform-Scrubber (Plan 3c), CC-Genre/Album/Artist, permanente Share-Page.

**Domain-literals-Compliance:** `ResolveMode`, `AppStateType.CcResult`, `ActiveResultKind.CcSong`, `CcTrackType.CcTrack` alle als `as const` PascalCase.PascalCase — keine inline `"cc"`/`"cc-track"`/`"cc-result"`-Vergleiche. AGENTS.md: CC-Grün über Glas-Flächen + Accent-Scope, keine ad-hoc Tailwind-Farben.

**Typ-Konsistenz:** `CcTrackResult` (app.ts) → `CcTrackContentConfiguration` (media-card.ts) → `CcInfoCard`-Props; `parseCcResolveResponse` mappt `ApiCcTrack` → `CcTrackResult`; Reducer-Action `RESOLVE_CC_SUCCESS` trägt `ccActive: CcTrackResult`; State-Zweig `CcResult` liest `ccActive`.

**Verifizierte Referenzen (am Plan-Write-Time gelesen):** `useAppState.ts` (3 fetch-Sites :90/:145/:181, Branch-Reihenfolge :106-132), `parsers.ts` (`appReducer` :30-76, `parseUnifiedResolveResponse` :129-133, `buildShareConfigFromActive` :262-324), `app.ts` (`AppStateType` :65-76, `ActiveResultKind` :59-63, `SongResult` :78-91, `ActiveResult` :116, `AppState` :118-128, `AppAction` :135-146) — alle vollständig gelesen. Hero/Tokens/Komponenten-Refs aus dem Research-Workflow (`HeroInput.tsx:129-198`, `EmbossedSegmentedControl.tsx:48`, `dayNightMode.ts`, `DayNightSwitcher.tsx:64`, `design-tokens.ts:35-46/601-652`, `glass.css:176-213/524-573`, `MediaCard.tsx:40-116`, `media-card.ts:22-94`, `PlatformIcon.tsx:32`) — vom Implementer beim Bearbeiten dieser Dateien zu re-verifizieren. `ENDPOINTS.v1.ccResolve`/`CcResolveSuccessResponse`/`ApiCcTrack` existieren (Plan 2).
