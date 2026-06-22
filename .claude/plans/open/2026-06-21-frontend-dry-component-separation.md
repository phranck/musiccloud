# Frontend: striktes DRY, Component-Separation, Logik-Trennung + Artist-Profile + Pagination

> **Grundprinzip (User, non-negotiable):**
> 1. **Striktes DRY** — kein Layout-/Card-/List-Pattern zweimal. Gleiche Struktur = EINE Quelle.
> 2. **Eine Komponente pro File** — jede Komponente in ihrem eigenen File. Ausnahme: echtes Compound-Component-Pattern (Sub-Teile als Namespace an EIN Primitive, z.B. `RecessedCard.Header`).
> 3. **Keine Logik in Komponenten** — UI ist reine Presentation. Fetch, Wire-Mapping/Transform, Business-Regeln, Endpoint-/URL-Wissen, wiederverwendbare Domain-Ableitungen gehören in parser/service/hook. Erlaubt in der Komponente: render-lokale Display-Flags (`showX`), swapKey-Strings, Event-Handler die nur Prop-Callbacks rufen, lokaler UI-State.
> 4. **Titel/Überschriften sind Daten** — eine Komponente hardcodet ihren Titel nie, sie bekommt ihn als Prop.

## Kontext

Auslöser: Die Artist-Spalte ist Desktop und Mobile doppelt gebaut (Desktop-Cards in `AnimatedArtistColumn` vs. inline-Rebuild im Mobile-`ArtistInfoCard`), jeder Section-Titel mehrfach hardcoded. Zwei parallele Audits (Code-First, vollständige Reads, jeder Befund adversarial gegengeprüft) haben das ganze Frontend gescannt:

- **Audit 1 — Layout-Redundanz:** 27 Roh-Befunde → **19 deduplizierte Redundanzen**, 0 verworfen.
- **Audit 2 — Component-Separation + Logik-in-Presentation:** 30 Roh-Befunde → **26 bestätigte Verstöße**, 8 sauber verworfen.

Die 8 Verwerfungen aus Audit 2 sind bewusst KEINE Verstöße und werden NICHT angefasst: `EmbossedCard`, `RecessedCardParts`, `TranslucentCard`, `PlayerParts` (Compound-Patterns mit Symbol-Tag-Dispatch); `SimilarArtistsSection`/`UpcomingEventsSection` (render-lokale Flags); `AudioPreviewPlayer`-Fetch (liegt schon im Hook/Modul); `PlatformButton.sourceLabel` (dev-only Single-Consumer).

## Legitime Grenzen, die ERHALTEN bleiben (über alle Phasen)

- **Desktop/Mobile-Artist-Spalte:** Desktop = vier eigenständige `EmbossedCard`s als Top-Level-GSAP-Flip-Kinder von `AnimatedArtistColumn` (`column.children`-Count ist load-bearing, `AnimatedArtistColumn.tsx:90`). Mobile = ein `EmbossedCard` mit `CollapsibleSection(disableMobileCollapse)`-Curtain-Blöcken. Titel-TEXT/Key wird geteilt, die Header-Chrome ist pro Surface (Desktop `EmbossedCard.Header.Title`, Mobile `RecessedCard.Header.Title`). Geteilt wird der INNERE Body, nie der äußere Wrapper.
- **Per-Card `min-h`-Platzhalter (132/186/140/205):** bleiben pro Card (MC-029 Flip-Snapshot-Invariante), nie auf eine Konstante vereinheitlichen.
- **SmoothSwap-`swapKey`:** muss Desktop↔Mobile byte-identisch bleiben (sonst doppelte Animation beim Daten-Swap). Geteilte swapKey-Builder sind die Absicherung.
- **React-Island vs. SSR/Astro:** `ShareLogoHeader` (React mit Handler) und `ShareLogoHeader.astro` (statisch, kein Handler) bleiben zwei Quellen — die `.astro`-Fallbacks rendern ohne Hydration.
- **CSS-Token-Helfer** (cardGeometry, sectionCardChromeStyles) sind beabsichtigt geteilt — kein Verstoß; der Verstoß ist Code, der sie UMGEHT.

---

## Phase 1 — Artist-Spalte vereinheitlichen (der Auslöser, höchste Priorität)

Reihenfolge intern: erst die A-Splits (Type-Relocation als Prerequisite), dann Body-Teilen + Titel-als-Props, dann Shell, dann die Klein-Dedups.

### 1.1 `artist-popular-tracks-split` (A) — Prerequisite für ShareLayout-Split
- `PopularTracksSection.tsx` definiert zwei unabhängige Komponenten: `PopularTracksSection` (L20) + `PopularTrack` (L41, cross-file von 9 Importern genutzt).
- **Fix:** `PopularTrack` (+ privates `formatDuration`) nach `apps/frontend/src/components/artist/PopularTrack.tsx`. Den Type `ArtistPanelTrackResolveHandler` (L18, von 8 Files importiert, u.a. `ShareLayout.tsx:185`) in ein neutrales Types-Modul `apps/frontend/src/components/artist/artistPanelTypes.ts` verschieben (verhindert Zirkular-Import). Alle Importer umbiegen.

### 1.2 `artist-info-notice-split` (A)
- `ArtistInfoCard.tsx` definiert zusätzlich `ArtistInfoNoticeCard` (L183, intern, nicht exportiert).
- **Fix:** nach `apps/frontend/src/components/artist/ArtistInfoNoticeCard.tsx` (exportiert), nötige Imports mitnehmen. `ArtistInfoCard` importiert es für die Empty/Error-Returns (L58-62, L89).

### 1.3 `artist-card-parts-split` (A)
- `ArtistCardParts.tsx` ist ein Barrel mit 7 Komponenten + Hook + Type.
- **Fix:** ein File pro Komponente: `ArtistCardShell.tsx`, `ArtistNoticeContent.tsx`, `ProfileSkeleton.tsx`, `TracksSkeleton.tsx`, `EventsSkeleton.tsx`, `SimilarArtistsSkeleton.tsx`. `SkeletonRow` (L98) + `SKELETON_ROW_KEYS` (L86) → `SkeletonRow.tsx`. `useSkeletonAllowed` (L24) + `SKELETON_DELAY_MS` → `hooks/useSkeletonAllowed.ts`. `ArtistInfoStatus` (L11) → Types-Modul (Cross-File von ShareLayout genutzt). Niedrigstes Risiko zuerst: `ArtistCardShell` + `ArtistNoticeContent`, dann Skeletons.

### 1.4 `artist-section-body-and-swapkeys` (high) + Titel-als-Props
- Body + swapKey + show-guard sind 6-fach gebaut (3 Desktop-Cards vs. 3 Mobile-Inline-Blöcke). Section-Titel mehrfach hardcoded.
- **Fix (Body einmal, beide Wrapper bleiben):**
  1. Drei swapKey-Builder in ein Modul `artistSwapKeys.ts` (`buildTracksSwapKey`/`buildEventsSwapKey`/`buildSimilarSwapKey`) — byte-identisch, von Desktop-Cards UND `ArtistInfoCard` importiert.
  2. Eine innere Well-Komponente `ArtistSectionWell` (`RecessedCard(recessedControlInsetClassName) > RecessedCard.Body > {skeleton | SmoothSwap(swapKey) > Section | null}`), rendert NICHT Titel/äußere Card.
  3. Desktop-Cards behalten `ArtistCardShell` + `EmbossedCard.Header`, rendern `ArtistSectionWell` innen. `ArtistInfoCard` behält `CollapsibleSection` + `RecessedCard.Header.Title`, rendert DENSELBEN `ArtistSectionWell`.
  4. **Titel-als-Props:** Type `ArtistCardLabels { profile; popularTracks; events; similar }` (in `artistPanelTypes.ts`). `ShareLayout` baut memoisiert `commercialArtistLabels` aus `t("artist.infoTitle"|"artist.popularTracks"|"artist.upcomingEvents"|"artist.similarArtists")` und reicht `labels` über `AnimatedArtistColumn`/`DesktopShareLayout` (Desktop) und `MobileArtistSheet` → `ArtistInfoCard` (Mobile) durch. CC übergibt sein eigenes `labels`-Objekt. Cards/`ArtistInfoCard` ersetzen die hardcoded `t("artist.*")`-Titel durch die Label-Props. `PopularTracksCard`/`SimilarArtistsCard` verlieren ihren `useT()` (Titel war einzige Nutzung); `EventsCard`/`ArtistProfileDesktopCard` behalten `useT()` (Footer/Notice).
- **Wichtig:** alle drei Sections in einem Zug. Desktop muss genau ein Top-Level-Card pro Section emittieren (kein Extra-Wrapper-Div), Self-hide-`return null` bleibt; Mobile darf nie `return null` (toggelt via `visible`).

### 1.5 `artist-desktop-section-card-shell` → verschoben nach Phase 2 (2.7)
Berührt `ServicesCard`/`CcInfoCard` in `components/cards/`, die in Phase 2 ohnehin angefasst werden — dort gebündelt, um die Files nur einmal anzufassen.

### 1.6 Klein-Dedups Artist (low)
- `artist-providedby-footer`: Mobile-Footer-`<p>` (`ArtistInfoCard.tsx:153`, `ArtistProfileMobileCard.tsx:28`) über `sectionCardFooterTextClassName` statt Class-String neu tippen; `mt-2`→padding (CollapsibleSection padding-only).
- `artist-close-button`: Close-Button in `ArtistInfoCard` (L95-104 == L188-197) als file-lokale `ArtistCardCloseButton({ onClose })`. NICHT das raised `EmbossedCloseButton`-Primitive nutzen (anderes Visual).
- `artist-notice-well`: `ArtistInfoCard.tsx:201` hand-`<p>` → `<ArtistNoticeContent>`; geteiltes `ArtistNoticeWell({ message })` für `ArtistProfileDesktopCard.tsx:40-44` + `ArtistInfoCard.tsx:199-203`, äußere Wrapper bleiben getrennt.

---

## Phase 2 — Cards-Primitives + MediaCard

### 2.1 `media-card-classname-helper` (low) — zuerst (2.2/2.3 nutzen ihn)
- `mediaCardClassName(animated, className)` 4-fach (MediaCard/MediaSummaryCard/ServicesCard + CcInfoCard inline).
- **Fix:** ein Helper `animatedOuterEmbossedCardClassName(animated, className)` in `cardGeometry.ts` (MC-029-Kommentar mit), `import { cn }` ergänzen, lokale Kopien löschen, Call-Sites umbiegen.

### 2.2 `media-card-head` (medium)
- MediaCard-Head (SongInfo + Preview + Share-Actions) ist in `MediaSummaryCard` dupliziert.
- **Fix:** geteiltes `MediaCardHead({ content, animated, className, onPreviewStatusChange, srAnnouncement? })`. `MediaCard` komponiert `<MediaCardHead>{Platform-Sections}</MediaCardHead>`, `MediaSummaryCard` rendert `<MediaCardHead/>` ohne Children. Identischer `audioPreviewKey` (Remount-Key). Platform-Grid-Sections + srAnnouncement bleiben MediaCard-only. NICHT `MediaSummaryCard` zu `MediaCard showPlatforms={false}` kollabieren (Desktop = MediaSummaryCard + separate ServicesCard).

### 2.3 `platform-well` (medium)
- Platform-Well zwischen `MediaCard` und `ServicesCard` doppelt.
- **Fix:** `derivePlatformsVisibility(content)`-Helper + presentational `<PlatformsWell content/>` (RecessedCard > Body > AnimatedPlatformGrid + Info-`<p>`). RecessedCard.Header NICHT einbacken (Title-Placement differiert). Je Card genau ein `AnimatedPlatformGrid` (Flip-Key).

### 2.4 `cc-license-label-parser` (B) + `cc-meta-row-split` (A) — CcInfoCard einmal anfassen
- `ccLicenseLabel` (L48-67) parst Jamendos `licenseCcurl` → CC-Label. `CcMetaRow` (L187) ist zweite Komponente.
- **Fix B:** `ccLicenseLabel` + `CC_CLAUSE_LABELS` + `CcDeedKind` nach `lib/resolve/parsers.ts`; `licenseLabel?: string` zu `CcTrackContentConfiguration`, in `buildCcShareConfig` setzen; `licenseCcurl` bleibt (für `<a href>` + Fallback). `CcInfoCard.tsx:102` konsumiert `content.licenseLabel`.
- **Fix A:** `CcMetaRow` → `CcMetaRow.tsx` (+ benanntes `CcMetaRowProps`-Interface).

### 2.5 `songinfo-artwork-split` (A)
- `SongInfo.tsx` definiert zusätzlich `ArtworkImage` (L217).
- **Fix:** `ArtworkImage` → `apps/frontend/src/components/cards/ArtworkImage.tsx` (Props `{ url, alt, className?, ref? }`, `/og/musiccloud.jpg`-Fallback + onError erhalten).

### 2.6 `platform-grid-visible-selector` (B)
- `AnimatedPlatformGrid.tsx:44-52` useMemo = Domain-Selektor (hidden-Filter + display-order-Sort).
- **Fix:** pure `visiblePlatformsInDisplayOrder(platforms: PlatformLink[])` nach `lib/types/platform.ts` (auf FRONTEND-`PlatformLink` getypt, keyed `.platform`). GSAP-Flip bleibt unangetastet. „reused by dashboard"-Begründung streichen (single-call-site).

### 2.7 `artist-desktop-section-card-shell` (medium, aus Phase 1 verschoben)
- Vier Desktop-Artist-Cards wiederholen dasselbe Shell-Gerüst; `ServicesCard`/`CcInfoCard` umgehen das vorhandene `ArtistCardShell` und bauen ihren Header inline.
- **Fix:** `ArtistCardShell` zu einem geteilten `SectionCardShell` generalisieren (nach `components/cards/`), Props `{ title; footer?; skeletonMinHeight?; animated?; className?; children }`. Die vier Desktop-Cards bleiben dünne Wrapper (eigene show/swapKey, `min-h` als Prop). `ServicesCard`/`CcInfoCard` rendern `SectionCardShell` statt inline-Header. `ArtistCardShell` als dünner Alias re-exportieren.
- **Risiko:** `min-h` (132/186/140/205) bleiben Per-Card-Inputs. `ArtistProfileDesktopCard` behält Error-Notice-Branch + Self-hide. Mobile-Blöcke NICHT durch diese Shell routen.

---

## Phase 3 — ShareLayout (Logik-raus VOR File-Split)

`ShareLayout.tsx`: erst alle Rule-B-Extraktionen (File wird dünn), dann der 6-fach-Split. `share-artist-info-service` VOR `share-artist-info-hook`. `artist-popular-tracks-split` (1.1) ist Prerequisite.

### 3.1 `share-short-url-util` (B, + Triple-Dedup)
- `pathFromShortUrl`/`replaceBrowserUrlWithShortUrl` (L327-344) = Endpoint/Origin-Wissen + `history.replaceState`; `"https://musiccloud.io"`-Origin 3-fach (hier + `lib/share/share-view.ts:24` + `lib/resolve/parsers.ts:268`).
- **Fix:** `apps/frontend/src/lib/share/short-url.ts` mit `originBase()` + `pathFromShortUrl` + `replaceBrowserUrlWithShortUrl`. Die zwei `shortIdFromShortUrl`-Kopien im selben Zug auf `originBase()`/`pathFromShortUrl` umstellen.

### 3.2 `share-detect-region-util` (B)
- `TIMEZONE_TO_COUNTRY` (~80 Einträge, L209-291) + `detectRegion()` (L293-300).
- **Fix:** nach neuem `apps/frontend/src/lib/geo/detect-region.ts`. `ShareLayout` behält nur `import` + `useMemo(detectRegion, [])`. Unit-Test IANA→ISO + Empty-Fallback.

### 3.3 `share-artist-info-service` (B) → 3.4 `share-artist-info-hook` (B)
- `fetchArtistInfo` (L302-315, Endpoint/Fetch/Wire-Cast) + `artistFetchErrorCode` (L317-321, 1:1-Companion) → `apps/frontend/src/lib/share/artist-info-client.ts` (zusammen, nicht trennen).
- Danach: kompletter Fetch-Lifecycle (`artistReducer`+`hasArtistInfoContent` L105-124, Effekt L514-536, Seed-Effekt L506-510) → `apps/frontend/src/hooks/useArtistInfo.ts` (spiegelt `useAppState.ts`). Signatur `useArtistInfo({ artistName, userRegion, context, artistDataProp, skipArtistFetch })` → `{ status, artistData, errorCode, isLoading }`.

### 3.5 `share-resolve-service` (B)
- `handleTrackResolve` (L557-616) handrollt `POST /api/resolve` + Wire-Union-Narrowing (Duplikat von `useAppState.ts:117-255`).
- **Fix:** `resolveTrackQuery(query, signal)` nach `lib/resolve` (neues `resolve-client.ts`), nutzt vorhandenes `ResolveApiError`. `handleTrackResolve` orchestriert nur noch Render-State.

### 3.6 `share-layout-split` (A)
- 6 Komponenten in einem File. `ShareLayout`+`ShareLayoutInner` (Provider-Wrapper-Split) bleiben zusammen.
- **Fix:** `ShareBackLink.tsx`, `DesktopShareLayout.tsx`, `MobileShareLayout.tsx`, `MobileArtistSheet.tsx` (je mit Props-Interface). Nach Rule-B + nach 1.1.

### 3.7 `share-logo-header` (medium) + `share-result-frame` (medium) — DONE (commit 0effc44)
- Logo-Header 5-fach (3 React + 2 Astro); CC- vs. kommerzieller Share-Result-Wrapper 2-fach.
- **Fix:** React `ShareLogoHeader.tsx` (Prop `onLogoClick?`, `aria-label` "Go to musiccloud home" erhalten — `LandingPage.test.tsx:159`); Astro `ShareLogoHeader.astro` (statisch). Ein `ShareResultFrame` (Panel-Div + Logo-Header + FadeInOnMount + Suspense(Placeholder) + children), Clearing-Slide-out-`useGSAP` rein, `if (!isClearing) return;`.
- **Done:** `ShareLogoHeader.tsx` ersetzt die drei React-Kopien (`ActiveShareResult`, `CcShareResult`, `SharePageShell`), `ShareLogoHeader.astro` die zwei `[shortId].astro`-Kopien. `ShareResultFrame.tsx` (eigenes File) trägt Panel + Logo + Fade + Suspense + Clearing-`useGSAP` (gated, CC-Pfad = No-op). `ShareResultPlaceholder.tsx` als Prerequisite extrahiert (Frame + Page konsumieren). aria-label-Test grün. astro check 0 errors.

---

## Phase 4 — LandingPage (Logik-raus VOR File-Split) — DONE

### 4.1 `cc-result-share-props` (B) — DONE (commit 5857788)
- `ccShareLayoutProps` (L176-208) = per-kind Wire-Mapping-Dispatcher.
- **Fix:** `ccResultToShareProps(ccActive, t)` nach `lib/resolve/parsers.ts` (kind-Branching; für track `ccInfoContent = buildCcShareConfig`). `CcShareResult` baut nur noch die JSX.
- **Done:** `ccResultToShareProps` gibt `{ config, artistName, ccInfoContent? }` (data-only, kein JSX) zurück; `CcShareResult` baut die memoisierte `<CcInfoCard>` lokal. `buildCcShareConfig`/`buildCcEntityHeaderConfig`/`ccTrackToShareConfig` sind jetzt parser-intern (kein `export` mehr — sonst unused-export im Full-Doctor-Scan).

### 4.2 `landing-active-share-selector` (B, low) — DONE (commit 8a77e32)
- `active.kind === Artist ? name : artist`-Branch (L494-498) dupliziert Model-Regel.
- **Fix:** `buildActiveShareSelection(resolved, active, t)` nach `lib/share/share-view.ts`.
- **Done:** gibt `{ activeShareView, activeShareConfig, activeArtistName }`; die Artist-Name-Discriminant-Regel lebt jetzt im Selektor. Kein Zirkular-Import (`parsers.ts` importiert `share-view.ts` nicht).

### 4.3 `landing-genre-query-grammar` (B, low) — DONE (commit 7fdac1c)
- `` `genre: ${name}` `` (L357) + `"genre:?"` (L426) = Query-Grammatik inline.
- **Fix:** `buildGenreQuery(name)` + `GENRE_BROWSE_QUERY`-Const nach `lib/resolve`. NICHT das ganze `selectGenreTile` extrahieren (Analytics/Submit = legitime Orchestrierung).
- **Done:** neues `lib/resolve/genre-query.ts`; beide Inline-Vorkommen ersetzt, `selectGenreTile` bleibt als Render-Layer-Orchestrierung in `LandingPage`.

### 4.4 `landing-page-split` (A) — DONE (commit 4fe3798)
- 7 Komponenten. `LandingPage`+`LandingPageInner` bleiben. `ShareResultPlaceholder.tsx` ZUERST (3 Consumer), dann `ActiveShareResult.tsx`, `CcShareResult.tsx`, `LiveExampleTeaser.tsx`, `LandingLogoBlock.tsx`. Nach 4.1-4.3.
- **Done:** `ShareResultPlaceholder.tsx` schon in 3.7 extrahiert; die vier anderen jeweils eigenes File mit Props-Interface + TSDoc. `LandingPage`+`LandingPageInner` bleiben zusammen; `resolveModeSegments`/`selectGenreTile` bleiben file-lokal (kein `export`, daher kein only-export-components-Verstoß).

---

## Phase 5 — Discovery + Listen

- **5.1 `discovery-panel-headline` (medium):** geteilte `PanelHeadline` (nur h2+p, Titel/Subtitle als `ReactNode` — DisambiguationPanel-Cross-fade!). Outer-Header-className bleibt am Call-Site.
- **5.2 `genre-panel-shell` (medium):** `GenrePanelShell` (FadeInOnMount + EmbossedCard flex-col max-h + PanelHeadline), Props `{ title, subtitle, maxWidthClass?, ref?, leadingAddOn?, footer?, bodyClassName?, children }`. DisambiguationPanel NICHT anfassen.
- **5.3 `discovery-cancel-button` (low):** `CancelButton` in `components/ui/`. NICHT `BackLink`/`NavigationBackButton` durchzwingen (2-way, nicht 4-way).
- **5.4 `grouped-corner-list` (medium):** `ArtistPanelList` zu `GroupedCornerList` generalisieren (volle `useGroupedCorners`-Optionen pass-through, forwarded ref MERGEN für DisambiguationPanels FLIP). `ArtistPanelList` als Default-Alias.
- **5.5 `row-chrome-constant` (low):** `ROW_CHROME` aus `ArtistPanelRow.tsx` exportieren, `DisambiguationPanel`/`GenreRowButton` importieren.
- **5.6 `artwork-cover-tile` (medium):** inneres Cover-Leaf als `CoverImage({ artworkUrl?, kind, imgDim, iconSize?, decoding? })`. Schritt 1 (zero-risk): `'/og/default.jpg'` als ein Const. Äußere Shells bleiben.
- **5.7 `genre-search-headline-util` (B):** `buildHeadline`/`buildCountsText`/`formatGenre`/`formatList` → `lib/genre-search/headline.ts` (+ Test).
- **5.8 `genre-browse-safe-color-util` (B):** `SAFE_COLOR_RE`+`safeAccent` (Security-Whitelist für untrusted Wire-Color) → `lib/platform/cssColor.ts` als `isSafeCssColor`/`safeCssColor` (+ Test). Fail-closed erhalten.
- **5.9 `lazy-genre-artwork-hook` (B, low):** FIFO-Concurrency-Gate → `lib/net/concurrencyGate.ts`; `useLazyImageLoad()`-Hook (IntersectionObserver + acquire/release). Opportunistisch.

---

## Phase 6 — PageOverlay (Logik-raus VOR File-Split)

- **6.1 `page-overlay-content-logic` (B):** `useSegmented`+`segmentIndexForHash` → `hooks/useSegmented.ts`; `parserOptions`-Wire-Marker-Transform + `MarkdownHtml` → geteiltes Markdown-Modul. Inline Title-Cascade (L208-209/250-251/305-306) in Hook-Outputs kollabieren.
- **6.2 `segment-title-cascade` (medium, Audit 1):** `useSegmented` gibt `{ isSegmented, resolvedHtml, resolvedTitle, resolvedShowTitle }` zurück; `segmentGate`-Option (`requirePageType`) — Fullscreen `false`. Fällt mit 6.1 zusammen.
- **6.3 `markdown-prose-classmap` (medium):** `MD_TRANSLUCENT`/`MD_EMBOSSED` (L18-66) aus EINEM strukturellen Template + per-Element-Color-Map (volle Literale, keine Tailwind-Fragmente). Gate: Snapshot der zwei Strings byte-gleich nach Refactor.
- **6.4 `markdown-in-card-wrapper` (low):** `RecessedOrPlainMarkdown`-Helper (inner-scroll-div vs. direct-child parametrisiert).
- **6.5 `page-overlay-content-split` (A):** `MarkdownHtml.tsx`, `TranslucentOverlayContent.tsx`, `EmbossedOverlayContent.tsx`, `SegmentedPageFullscreen.tsx`. Nach 6.1-6.4.
- **6.6 `page-overlay-island-logic` (B):** `useMediaQuery`+`getMediaQueryMatch` → `hooks/useMediaQuery.ts`; `geomKey`/`loadGeom`/`saveGeom`/… (localStorage-Persistenz) → `overlayGeometry.ts`. `overlayVisibilityReducer` bleibt.
- **6.7 `page-overlay-island-split` (A):** `OverlayShell.tsx`, `OverlayFrame.tsx`, `ResizeHandles.tsx`. Nach 6.6.

> **Commit-Bundling (Abweichung, IST-Stand):** Der Pre-Commit-Hook macht einen Doctor-FULL-scan. `PageOverlayContent.tsx` (3 Komponenten) und `PageOverlayIsland.tsx` (4 Komponenten) triggern `no-multi-comp`, bis sie gesplittet sind — kein Zwischenstand mit Multi-Komponenten-File ist committierbar. Darum landeten 6.1/6.2/6.5 in einem Commit (`4b33bcc`) und 6.6/6.7 in einem Commit (`cd9e91c`). 6.3 (`0a1e09d`) und 6.4 (`ee1f8cb`) blieben eigene Commits. `getMediaQueryMatch` + `GEOM_KEY_PREFIX` bleiben modul-intern (kein `export`), sonst `deslop/unused-export` im Full-Scan.

---

## Phase 7 — Audio/Player (ZURÜCKGESTELLT, blockiert durch User-Diskussion)

> **Entscheid User (2026-06-21):** Player vorerst auslassen. Es gibt offene Änderungswünsche am Player, die sehr wahrscheinlich dazu führen, dass kommerziell (C) und CC **verschiedene Player** ergeben. Das muss zuerst besprochen werden — ein Refactor jetzt wäre Wegwerf-Arbeit, falls der Player sich strukturell ändert. Diese Phase startet NICHT, bevor die Player-Divergenz geklärt ist.

Erfasst, damit nichts verloren geht (NICHT umsetzen bis freigegeben):

- **7.1 `audio-preview-controller-extract` (B, high):** `AudioPreviewPlayer.tsx` (1210 Zeilen). Presentational ist nur L1193-1209. Split nach Concern: (1) `fetchPreviewUrl` → `lib/services/sharePreviewService.ts`; (2) DSP-Layer (resolveSpectrum*/resolveStereo*/… L136-413) → `components/audio/spectrumDsp.ts` (+ Test); (3) `playerReducer`+Types → `audioPreviewMachine.ts`, `useAudioPreviewController` → `useAudioPreviewController.ts`. **Hinweis:** Audit-2-Verify hat angemerkt, dass Fetch/Reducer schon auf Modul-/Hook-Ebene liegen — es ist „großes File mit Hook+Reducer+DSP daneben", nicht „Logik in der Komponente".
- **7.2 `player-vfd-model-extract` (B, medium):** `PlayerParts.tsx` VFD-Model-Builder (`buildPlayerLines` + `renderStereo*`/`renderSpectrum*` + Cell-Geometrie L136-457) → `components/playback/playerVfdModel.ts` (+ Test). Compound-Parts (`PlayerRoot`/`PlayerButton`/…) bleiben (kein A-Verstoß). Per-Render-Progress-Geometrie bleibt inline.

---

## Phase 8 — CC Artist-Profile aus Jamendo (Feature) — DONE (commit folgt)

> User: „In Künstler-Info steht immer, keine Details verfügbar — stimmt nicht (z.B. `localhost:3001/BIQSd`, LOWTONE, Jamendo-id 595393)." Jamendo `/artists?include=musicinfo` liefert `image` + `description.{de,en}` (Bio) + `tags` (Genres).

> **Erledigt:** 8.1-8.6 wie geplant umgesetzt. `getCcArtistMusicInfo` (1 throttled Call über `jamendoFetch`) liefert `imageUrl`/`genres` (cap 3)/`bioSummary` (locale→en→null); `buildCcArtistInfo` baut daraus das `ArtistProfile`, `popularity`/`followers`/`scrobbles` bleiben null und `similarArtists` leer (keine Surrogate). Drei Call-Sites in `cc-resolve.ts` threaden die Artist-id. IST-State-Kommentare in `cc-artist-info.ts` (Header + TSDoc) + `ArtistProfileDesktopCard.tsx` korrigiert.
>
> **Abweichung vom Plan (gefolgt dem echten Code):** Der Plan listete nur den Test in `jamendo/__tests__/client.test.ts` (8.6). Es existiert aber zusätzlich `services/cc/__tests__/cc-artist-info.test.ts`, der `buildCcArtistInfo` mit der ALTEN Signatur `(artistName, columnTracks)` aufrief — die Signatur-Erweiterung brach diese drei Tests. Migriert auf die neue 3-arg-Signatur, `getCcArtistMusicInfo` gemockt, plus neuer Test, dass das Profil aus musicinfo gebaut wird (listener counts null, similarArtists []).

- **8.1 Types** (`apps/backend/src/services/cc/jamendo/types.ts`): `JamendoArtistRaw` um `musicinfo?: { tags?: string[]; description?: Record<string, string> }` erweitern; Domain-Type `CcArtistMusicInfo { imageUrl; genres; bioSummary }`.
- **8.2 Client** (`client.ts`, neben `getCcArtist`): `getCcArtistMusicInfo(jamendoArtistId, locale="en")` via `jamendoFetch("/artists", { id, include: "musicinfo", limit: 1 })`; map `image`→`imageUrl`, `tags.slice(0,3)`→`genres`, `description[locale]||description.en||null`→`bioSummary`. Throttle kommt über `jamendoFetch`.
- **8.3 buildCcArtistInfo** (`cc-artist-info.ts`): Signatur → `(artistName, jamendoArtistId, columnTracks)`; `profile` aus `getCcArtistMusicInfo` bauen (`popularity`/`followers`/`scrobbles` null, `similarArtists` []) statt `profile: null`. IST-State-Kommentare (File-Header + TSDoc) korrigieren.
- **8.4 Caller** (`routes/cc-resolve.ts`): drei Call-Sites threaden die Artist-id (`track.jamendoArtistId`, `album.jamendoArtistId`, `artist.jamendoId`).
- **8.5 Self-hide:** `ArtistProfileDesktopCard` rendert jetzt für CC-Artists mit Profil; self-hide nur noch bei echtem `null`-Profil. Inline-Kommentar (L32-35) korrigieren.
- **8.6 Test:** `client.test.ts` — `include=musicinfo`, genres cap 3, description-Fallback.

---

## Phase 9 — Pagination 6-cap (Feature, kommerziell + CC)

> User: `BELIEBTE TRACKS` und `ÄHNLICHE KÜNSTLER` auf 6 Einträge kappen; bei mehr Footer-Pager (Previous/Next, wie Disambiguation-Liste).

- **9.1 Hook** `apps/frontend/src/components/artist/usePagedList.ts`: clamp-Mathe aus `DisambiguationPanel.tsx:46-53`, `pageSize` default 6, `resetKey`-`useEffect(setPageIndex(0))`. Gibt `{ page, pageIndex, pageCount, canGoPrevious, canGoNext, goPrevious, goNext }`.
- **9.2 Footer** `PagedListFooter.tsx`: Markup aus `DisambiguationPanel.tsx:271-291` (gate `pageCount > 1`, `grid grid-cols-2 gap-2`, zwei `EmbossedButton`). `DisambiguationPanel` auf denselben Footer migrieren (eine Quelle).
- **9.3 Anwendung an Section-Ebene:** `PopularTracksSection` (über `tracks`), `SimilarArtistsSection` (über post-filter `withTrack`). Footer unter `ArtistPanelList`. SmoothSwap-Key NICHT mit `pageIndex` koppeln. `SimilarArtistsSection`-`key={artistName}` → eindeutiger Key (Duplikat-Fix).
- **9.4 i18n:** `pager.previous`/`pager.next` in `en.json`/`de.json` (nicht `disambiguation.*` wiederverwenden).

---

## Verified facts (Plan-write-time, 2026-06-21)

- Beide Audits Code-First mit vollständigen Reads, jeder Befund adversarial gegengeprüft. Befund-Details: `tasks/wyfsmpm1i.output` (Layout) + `tasks/w6axjo1on.output` (Separation).
- `SimilarArtistsCard.tsx:28/36` `t("artist.similarArtists")`, `PopularTracksCard.tsx:25/33` `t("artist.popularTracks")`, `EventsCard.tsx:27/37` `t("artist.upcomingEvents")` — grep-bestätigt aktuell.
- i18n-Key Events = `artist.upcomingEvents` (NICHT `artist.eventsTitle` — existiert nicht). Keys: `artist.popularTracks` (en/de:79), `artist.upcomingEvents` (:80), `artist.infoTitle` (:85), `artist.similarArtists` (:89).
- `ArtistInfoCard.tsx:37` `export function ArtistInfoCard`, `:183` `function ArtistInfoNoticeCard` — zweite Komponente bestätigt.
- `DisambiguationPanel` Pager: `CANDIDATES_PER_PAGE=8` (:25), `pageIndex` useState (:44), clamp (:46-53), Footer (:271-291), i18n `disambiguation.previous/next`.
- Jamendo `/artists?include=musicinfo` (id 595393 = LOWTONE) liefert `image` + `tags` + `description.{en,de}` — per curl verifiziert.
- 8 verworfene Audit-2-Claims NICHT anfassen (Compound-Patterns + render-lokale Flags).

## Checklist

- [ ] Phase 1: Artist-Spalte (Splits → Body+Titel → Shell → Klein-Dedups)
- [ ] Phase 2: Cards-Primitives + MediaCard
- [x] Phase 3: ShareLayout (Logik-raus → Split → Logo/Frame) — 3.1-3.6 in Vor-Session, 3.7 mit Phase 4
- [x] Phase 4: LandingPage (Logik-raus → Split) — inkl. 3.7 (share-logo-header + share-result-frame)
- [x] Phase 5: Discovery + Listen — 5.1-5.9 erledigt (5.9 nur Gate, kein Hook)
- [x] Phase 6: PageOverlay (Logik-raus → Split) — 6.1-6.7 erledigt; Prose-Class-Maps byte-identisch verifiziert
- [ ] Phase 7: Audio/Player — ZURÜCKGESTELLT bis Player-Divergenz (C vs CC) besprochen
- [x] Phase 8: CC Artist-Profile aus Jamendo — 8.1-8.6 erledigt (profile aus `/artists?include=musicinfo`: image+genres+bio; popularity/followers/scrobbles null, similarArtists []); zusätzlich `cc-artist-info.test.ts` auf neue 3-arg-Signatur migriert
- [ ] Phase 9: Pagination 6-cap
- [ ] Alle Code-Referenzen vor Execute re-verifiziert (Funktionen, Pfade, i18n-Keys)
- [ ] Pro Subsystem: kleine logische Commits, kein großer WIP-Berg
- [ ] Pre-push-Gates grün: Typecheck + `pnpm lint` + `pnpm doctor:diff`
- [ ] Browser-Verify pro Phase: kommerziell unverändert, CC korrekt; kein Push ohne User-OK
