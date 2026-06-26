# Status-Page-Theme (Upptime-Fork) — Design

> Design-Spec. Begleitet von Plan [MC-062](../../../.claude/plans/open/2026-06-26-status-page-musiccloud.md).
> Stand: 2026-06-26. Sprache: Deutsch (Prosa), Englisch (Code-Identifier, Config-Keys).

## Kontext / Ausgangslage

Mehrere Projekte (musiccloud, lmaa.space, weitere) sollen je eine öffentliche Status-Seite unter eigener Subdomain bekommen (`status.musiccloud.io`, `status.lmaa.space`, …). Als Engine wird **Upptime** genutzt: kostenlos, serverlos, läuft komplett auf GitHub Actions (Monitoring) + GitHub Pages (Auslieferung). Ein öffentliches Repo pro Projekt liefert unbegrenzte Actions-Minuten.

Die generische Upptime-Default-Optik gefällt nicht. Referenz-Design ist die Design-Sprache von **Better Stack** (dunkel, Indigo-Akzent, embossed Display-Type, ruhige Karten). Das Frontend von `@upptime/status-page` ist **Svelte + plain CSS** und damit voll umbaubar.

## Ziel

Ein **wiederverwendbares, dunkles Status-Page-Theme** als Fork-/Custom-Front-end für Upptime. Einmal gebaut, pro Projekt nur per Config gebrandet (Akzentfarbe, Font, Logo, Name, Services). Erste Umsetzung: `status.musiccloud.io`.

## Nicht-Ziele

- **Kein E-Mail-Subscribe.** Abo nur per RSS/Atom-Feed (keine Personendaten, kein GDPR-Ballast). Reine Anzeige-Seite.
- **Kein Light-Mode / kein Theme-Toggle.** Dark-only (KISS).
- **Keine eigene Live-Backend-Komponente** für die Status-Seite. Es bleibt statisch + GitHub-Pages.
- **Kein bespoke Design pro Projekt.** Ein Theme, Branding ausschließlich über Config.

## Architektur

### Upptime-Datenmodell (unverändert genutzt)

- **Monitore:** HTTP-/TCP-Checks im 5-Minuten-Takt → Up/Down/Degraded **automatisch**. Kein manueller Schalter für den Grundstatus.
- **Incidents:** automatisch erzeugte **GitHub Issues** bei Ausfall (Titel/Body = Incident-Text). Manuell ebenfalls möglich.
- **Maintenance:** manuell erstelltes Issue mit Label `maintenance` und Metadaten-HTML-Kommentar im Body:
  `<!-- start: <ISO> end: <ISO> expectedDown: <slug,…> expectedDegraded: <slug,…> -->`. `start`/`end` Pflicht; `expectedDown`/`expectedDegraded` unterdrücken Auto-Incidents im Fenster.
- **Verteilung:** ein öffentliches Repo pro Projekt, je eine Subdomain via GitHub-Pages-`CNAME`.

### Custom-Front-end-Strategie (Spike-entschieden)

**Entscheidung: natives Theming über `.upptimerc.yml`, kein Fork.** Spike-Befunde (Task 1):

- `@upptime/status-page` v1.17.0 = **Sapper + Svelte 3** (abgekündigt), gebaut vom Action `upptime/uptime-monitor@v1.43.2` (`command: site`), deployt via `peaceiris/actions-gh-pages` (`site.yml`, Rebuild triggerbar per `repository_dispatch: static_site`). Ein Fork ließe sich **nicht** sauber einklinken (das Action zieht das publizierte npm-Paket).
- `_layout.svelte` bietet native Hooks aus `.upptimerc.yml`: `css` (inline `<style>`), `themeUrl`, `customHeadHtml`, `js`, `customBodyHtml`, `links`, `scripts`. Theme-Farben laufen über CSS-Variablen (`--body-background-color`, `--card-background-color`, `--up-border-left-color`, `--tag-*` …).
- **Datenfluss:** der Client liest **live über die GitHub-API** (`@octokit/rest`), mit localStorage-Cache (~2 min Prod). Daten-Contract committet: `api/`, `graphs/`, `history/`.

Umsetzung als **Custom-Theme im `css`-Block** + `customHeadHtml` (Inter + Phosphor-Duotone-Web-Font); Phosphor-Icon **pro** Service via kleinem `js`-DOM-Enhancement. Kein Fork, überlebt Template-Updates, pro Projekt reusable. Pixel-Feinschliff iterativ gegen die Live-Seite.

## Visuelles Design

- **Dunkel**, Near-Black mit dezentem Radial-Glow oben; embossed-weiße Display-Headline (Gradient-Text-Fill).
- **Indigo als Leitakzent, monochrom** — Status-Icons, 90-Tage-Balken, Sparkline, Pill, Logo-Mark. **Kein dominantes Grün.**
- **Amber = degraded, Rot = down** als einzige Warnfarben (semantische Signale).
- **90-Tage-Balken** (vertikale Stripes via CSS-Mask) mit subtilem Vertikal-Gradient (oben heller).
- **Phosphor Duotone Icons** (`@phosphor-icons/web` Duotone via `customHeadHtml`-CDN-Link, da kein Fork): pro Service ein Typ-Icon (per `js`-DOM-Enhancement), `CheckCircle` im Hero/Pill, `Bell` beim Feed-Link.
- **Typografie:** Inter (UI) + Monospace (Metriken). Pro Projekt via `font` überschreibbar.

## Inhalt & Verhalten

- **Hero:** Gesamtstatus (Icon + embossed Headline) + Zeitstempel.
- **Service-Liste:** Icon, Name, Uptime-%, 90-Tage-Balken; aufklappbare Detailzeile (Response-Sparkline, Quelle wie `via /health/email`, Incident-Zähler). Reihenfolge = `sites:`-Array-Reihenfolge, garantiert (keine Auto-Sortierung).
- **Past Incidents (Tiefe B):** schlanke Liste der letzten ~14 Tage (Datum, Service, Dauer, kurzer Text), aufklappbar. Vergangene Maintenance in eigenem Abschnitt darüber. Daten aus Upptime/GitHub Issues.
- **Email-Service:** überwacht via Backend-Health-Endpoint `GET /health/email` (Variante B). Der Endpoint prüft server-seitig die SMTP2GO-Erreichbarkeit und gibt `200`/`503` zurück — **kein Secret im public Repo**.
- **Abo:** „Subscribe" verlinkt den RSS/Atom-Feed (keine E-Mail-Erfassung).

## Konfigurationsoberfläche (`.upptimerc.yml`)

Ein **CSS-Variablen-Vertrag** ist das Fundament; freundliche Config-Keys sind die Hülle, die das Build darauf mappt.

- `--accent` (Leitfarbe), `--accent-deg` (Amber), `--accent-down` (Rot), `--font-sans`, `--font-mono`, plus Flächen-Variablen.
- Keys: `accent`, `font` (Font-Quelle via `customHeadHtml`/`links` oder gebündelt), `logoUrl`, `name`.
- **Service-Reihenfolge** = Reihenfolge der `sites:`-Einträge.
- Pro Service optional ein wählbares Phosphor-Icon (ohne Angabe ein neutrales Default-Icon).
- **Seitensprache** Englisch als Default, pro Projekt via Upptime-i18n überschreibbar.

## Maintenance- & Deploy-Ankündigungen

Ziel: Status möglichst **automatisch**, nicht von Hand.

- **Automatisch (deploy-getrieben, Empfehlung):** Das Status-Template-Repo bekommt einen `repository_dispatch`-Handler-Workflow (`deploy_start`/`deploy_end`), der das `maintenance`-Issue mit `expectedDegraded` anlegt/schließt und den Seiten-Rebuild anstößt. Jeder Deploy-Job im Hauptrepo (`ci.yml`, pro-Service `zcli push`) bekommt zwei Schritte: Announce-Start vor dem Deploy, Announce-End (`if: always()`) danach. Auth via fein-scoped Token-Secret (`STATUS_DISPATCH_TOKEN`), da cross-repo.
- **MVP:** Auto-Announce zuerst nur **Backend** (höchstes Blip-/Migrations-Risiko), opt-in pro Service, trivial nachziehbar.
- **Fallback:** manueller `workflow_dispatch`-Schalter + Issue-Templates für geplante Wartung ohne Deploy.

## Build-Performance / Latenz

Sofern Banner einen Rebuild brauchen (Spike klärt, ob nötig): die statische Seite wird komplett neu gebaut + via GitHub Pages + Fastly-CDN ausgeliefert. Hebel:

- **Hebel A — Caching:** Dependencies/Theme-Assets via `actions/cache` / pnpm-Store-Cache. Fest eingeplant.
- **Hebel B — Volatile/Stabil trennen (optionaler Fast-Path):** aktueller Status/Banner in eine kleine `status.json`, client-seitig gelesen; Banner-Update = kleine Datei schreiben statt voller Rebuild. Datenschicht so designen, dass die Option offen bleibt; nur bauen, wenn die Latenz real stört.
- **Realistische Decke:** Pages-Publish + CDN bleiben GitHub-seitig (~30–60 s). Nicht instant.

**Latenz-Korrektur (Spike):** Incidents/Maintenance (GitHub Issues) werden vom Client **live über die GitHub-API** geladen — ein Banner erscheint also beim nächsten Aufruf bzw. nach Ablauf des localStorage-Caches (~2 min Prod, Schlüssel `productionCacheTime`), **ohne Rebuild**. Die Rebuild-Latenz (1–2 min / 30–60 s mit Caching) betrifft nur die statische Hülle + Graphen, nicht die Banner. **Achtung Rate-Limit:** unauth. GitHub-API (60 req/h/IP) → Upptime hat dafür eine `rate-limit-exceeded`-Route und erlaubt einen optionalen PAT im localStorage. Für niedrige Zugriffszahlen unkritisch.

## Spike-Ergebnis (Task 1 — erledigt)

1. **Einklink-Mechanismus:** natives Theming via `.upptimerc.yml` (kein Fork) — siehe Architektur.
2. **Datenbezug/Latenz:** Live-GitHub-API + localStorage-Cache → Banner ohne Rebuild (siehe Latenz-Korrektur).
3. **Daten-Contract:** committet `api/`, `graphs/`, `history/`; Client liest via GitHub-API + `raw.githubusercontent`.
4. **Stack:** `@upptime/status-page` v1.17.0 = Sapper + Svelte 3 (abgekündigt), gebaut vom `uptime-monitor`-Action.

## Verwandt

- E-Mail: SMTP2GO-Wechsel (`/health/email`-Endpoint ist Voraussetzung für den Email-Service).
- Deploy: `.github/workflows/ci.yml` (pro-Service `zcli push` → Zerops) ist die Quelle der Deploy-Ankündigungen.
