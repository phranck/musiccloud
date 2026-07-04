# Amazon Music Stufe 1: URL-Input per Scrape

Plan-Nr.: MC-086

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

## Skip-Grund (2026-07-04)

Auf User-Entscheidung als **skipped** markiert — die Amazon-Music-Integration wird vorerst nicht verfolgt. Der volle Nutzen (Amazon-Chip auf fremden Share-Pages via Suche/ISRC) hängt an Stufe 2 ([MC-087](2026-07-04-amazon-music-stufe-2-web-api.md)), die auf einer Amazon-Closed-Beta-API-Freischaltung mit unkontrollierbarer Dauer blockiert; Stufe 1 allein (Scrape, nur URL-Input, keine Suche) wird nicht eigenständig ausgeliefert. Plan bleibt als Referenz erhalten; bei Reaktivierung die Live-Scrape-Befunde neu verifizieren.

**Ziel:** Amazon-Music-Links (`music.amazon.com|.de|…/tracks/{ASIN}` und `/albums/{ASIN}?trackAsin={ASIN}`) werden als Resolve-**Input** akzeptiert; heute wirft `validateMusicUrl` dafür `UNSUPPORTED_SERVICE`.

**Architektur:** Neues keyless Plugin `amazon-music` nach dem Muster der Scraper-Adapter (boomplay/pandora). `getTrack` scrapt og-Tags (Twitterbot-UA) bzw. Album-JSON-LD (Googlebot-UA); `searchTrack` liefert bewusst `found: false`, weil die Amazon-Suche bot-dicht ist — der Amazon-Chip auf fremden Share-Pages kommt erst mit Stufe 2 ([MC-087](2026-07-04-amazon-music-stufe-2-web-api.md)). Cross-Resolve **von** Amazon zu allen anderen Diensten funktioniert damit voll.

**Tech Stack:** TypeScript, Vitest (URL-Routing-Fetch-Mock), `fetchWithTimeout`, JSON-LD/og-Parsing wie in `boomplay/adapter.ts`.

---

## Preface

Live-Befunde vom 2026-07-04 (EU-IP, Track „Just Can't Get Enough" / Depeche Mode, ASIN `B073PV28Y7`, Album `B073JBHS3B`):

- `https://music.amazon.com/tracks/{ASIN}` mit UA `Twitterbot/1.0` → HTTP 200, `og:title` = `Just Can&#x27;t Get Enough – Depeche Mode` (Titel `–` Artist, en-dash U+2013). `music.amazon.de` identisch.
- `https://music.amazon.com/albums/{albumAsin}?trackAsin={trackAsin}` mit UA `Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)` → volles `MusicAlbum`-JSON-LD: `name`, `byArtist.name` + Artist-URL (`/artists/{ASIN}/{slug}`), `datePublished`, `numTracks`, `track[]` als `MusicRecording` mit `@id` (= `https://music.amazon.com/tracks/{ASIN}`), `name`, `duration` (ISO 8601 `PT3M44S`), `position`.
- Mit normalem Chrome-UA: leere SPA-Shell ohne Metadaten. Die **Such-Seite** liefert auch Bots nur eine leere Shell → kein `searchTrack` möglich.
- `og:image` trägt einen eingebrannten Amazon-Music-Logo-Sticker (URL-Modifier `…PJamznMusicLogoSticker…`); Basis-Bild-URL ist ableitbar (`https://m.media-amazon.com/images/I/{id}.jpg`), Ableitung muss beim Implementieren verifiziert werden.
- JSON-LD/og-Strings sind HTML-escaped (`&#x27;` bzw. `&#039;`) — Entities MÜSSEN dekodiert werden (Boomplay-Adapter hat diesen Bug; hier nicht wiederholen).

## Spec

1. User pastet einen Amazon-Music-Track-Link → musiccloud resolvet den Track auf allen anderen Diensten (Amazon ist Source-Service, Link erscheint mit confidence 1.0).
2. Album-Links (`/albums/{ASIN}` ohne `trackAsin`) laufen in den Album-Resolve (`getAlbum` via JSON-LD inkl. Trackliste).
3. Kein Amazon-Chip bei Resolves anderer Quellen (Stufe 2).
4. Dashboard zeigt das Plugin als toggelbaren Service; Frontend/Apple-App rendern das Amazon-Music-Icon für den Source-Link.

## Design-Entscheidungen

- **Keine Host-Normalisierung** der Storefronts (`music.amazon.de` bleibt `.de`): ASIN-Katalogverfügbarkeit kann je Marketplace abweichen; wir schreiben keine URL um, die wir nicht verifizieren können (YAGNI). `ref=`-Tracking-Params entfernt `stripTrackingParams` bereits global; **`trackAsin` ist funktional und darf nie gestrippt werden**.
- **`getTrack`-Quelle nach URL-Form:** `/tracks/{ASIN}` → og-Scrape (Twitterbot); `/albums/{albumAsin}?trackAsin={trackAsin}` → Album-JSON-LD (Googlebot) und Track per ASIN in `track[]` matchen (liefert zusätzlich Album-Name + Dauer). `sourceId` = Track-ASIN.
- **Entity-Decode als shared Helper** `_shared/html-entities.ts` (min. `&#x27;`/`&#039;`/`&amp;`/`&quot;`/`&lt;`/`&gt;`, numerische Entities generisch), mit TSDoc; Kandidat für spätere Boomplay-Nachrüstung (nicht Teil dieses Plans).
- **`searchTrack` → `{ found: false, confidence: 0, matchMethod: "search" }`** mit `log.debug`-Hinweis „no search source available (stage 1)". Kein Fake-Fallback.
- Registry-Position: ans Array-Ende (Scraper-Block); für URL-Erkennung ist die Reihenfolge irrelevant.

## Implementation

### Task 1: Shared — ServiceId + Plattform-Metadaten

**Files:** Modify `packages/shared/src/services.ts`, `packages/shared/src/platform.ts`

- [ ] `Service.AmazonMusic: "amazon-music"` in das `Service`-Objekt (services.ts:30ff) einfügen
- [ ] `PLATFORM_CONFIG`-Eintrag `"amazon-music": { label: "Amazon Music", color: <Brand-Hex> }` (platform.ts:36ff); Brand-Hex vorab aus offiziellem Brand-Asset bestimmen (siehe Open Questions), nicht raten
- [ ] `SERVICE_DISPLAY_ORDER`: `"amazon-music"` nach `"apple-music"` einsortieren (platform.ts:65ff)
- [ ] `pnpm --filter @musiccloud/backend typecheck` läuft grün (Union wächst, `Record<ServiceId, …>` erzwingt den Config-Eintrag)

### Task 2: URL-Detection

**Files:** Modify `apps/backend/src/lib/platform/url.ts`, `apps/backend/src/__tests__/url-detection.test.ts`

- [ ] Test zuerst: die zwei Reject-Assertions (url-detection.test.ts:64-65, :134) auf Accept drehen und neue Fixtures ergänzen: `/tracks/B073PV28Y7`, `/albums/B073JBHS3B?trackAsin=B073PV28Y7`, `music.amazon.de`-Varianten, Album-URL ohne trackAsin als Album erkannt; Lauf: rot
- [ ] `MUSIC_URL_PATTERNS["amazon-music"]`: `/^https?:\/\/music\.amazon\.(?:com|de|co\.uk|fr|it|es|ca|com\.au|co\.jp|com\.br|com\.mx|in)\/(?:tracks\/[A-Z0-9]{10}|albums\/[A-Z0-9]{10}\?.*\btrackAsin=[A-Z0-9]{10})/`
- [ ] `ALBUM_URL_PATTERNS["amazon-music"]`: `/^https?:\/\/music\.amazon\.(?:com|de|co\.uk|fr|it|es|ca|com\.au|co\.jp|com\.br|com\.mx|in)\/albums\/[A-Z0-9]{10}(?!\?.*\btrackAsin=)/` (Album nur ohne trackAsin; Muster analog Apple-Music-Negativ-Lookahead url.ts:42)
- [ ] `ALLOWED_HOSTS`: alle `music.amazon.*`-Hosts der beiden Patterns ergänzen (url.ts:84ff)
- [ ] `pnpm --filter @musiccloud/backend test:run -- url-detection` grün

### Task 3: Shared Entity-Decode-Helper

**Files:** Create `apps/backend/src/services/plugins/_shared/html-entities.ts` + `__tests__`-Abdeckung im Plugin-Test (Task 5)

- [ ] `decodeHtmlEntities(input: string): string` mit TSDoc: named (`&amp; &quot; &lt; &gt; &apos;`) + numerisch dez/hex (`&#039;`, `&#x27;`); keine externe Dependency

### Task 4: Plugin amazon-music (Adapter + Manifest)

**Files:** Create `apps/backend/src/services/plugins/amazon-music/adapter.ts`, `apps/backend/src/services/plugins/amazon-music/index.ts`

- [ ] `adapter.ts` mit File-Header-Doku (Scrape-Strategie, UA-Wahl, Stufe-1-Grenzen) nach Vorbild `boomplay/adapter.ts`; Konstanten für beide UA-Strings lokal benennen (`TWITTERBOT_UA`, `GOOGLEBOT_UA`) — bewusst nicht `SCRAPER_USER_AGENT`
- [ ] `detectUrl`: Track-ASIN aus beiden URL-Formen (`/tracks/{ASIN}` direkt; `trackAsin=`-Query bei `/albums/`); Rückgabe-`sourceId`-Format: `{trackAsin}` bzw. `{albumAsin}:{trackAsin}` für den Album-Kontext (Format im Adapter dokumentieren)
- [ ] `getTrack`: bei `{albumAsin}:{trackAsin}` Album-JSON-LD-Pfad (Titel, Artist, Album, Dauer via `parseDuration`-Pendant, `webUrl`); bei nacktem ASIN og-Pfad (Titel/Artist aus `og:title` am **letzten** ` – ` gesplittet, Entity-dekodiert); Artwork aus og:image mit Modifier-Stripping-Versuch + Fallback auf Original-og-URL
- [ ] `findByIsrc`: `null` (kein ISRC ohne API); `searchTrack`: `found: false` (siehe Design); `capabilities: { supportsIsrc: false, supportsPreview: false, supportsArtwork: true }`
- [ ] Album-Surface: `detectAlbumUrl`, `getAlbum` (JSON-LD inkl. `tracks[]`-Mapping auf `AlbumTrackEntry`), `albumCapabilities: { supportsUpc: false, supportsAlbumSearch: false, supportsTrackListing: true }`; `searchAlbum` weglassen (optional im Interface)
- [ ] `index.ts`: Manifest `{ id: Service.AmazonMusic, displayName: "Amazon Music", description: …, defaultEnabled: true }` nach Vorbild `boomplay/index.ts`
- [ ] TSDoc auf allen Exports (tsdoc-Regel)

### Task 5: Adapter-Tests

**Files:** Create `apps/backend/src/services/plugins/amazon-music/__tests__/amazon-music.test.ts`

- [ ] URL-Routing-Fetch-Mock (Pattern `mockScFetch` aus PR #17, nicht positionsbasiert); Fixtures: minimiertes echtes JSON-LD (Preface-Struktur) + Twitterbot-og-HTML + leere SPA-Shell
- [ ] Fälle: detectUrl beide Formen + Storefronts + Negativ (Album ohne trackAsin, Retail `amazon.com/dp/…`), getTrack og-Pfad inkl. Entity-Decode (`&#x27;` → `'`), getTrack Album-Pfad (Dauer korrekt in ms), getAlbum Trackliste, searchTrack immer miss, Fehlerpfad non-200 → `serviceNotFoundError`
- [ ] `pnpm --filter @musiccloud/backend test:run -- amazon-music` grün

### Task 6: Registry

**Files:** Modify `apps/backend/src/services/plugins/registry.ts`

- [ ] Import + `amazonMusicPlugin` ans Ende von `PLUGINS` (registry.ts:102ff); Top-Kommentar der Reihenfolge unverändert lassen (Begründung gilt nur für die Suche)

### Task 7: Frontend + Dashboard + Apple Icons

**Files:** Create `apps/frontend/public/icons/amazon-music.svg`, `apps/dashboard/public/icons/amazon-music.svg`; Modify `apps/frontend/src/components/platform/PlatformIcon.tsx`; Create `apps/Apple/App/Supporting Files/Assets.xcassets/ServiceIcons/amazon-music.imageset/`

- [ ] Icon-Datei aus offiziellem Brand-Asset ablegen (siehe User-Tasks) — beide Web-Apps + Apple-imageset (`Contents.json` nach Muster `boomplay.imageset`)
- [ ] `PlatformIcon.tsx`: case `"amazon-music"` ergänzen (Muster der Nachbar-Cases)
- [ ] Dashboard-Icon-Konsumstelle greppen (`grep -rn "icons/" apps/dashboard/src`) und Mapping ergänzen, falls eine explizite Map existiert

### Task 8: Adapter-Doku + Gates

**Files:** Create `apps/backend/docs/adapters/amazon-music.md`

- [ ] Doku nach Muster `apps/backend/docs/adapters/boomplay.md`: Datenquellen, UA-Matrix, Stufe-1-Grenze (keine Suche), Verweis auf MC-087
- [ ] Volle Gates: `pnpm --filter @musiccloud/backend typecheck` && `pnpm lint` && `pnpm doctor:diff` && `pnpm test:run` — alle grün
- [ ] Smoke: lokalen Backend via `./app start backend`, `GET /api/v1/resolve?query=<amazon-track-url>` liefert Cross-Service-Links

## User-Tasks (parallel zu Stufe 1 starten!)

Die vollständige Antrags-Anleitung mit allen Links steht in [MC-087](2026-07-04-amazon-music-stufe-2-web-api.md) — der Antrag bei Amazon sollte **sofort** raus, da die Freischaltungsdauer außerhalb unserer Kontrolle liegt und Stufe 2 blockiert. Zusätzlich für Stufe 1 nötig:

- [ ] **Icon besorgen:** offizielles Amazon-Music-Logo als SVG/PNG (Quelle z. B. Brand-Ressourcen unter <https://artists.amazonmusic.com/> oder Presse-Kit); an Claude übergeben oder in `apps/frontend/public/icons/` ablegen
- [ ] **Brand-Farbe bestätigen:** verbindlichen Hex-Wert aus dem Brand-Asset (Open Question unten)

## Verified facts (2026-07-04)

| Referenz | Beleg |
| --- | --- |
| `Service`-Objekt + `ServiceId`-Union | Read `packages/shared/src/services.ts` (Z. 30-55) |
| `PLATFORM_CONFIG`, `SERVICE_DISPLAY_ORDER` | Read `packages/shared/src/platform.ts` (Z. 36-87) |
| `MUSIC_URL_PATTERNS`/`ALBUM_URL_PATTERNS`/`ALLOWED_HOSTS`/`stripTrackingParams` (`ref` wird global entfernt) | Read `apps/backend/src/lib/platform/url.ts` (Z. 17-150, 224-311) |
| Reject-Tests Amazon | grep `apps/backend/src/__tests__/url-detection.test.ts:64-65,134` |
| Plugin-Muster (Manifest/Barrel) | Read `apps/backend/src/services/plugins/boomplay/index.ts`, `manifest.ts` |
| `ServiceAdapter`-Interface inkl. optionaler Album-Surface | Read `apps/backend/src/services/types.ts` (Z. 122-150) |
| Registry-Append-Muster | Read `apps/backend/src/services/plugins/registry.ts` (Z. 102-124) |
| `PlatformIcon`-Switch | grep `apps/frontend/src/components/platform/PlatformIcon.tsx:32ff` |
| Apple-Icon-Muster | find `apps/Apple/…/ServiceIcons/boomplay.imageset` |
| Adapter-Doku-Muster | find `apps/backend/docs/adapters/{boomplay,pandora}.md` |
| Gate-Scripts `typecheck`/`test:run` (backend), `lint`/`doctor:diff`/`test:run` (root) | grep `apps/backend/package.json`, `package.json` |
| Live-Scrape-Befunde (og/JSON-LD/UA-Matrix/Suche bot-dicht) | curl-Tests 2026-07-04, dokumentiert im Preface |
| Backend-Package-Name `@musiccloud/backend` | grep `apps/backend/package.json:name` |

## Open questions

1. **Brand-Hex-Farbe:** kein verifizierter Wert; aus offiziellem Asset bestimmen (User-Task), erst dann in `PLATFORM_CONFIG` eintragen.
2. **Raw-Artwork-Ableitung** (`…/images/I/{id}.jpg` ohne Sticker-Modifier): plausibel, aber beim Implementieren gegen 2-3 Alben verifizieren; Fallback = og:image mit Sticker.
3. **Bot-UA-Toleranz:** Amazon KÖNNTE Googlebot per Reverse-DNS verifizieren; falls der JSON-LD-Pfad in Prod 4xx/Shell liefert, degradiert `getTrack` auf den og-Pfad (Twitterbot) — beide Pfade deshalb unabhängig testbar bauen.

## Checklist

- [ ] All code references verified (functions, scripts, paths, env vars, package-manager commands)
- [ ] Task 1 Shared abgeschlossen
- [ ] Task 2 URL-Detection abgeschlossen
- [ ] Task 3 Entity-Helper abgeschlossen
- [ ] Task 4 Plugin abgeschlossen
- [ ] Task 5 Tests abgeschlossen
- [ ] Task 6 Registry abgeschlossen
- [ ] Task 7 Icons abgeschlossen
- [ ] Task 8 Doku + Gates abgeschlossen
- [ ] User-OK zur Abnahme (Plan erst danach nach `done/`)
