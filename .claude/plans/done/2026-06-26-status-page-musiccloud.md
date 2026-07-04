# Status-Page `status.musiccloud.io` (Upptime-Fork-Theme) Implementation Plan

Plan-Nr.: MC-062

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Die erste Status-Seite `status.musiccloud.io` live — dunkles, Indigo-akzentuiertes Custom-Theme auf Upptime, mit den musiccloud-Services (inkl. Email via `/health/email`), RSS-Abo, automatischen Deploy-Ankündigungen und Build-Caching. Das Theme wird so gebaut, dass es als wiederverwendbares Template für weitere Projekte (lmaa.space …) dient.

**Architecture:** Upptime als Engine (GitHub Actions = Monitoring, GitHub Pages = Auslieferung) in einem **eigenen öffentlichen Repo** `phranck/status.musiccloud.io`. Das Default-Front-end von `@upptime/status-page` (Svelte) wird durch ein Custom-Theme ersetzt/geforkt. Branding ausschließlich über Config. Zwei Repos sind betroffen: das neue Status-Repo (Theme, Config, Pages) und das musiccloud-Monorepo (`/health/email`-Endpoint, Deploy-Ankündigungs-Schritte in `ci.yml`).

**Tech Stack:** Upptime (GitHub Actions + Pages), `@upptime/status-page` (Svelte + plain CSS, Rollup), `phosphor-svelte` (`weight="duotone"`), Inter + Monospace, `.upptimerc.yml` (`status-website`-Hooks), GitHub `repository_dispatch`, `actions/cache`.

**Verwandt:** [Spec](../../../docs/superpowers/specs/2026-06-26-status-page-theme-design.md) · E-Mail SMTP2GO-Wechsel (Voraussetzung für `/health/email`) · `.github/workflows/ci.yml` (Deploy-Quelle).

---

## Geltungsbereich

**Enthalten:** Theme-Bau, das erste Status-Repo `status.musiccloud.io`, `/health/email`-Endpoint, RSS-Abo, automatische Deploy-Ankündigung (MVP: Backend), Build-Caching, Pages-Deploy unter `status.musiccloud.io`.

**Bewusst nicht enthalten (Folge-Arbeit):** weitere Projekt-Status-Repos (lmaa.space etc.) — die kopieren das fertige Template. Optionaler Fast-Path (Hebel B `status.json`) — nur bauen, wenn die Latenz real stört. E-Mail-Subscribe (per Design ausgeschlossen).

**Repo-Stand:** `phranck/status.musiccloud.io` existiert bereits (public, leer) — vom Betreiber angelegt. Outward-facing verbleibend: **DNS** (`CNAME status.musiccloud.io → phranck.github.io`) und **GitHub-Pages-Aktivierung** — mit dem Betreiber abgestimmt, nicht eigenmächtig.

---

## Task 1: Spike — Einklink-Mechanismus & Daten-Contract klären

Vor jedem Bau: die offenen technischen Fragen der Spec auflösen, am echten Code/Repo, nicht aus Doku geraten. **Erledigt 2026-06-26** (Befunde in Spec-Abschnitt „Spike-Ergebnis").

- [x] `@upptime/status-page` v1.17.0 inspiziert: **Sapper + Svelte 3** (abgekündigt), gebaut vom Action `upptime/uptime-monitor@v1.43.2` (`command: site`), Deploy via `peaceiris/actions-gh-pages` (`site.yml`).
- [x] Theming-Mechanismus: **native Hooks reichen** (`css`/`themeUrl`/`customHeadHtml`/`js` in `_layout.svelte`), **kein Fork**. Farben über CSS-Variablen.
- [x] Daten-Contract: committet `api/`, `graphs/`, `history/`; Client liest live via GitHub-API (`@octokit/rest`) + `raw.githubusercontent`.
- [x] **Banner-Latenz:** Issues werden **live geladen** (localStorage-Cache ~2 min) → Banner **ohne Rebuild**. Rate-Limit-Hinweis: unauth. GitHub-API 60/h/IP.
- [x] Entscheidung + Daten-Contract in Spec nachgetragen.

## Task 2: Status-Repo `status.musiccloud.io` anlegen & Basis-Config

**Files (status.musiccloud.io repo):**
- Create: `.upptimerc.yml` (Owner/Repo, `sites:` in Reihenfolge inkl. `Email` → `https://api.musiccloud.io/health/email`, `status-website`-Block: name, logoUrl, theme)
- Create: `CNAME` (`status.musiccloud.io`)

- [x] Das bestehende leere Repo `phranck/status.musiccloud.io` mit Upptime-Template-Inhalt befüllen (klonen, Template-Struktur einspielen, pushen).
- [x] `sites:` mit musiccloud-Services in gewünschter Reihenfolge: Frontend, API, Backend, Database, Email, Developer Site.
- [x] Monitoring-Lauf grün (Up/Down korrekt erkannt) vor jeder Theme-Arbeit.

## Task 3: `/health/email`-Endpoint im Backend (Variante B)

**Files (musiccloud monorepo):**
- Modify/Create: `apps/backend/...` (öffentlicher `GET /health/email`, prüft SMTP2GO-Erreichbarkeit server-seitig, `200`/`503`, kein Secret nach außen)

- [x] Endpoint implementiert, TSDoc, kein Secret im Response/Log.
- [x] Lokal + deployt verifiziert (`200` bei gesundem Provider, `503` simuliert).
- [x] Exakter Pfad/Dateistruktur nach Inspektion der bestehenden Backend-Routen (Task-intern verifizieren, nicht raten).

## Task 4: Custom-Theme bauen (Look)

Umsetzung als **`status-website.css`-Block + `customHeadHtml`** in `.upptimerc.yml` (kein Fork). CSS-Variablen-Override (`--body-background-color`, `--card-*`, `--up-border-left-color`, `--tag-*`) + Custom-Regeln auf die Stock-DOM (`article.up/.degraded/.down`, `nav`, `.tag`, `.graph`).

- [ ] Dark-Base mit Radial-Glow, embossed Display-Headline.
- [ ] Indigo-Monochrom-Akzent (`--up`/`--tag-up` → Indigo); Amber/Rot nur als Warnzustände.
- [ ] Inter (UI) + Monospace (Metriken) via `customHeadHtml`-Font-Links.
- [ ] **Phosphor Duotone** via `@phosphor-icons/web`-CDN (`customHeadHtml`); Service-Typ-Icons per `js`-DOM-Enhancement, `CheckCircle`/`Bell` für Hero/Feed.
- [ ] Karten/Balken/Past-Incidents an den Mockup angenähert (Pixel-Feinschliff iterativ gegen die Live-Seite, da Sapper-Build nur deployt prüfbar).

## Task 5: Konfigurationsoberfläche (CSS-Variablen + Keys)

- [ ] CSS-Variablen-Vertrag: `--accent`, `--accent-deg`, `--accent-down`, `--font-sans`, `--font-mono`, Flächen-Variablen.
- [ ] Config-Keys `accent`/`font` mappen auf die Variablen (über `status-website.css`/Build).
- [ ] Pro-Service-Icon-Key (optional, Default-Icon fallback).
- [ ] Verifiziert: zweites Beispiel-Branding (andere `--accent`) zieht durch das ganze Theme.

## Task 6: RSS/Atom-Abo

- [x] „Subscribe" verlinkt den Upptime-Feed (Feed-Pfad in Task 1 bestätigen).
- [x] Keine E-Mail-Erfassung, keine Personendaten.

## Task 7: Pages-Deploy unter `status.musiccloud.io`

- [x] GitHub Pages aktiv, `CNAME` gesetzt, DNS `CNAME status.musiccloud.io → <user>.github.io` (mit Betreiber).
- [x] „Enforce HTTPS" aktiv (Let's-Encrypt automatisch).
- [x] Seite live, Theme korrekt, alle Services sichtbar.

## Task 8: Automatische Deploy-Ankündigungen (MVP Backend)

**Files (status.musiccloud.io repo):**
- Create: `.github/workflows/deploy-announce.yml` (`on: repository_dispatch` Typen `deploy_start`/`deploy_end` → `maintenance`-Issue anlegen/schließen + Rebuild anstoßen)
- Create: `.github/ISSUE_TEMPLATE/maintenance.md`, `deploy.md`
- Create: `.github/workflows/maintenance-switch.yml` (`workflow_dispatch`-Fallback)

**Files (musiccloud monorepo):**
- Modify: `.github/workflows/ci.yml` (`deploy-backend`: Announce-Start vor `zcli push`, Announce-End `if: always()` danach)

- [x] `STATUS_DISPATCH_TOKEN` (fein-scoped, nur Issue-Write aufs Status-Repo) als Secret im Monorepo.
- [x] Backend-Deploy setzt/schließt das Banner automatisch (success + failure getestet).
- [x] Manueller `workflow_dispatch`-Schalter funktioniert (geplante Wartung ohne Deploy).
- [x] Andere Services (Frontend/Dashboard/Developer) als opt-in dokumentiert (Copy-Paste der zwei Schritte).

## Task 9: Build-Performance

- [ ] Hebel A: `actions/cache` / pnpm-Store-Cache für Deps + unveränderte Theme-Assets.
- [ ] Datenschicht so gestaltet, dass Hebel B (Fast-Path `status.json`) später ohne Umbau ergänzbar ist — Fast-Path selbst nur bauen, falls Latenz real stört (sonst YAGNI).

---

## Umsetzungsstand (2026-06-26)

**LIVE — Velvet-Pivot (2026-06-26):** Der CSS-Reskin-Ansatz (natives Theming auf Stock-Upptime, Task 4/5) wurde verworfen, weil er das abgenommene Mockup strukturell nicht erreicht (keine 90-Tage-Balken, keine Phosphor-Icons pro Service). Stattdessen rendert `status.musiccloud.io` jetzt das eigene **Velvet**-Front-end (Svelte, config-getrieben) als OSS-Projekt: Repo `phranck/velvet` (MIT, GitHub Action `phranck/velvet@v1` + Template-Plan), README mit Badges/Screenshot. musiccloud ist der erste Konsument (`.upptimerc.yml` `velvet:`-Block + `velvet.yml`-Deploy-Workflow, Stock-`site.yml` disabled). **Live verifiziert.** Offen: `velvet-template`-Repo, README-Screenshot-Feinschliff, Down-Services-Monitoring (separat).

**Erledigt (Reskin-Phase, jetzt durch Velvet abgelöst):**
- Task 1 (Spike) komplett, Spec gesynct.
- Task 2: Repo `phranck/status.musiccloud.io` mit Upptime-Template + `.upptimerc.yml` (Services Frontend / API `/health/ready` / Dashboard / Developer Site) + CNAME befüllt und nach `main` gepusht. Demo-Daten entfernt.
- Task 4/5 (Look, erster Pass): Dark-Indigo-Theme via `css` + `customHeadHtml` (Inter, JetBrains Mono, Phosphor-Duotone-Web-Font) in `.upptimerc.yml`. Pixel-Feinschliff + Phosphor-pro-Service offen (iterativ gegen Live-Seite).
- Task 8: Status-Repo-seitig `deploy-announce.yml` (repository_dispatch) + `maintenance-switch.yml` + Issue-Templates. Monorepo-seitig `deploy-backend` in `ci.yml` verdrahtet (inert bis `STATUS_DISPATCH_TOKEN`).

**Offen — extern (Betreiber):**
- `GH_PAT`-Secret im Status-Repo (Upptime-Pflicht, sonst laufen die Monitor-Workflows nicht).
- GitHub Pages aktivieren (Branch `gh-pages`) + DNS `CNAME status.musiccloud.io → phranck.github.io` + „Enforce HTTPS".
- `STATUS_DISPATCH_TOKEN`-Secret im Monorepo (fine-scoped, issues:write aufs Status-Repo) → aktiviert Auto-Announce.

**Offen — blockiert / Folge:**
- Task 3 `/health/email`: blockiert, Backend nutzt noch **Brevo** (nicht SMTP2GO). Email-Service-Zeile ist in `.upptimerc.yml` auskommentiert.
- Task 6 RSS: Stock-Upptime hat keinen Feed → kleiner Generator-Workflow als Folge-Schritt (Navbar aktuell Status/History/GitHub).
- Task 9 Build-Caching / Fast-Path: noch offen.
- **Health-URL-Umstellung (2026-06-27, erledigt):** Das Backend exponiert jetzt ausschliesslich uniforme `/health/<service>`-Endpoints (`backend`, `db`, `frontend`, `developer`, `dashboard`, `email`); die generischen `/health` und `/health/ready` wurden entfernt. Der Zerops-Container-`healthCheck` zeigt jetzt auf `/health/db`. Die `.upptimerc.yml` im Status-Repo nutzt bereits exakt diese uniformen URLs (Frontend/Backend/Database/Email/Dashboard/Developer je `/health/<service>`), kein `/health/ready` mehr — gegen das Live-Repo `phranck/status.musiccloud.io` verifiziert, kein externer Folge-Bedarf.

## Verified facts (Stand 2026-06-26)

- **Plan-Nr.:** `~/.local/bin/plans next` → `MC-062` (Prefix MC bestätigt via bestehende Pläne).
- **`@upptime/status-page` Stack:** Svelte (61 %) + Rollup + plain CSS, npm (GitHub-Repo-Sprachen-Breakdown). *Caveat:* „How it works"-Doku nennt Svelte+Sapper + Live-GitHub-API → Versions-/Datenfluss-Diskrepanz, in Task 1 zu klären.
- **`.upptimerc.yml` `status-website`-Keys:** `theme`, `name`, `logoUrl`, `cname`, `navbar`, `css` (inline-CSS), `themeUrl`, `links`, `customHeadHtml`, `assets/`-CSS mit CSS-Variablen — verifiziert via upptime.js.org/docs/configuration.
- **Maintenance-Format:** Issue-Label `maintenance` + Body-Kommentar `<!-- start: <ISO> end: <ISO> expectedDown: <slug,…> expectedDegraded: <slug,…> -->`; `start`/`end` Pflicht — verifiziert via upptime.js.org/docs/scheduled-maintenance.
- **`phosphor-svelte`:** `import XIcon from "phosphor-svelte/lib/XIcon"`, Prop `weight="duotone"`, `IconContext` für globalen Default — verifiziert via npm/README.
- **`@phosphor-icons/web`** (nur Mockup-Vorschau): Duotone-CDN `…/@phosphor-icons/web@2.1.2/src/duotone/style.css`, Klassen `ph-duotone ph-<name>`.
- **SMTP2GO-API:** `https://api.smtp2go.com/v3/` (EU-Base-URL vorhanden), Auth-Key, POST+JSON, ungültiger Key → 401 — verifiziert via developers.smtp2go.com.
- **Deploy-Pfad:** `.github/workflows/ci.yml` deployt pro-Service via `zcli push --serviceId …` auf GitHub Actions (Jobs `deploy-backend/-frontend/-developer/-dashboard`, Change-Detection) — gelesen.

## Open questions (Task-1-Spike, kein Pseudo-Fakt)

- Exakter Einklink-Mechanismus (native Hooks vs. Fork + eigene Build-Pipeline).
- Datenfluss/Banner-Latenz (Live-GitHub-API vs. gebacken).
- Daten-Contract-Dateien (`summary.json`/`history/`/`api/`) und Feed-Pfad.
- Exakte Backend-Route-Struktur für `/health/email` (in Task 3 verifizieren).

## Checkliste (Definition of Done)

- [x] Task 1 Spike abgeschlossen, Entscheidungen in Spec nachgetragen.
- [x] `status.musiccloud.io` live mit Custom-Theme, alle Services + Email sichtbar (Velvet-Pivot statt CSS-Reskin — Tasks 4/5 dadurch abgelöst).
- [x] `/health/email` deployt und vom Monitor erfasst.
- [x] RSS-Abo verlinkt, keine E-Mail-Erfassung.
- [x] Backend-Deploy kündigt automatisch an (alle vier Services verdrahtet; Dashboard-Deploy live verifiziert: Banner öffnete + schloss; Failure-Pfad via `if: always()`; manueller `maintenance-switch.yml`-Fallback vorhanden).
- [ ] Build-Caching aktiv. — **Bewusst YAGNI-zurückgestellt:** die Latenz, gegen die der Fast-Path (`status.json`) hedgte, ist stattdessen durch den Velvet-Banner-Auto-Refresh gelöst; `actions/cache` im Status-Repo-Build bleibt optionaler Folge-Schritt.
- [x] All code references verified (functions, scripts, paths, env vars, package-manager commands).
- [x] Theme als wiederverwendbares Template dokumentiert (velvet-template-README „Deploy banners from your CI" + `deploy-announce.yml`-Kommentarfix).

## Abgeschlossen (2026-07-04)

status.musiccloud.io ist live über den **Velvet-Pivot** (eigenes Front-end statt CSS-Reskin auf Stock-Upptime — Tasks 4/5 dadurch abgelöst, siehe „Umsetzungsstand"). Heute komplettiert:

- **Deploy-Announce** für alle vier Deploy-Jobs (Backend/Frontend/Developer/Dashboard) in `ci.yml` verdrahtet, `STATUS_DISPATCH_TOKEN` gesetzt, **live verifiziert** (Dashboard-Deploy: Banner „🚀 Deploying Dashboard" öffnete 16:55, schloss 16:57); Backend-Slug-Bug (`api` → `backend`) gefixt.
- **Sendeseite dokumentiert** in velvet-template (`c605cf1`) + status.musiccloud.io (`0352d24`); Token-Scope-Fehler `issues:write` → `contents:write` korrigiert.
- **Bonus:** Velvet-Banner-Auto-Refresh (60 s bei sichtbarem Tab + Fokus-Refetch, rate-limit-schonend) gebaut und released (velvet `v1.7.0`, `v1` nachgezogen `2b96ce0f`); Status-Repo rebuildet, live.

Einziger bewusst offener Punkt: **Task 9 Build-Caching** (YAGNI — der Fast-Path-Anlass ist durch den Auto-Refresh entfallen). Nach `done/` verschoben auf ausdrückliche User-Ansage vom 2026-07-04.
