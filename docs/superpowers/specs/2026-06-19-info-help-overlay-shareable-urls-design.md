# Spec: Teilbare URLs für Info/Help-Overlays

**Datum:** 2026-06-19
**Status:** Design freigegeben, bereit für Implementierungsplanung

## Kontext

Die Info/Help-Menüpunkte öffnen overlay-mode Content-Pages (`displayMode !== fullscreen`) als verschiebbares, zentriertes Modal über der aktuellen Seite. Beim Öffnen schreibt [OverlayContext.tsx](../../../apps/frontend/src/context/OverlayContext.tsx)`open()` per `history.pushState` den Pfad `/${slug}` (z.B. `/info`) in die Adresszeile.

Ein Reload (oder Direktaufruf einer geteilten URL) lädt `/info` frisch über die Catch-all-Route [`[shortId].astro`](../../../apps/frontend/src/pages/[shortId].astro). Für normale Browser rendert deren Server-Island [DeferredShareContent.astro](../../../apps/frontend/src/components/share/DeferredShareContent.astro) die Seite im **Share-Page-Layout** (großes zentriertes `LogoView` + Content), nicht als Overlay über der Landingpage. Zusätzlich wird das Overlay-Island in `<div class="animate-slide-up">` gewickelt; dieses `transform` macht den Div zum Containing-Block für den `position: fixed`-OverlayFrame, der dadurch aus dem Viewport rutscht (unten rechts, abgeschnitten).

Ergebnis: Nach Reload erscheint ein falsches, kaputtes Layout statt der erwarteten Landingpage mit offenem Overlay.

Im Browser reproduziert (lokal, `:3002`): Frame-Inline-Style `left: 460px` (korrekt zentriert), aber `getBoundingClientRect().x = 1180` bei `1440×900`-Viewport; Vorfahren-Kette enthält `animate-slide-up` mit `transform`.

## Ziel

Info/Help-Overlays (und allgemein alle overlay-mode Content-Pages) bekommen teilbare URLs. Ruft jemand eine solche URL direkt auf, erscheint **stets die Landingpage mit geöffnetem Overlay und der korrekten Sektion**.

## Verhalten

### URL-Semantik

- **Pfad** = Overlay-Slug: `/info`, `/help`.
- **Hash** = Sektion über den `targetSlug` des Segments: `/info#services`.
- Nicht-segmentierte overlay-mode Pages: nur `/slug` (kein Hash).

### Interaktionen

| Aktion | URL | Verhalten |
| --- | --- | --- |
| Menü-Klick öffnet Overlay | `pushState` `/slug` (+ Hash der aktiven Sektion) | Overlay öffnet client-seitig über der aktuellen Seite |
| Tab-/Sektionswechsel im Overlay | `replaceState` nur des Hashs | Kein History-Eintrag pro Tab |
| Direktaufruf `/info#services` | bleibt | Landingpage-Hintergrund + Overlay offen, Sektion `services` aktiv |
| Schließen / Back (aus Seite geöffnet) | zurück zur Ausgangsseite | bestehendes Verhalten |
| Schließen / Back (per Direktlink geöffnet) | `/` | Landingpage, Overlay zu, Hash weg |

- Ungültiger oder fehlender Hash → erstes Segment.
- Sektionsauswahl erfolgt über `PublicPageSegment.targetSlug` (siehe [content.ts](../../../packages/shared/src/content.ts)).

## Architektur

Leitidee: Eine overlay-mode Content-Page **ist** „Landingpage mit offenem Overlay". Direktaufruf und Menü-Klick müssen denselben visuellen Zustand erzeugen. Die Homepage rendert bereits `BaseLayout` + `<LandingPage>` + `PageOverlayIsland(initialPage=null)` ([index.astro:66-73](../../../apps/frontend/src/pages/index.astro)). Der Direktaufruf einer overlay-mode Page rendert künftig dasselbe, nur mit `initialPage=contentPage`.

### Routing & Rendering

- `/` → `index.astro` → `LandingPage` + `PageOverlayIsland(null)`. **Unverändert.**
- `/<overlay-slug>` (overlay-mode Content-Page) → Browser-Pfad in `DeferredShareContent.astro` rendert `<LandingPage>` + `PageOverlayIsland(initialPage=contentPage)` **statt** `LogoView`-Share-Shell.
- `/<fullscreen-slug>` (fullscreen Content-Page) → **unverändert** (fullscreen-Render).
- `/<shortId>` (echte Track/Album/Artist-Share) → **unverändert** (`SharePageShell`).

`LandingPage` benötigt `footerNav` + `exampleShortId`; diese werden in der Server-Island analog zu [index.astro:10-12](../../../apps/frontend/src/pages/index.astro) gefetcht.

### Containing-Block-Fix

Das Overlay wird nicht mehr in `<div class="animate-slide-up">` gewickelt, sondern als Geschwister von `LandingPage` gerendert (wie in `index.astro`). Damit existiert kein `transform`-Vorfahr mehr und der `position: fixed`-Frame zentriert sich korrekt.

### Schließen / `previousUrl`

`initialOverlayState` in `OverlayContext.tsx` setzt aktuell `previousUrl` auf die aktuelle URL. Bei Direktaufruf (`initialPage` gesetzt) muss `previousUrl` stattdessen `/` sein, damit Schließen/Back auf der Landingpage landet statt auf `/info` zu verharren.

### Hash ↔ Sektion

Das segmentierte Overlay-Content-Component liest beim Mount `location.hash`, wählt das Segment mit passendem `targetSlug` (Fallback: erstes Segment) und schreibt bei Tab-Wechsel den Hash per `replaceState`.

## Betroffene Komponenten

- `apps/frontend/src/components/share/DeferredShareContent.astro` — overlay-mode Branch rendert Landing-Shell + Overlay; `footerNav`/`exampleShortId` fetchen; `animate-slide-up`-Wrapper um das Overlay entfernen.
- `apps/frontend/src/pages/[shortId].astro` — Bot-Pfad analog (für overlay-mode Pages keine `LogoView`-Fehlplatzierung; OG bleibt out of scope).
- `apps/frontend/src/context/OverlayContext.tsx` — `previousUrl`-Fix bei Direktaufruf; Hash beim Öffnen/Schließen.
- `apps/frontend/src/components/layout/PageOverlayIsland.tsx` bzw. das segmentierte Overlay-Content-Component — Sektionsauswahl per Hash, Hash-Schreiben beim Tab-Wechsel.

## Edge Cases

- Ungültiger/fehlender Hash → erstes Segment, kein Fehler.
- Nicht-segmentierte overlay-mode Page → `/slug` ohne Hash.
- Fullscreen Content-Pages und echte Shares → unverändert.
- No-JS: Overlay hydriert nicht; Landingpage-`<noscript>`-Fallback bleibt sichtbar. Bots erhalten den synchronen SSR-Pfad (Content im Body für Crawler), wie bisher.

## Out of Scope

- Custom-OG-Tags für geteilte Info/Help-Links (Bots bekommen aktuell `BaseLayout`-Defaults — separates Thema).
- Section-URLs via Pfad (`/info/services`) statt Hash.

## Verifizierte Fakten (Stand 2026-06-19, gegen Repo gegrept/gelesen)

- `OverlayContext.tsx:80` — `window.history.pushState({ overlay: page.slug }, "", `/${page.slug}`)`.
- `OverlayContext.tsx:45-57` — `initialOverlayState` setzt `previousUrl` auf aktuelle URL.
- `pages/[shortId].astro` — Catch-all; Browser-Pfad rendert `DeferredShareContent server:defer` (Z. 192).
- `DeferredShareContent.astro:37-41` — fetcht `contentPage` + `shareData` parallel, `contentPage` hat Vorrang.
- `DeferredShareContent.astro:93-106` — overlay-mode Branch: `LogoView` + `<div class="animate-slide-up">` + `PageOverlayIsland(initialPage=contentPage)`.
- `index.astro:4,67,73` — `LandingPage` (`@/components/landing/LandingPage`) + `PageOverlayIsland(initialPage=null)`.
- `packages/shared/src/content.ts:125-132` — `PublicPageSegment { label, targetSlug, title, showTitle, content, contentHtml }`.
- `packages/shared/src/content.ts:134-146` — `PublicContentPage` mit `segments: PublicPageSegment[]`.
- `styles/global.css:67` — `--animate-slide-up: slide-up 0.6s … both` (Fill-Mode `both` lässt `transform` stehen → Containing-Block für `fixed`).
- Browser-Repro: Frame `left:460px` inline, aber `rect.x=1180`; Vorfahr `animate-slide-up` mit `transform`.

## Checklist

- [ ] Alle Code-Referenzen verifiziert (Funktionen, Pfade, Komponenten)
- [ ] DeferredShareContent rendert Landing-Shell + Overlay für overlay-mode Pages
- [ ] `animate-slide-up`-Containing-Block behoben (Overlay als Geschwister)
- [ ] `previousUrl`-Fix bei Direktaufruf
- [ ] Hash ↔ Sektion (lesen beim Mount, schreiben beim Tab-Wechsel)
- [ ] Repro-Test: Direktaufruf `/info#services` → Landingpage + Overlay offen, Sektion services, Frame zentriert
- [ ] Bestehende Pfade unverändert: `/`, fullscreen Pages, echte Shares
