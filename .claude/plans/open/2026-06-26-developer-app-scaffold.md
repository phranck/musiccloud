# Developer-Site App-Gerüst und Deploy Implementation Plan

Plan-Nr.: MC-061

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Eine deploybare Astro-SSR-App `apps/developer` auf `developer.musiccloud.io` mit Landing-Page im musiccloud-Night-Mode-Design, lokalem Dev-Runner und CI/Deploy-Pipeline.

**Architecture:** Neue Workspace-App `apps/developer`, aufgebaut nach dem Vorbild von `apps/frontend` (Astro 5 SSR via `@astrojs/node` standalone, Tailwind 4, React-Islands optional). Eigenes schlankes Design-System mit dem Night-Mode-Gradient der Hauptseite als reinem CSS-Hintergrund (kein WebGL-Sternenhimmel, keine Backend-Design-Token-Abhängigkeit). 4. Zerops-Service `developer` (nodejs@22, Port 3002), in CI per Change-Detection deploybar.

**Tech Stack:** Astro 5.17.3, `@astrojs/node` 9.5.5, Tailwind 4 (`@tailwindcss/vite`), `@musiccloud/shared`, pnpm 10.33.1, Zerops (alpine/nodejs@22).

**Verwandt:** [Spec](../../../docs/superpowers/specs/2026-06-26-developer-site-design.md) · Folge-Pläne (SP1): E-Mail-Provider-Abstraktion, Account-Backend, GitHub-OAuth, Frontend-Auth.

---

## Geltungsbereich

Dieser Plan baut **nur** das App-Gerüst und die Deploy-Pipeline. Bewusst **nicht** enthalten (eigene Folge-Pläne):

- E-Mail-Provider-Abstraktion (Brevo → SMTP2GO)
- `developer_accounts`-Datenmodell und Backend-Auth-Routen
- GitHub-OAuth
- Auth-Seiten und eingeloggtes Dashboard
- BFF-Client (kommt mit dem Account-Backend, YAGNI hier)

Ergebnis dieses Plans: Eine Landing-Page, die lokal über den `./app`-Runner läuft, baut, lintet und als Zerops-Service deploybar ist.

## Dateistruktur

Neu unter `apps/developer/`:

| Datei | Verantwortung |
|----|----|
| `package.json` | Workspace-Manifest `@musiccloud/developer`, Astro-Deps, Scripts |
| `astro.config.mjs` | SSR-Config (node standalone, Tailwind, Port 3001) |
| `tsconfig.json` | Astro-strict + `@/*`-Alias |
| `src/styles/global.css` | Schlankes Design-System (`@theme`: Night-Mode-Gradient, Brand-Blau/Gold, Text, Surfaces) |
| `src/styles/fonts.css` | Barlow + Roboto Condensed (fontsource) |
| `src/components/DeveloperBackground.astro` | Reiner CSS-Gradient-Hintergrund (`#0b1318` → `#10273b`) |
| `src/layouts/BaseLayout.astro` | HTML-Grundgerüst, CSS-Imports, Hintergrund, `<slot/>` |
| `src/pages/index.astro` | Landing-Page |
| `.env.local` | Lokale Dev-Env (gitignored), `PORT=3001`, `BACKEND_URL` |

Geändert (Repo-Root):

| Datei | Änderung |
|----|----|
| `zerops.yml` | `developer`-Service-Block ergänzen |
| `.github/workflows/ci.yml` | `developer` in Change-Detection + `deploy-developer`-Job |
| `app.config` | `developer`-Eintrag in die Parallel-Arrays |
| `package.json` (root) | `dev:developer`-Script, `dev:all` erweitern |

---

## Task 1: App-Manifest und Astro-Config

**Files:**
- Create: `apps/developer/package.json`
- Create: `apps/developer/astro.config.mjs`
- Create: `apps/developer/tsconfig.json`

- [x] **Step 1: package.json anlegen**

```json
{
  "name": "@musiccloud/developer",
  "type": "module",
  "version": "0.1.0",
  "private": true,
  "scripts": {
    "check": "astro check",
    "dev": "node --env-file=.env.local ./node_modules/astro/astro.js dev",
    "build": "astro build",
    "preview": "astro preview",
    "start": "node ./dist/server/entry.mjs",
    "typecheck": "astro check",
    "test": "vitest",
    "test:run": "vitest run"
  },
  "dependencies": {
    "@astrojs/node": "9.5.5",
    "@astrojs/react": "^4.4.2",
    "@fontsource/barlow": "^5.2.8",
    "@fontsource/roboto-condensed": "^5.2.8",
    "@musiccloud/shared": "workspace:*",
    "@phosphor-icons/react": "^2.1.10",
    "astro": "5.17.3",
    "clsx": "^2.1.1",
    "react": "^19.2.4",
    "react-dom": "^19.2.4",
    "tailwind-merge": "^3.5.0"
  },
  "devDependencies": {
    "@astrojs/check": "0.9.9",
    "@tailwindcss/vite": "^4.2.1",
    "@types/react": "^19.2.14",
    "@types/react-dom": "^19.2.3",
    "@vitejs/plugin-react": "^6.0.1",
    "jsdom": "^29.1.1",
    "tailwindcss": "^4.2.1",
    "typescript": "^5.9.3",
    "vitest": "^4.1.5"
  }
}
```

Anmerkung: kein `@astrojs/sitemap` (eine Doku-/App-Subdomain braucht keine öffentliche Sitemap im ersten Wurf), kein GSAP/FontAwesome (YAGNI). React bleibt drin für spätere Auth-Islands.

- [x] **Step 2: astro.config.mjs anlegen**

```javascript
import node from "@astrojs/node";
import react from "@astrojs/react";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "astro/config";

export default defineConfig({
  output: "server",
  adapter: node({ mode: "standalone" }),
  integrations: [react()],
  prefetch: { prefetchAll: true, defaultStrategy: "hover" },
  server: {
    port: Number(process.env.PORT) || 3002,
  },
  vite: {
    plugins: [tailwindcss()],
    server: {
      allowedHosts: ["localhost", "developer.musiccloud.test"],
    },
  },
  site: "https://developer.musiccloud.io",
});
```

- [x] **Step 3: tsconfig.json anlegen**

```json
{
  "extends": "astro/tsconfigs/strict",
  "compilerOptions": {
    "jsx": "react-jsx",
    "jsxImportSource": "react",
    "baseUrl": ".",
    "paths": {
      "@/*": ["src/*"]
    }
  }
}
```

- [x] **Step 4: Install und Sanity-Check**

Run: `pnpm install`
Expected: lockfile aktualisiert, `apps/developer/node_modules` vorhanden, kein `EUNSUPPORTEDPROTOCOL` (workspace:*-Refs nur unter pnpm).

- [x] **Step 5: Commit**

```bash
git add apps/developer/package.json apps/developer/astro.config.mjs apps/developer/tsconfig.json pnpm-lock.yaml
git commit -m "Chore: scaffold @musiccloud/developer Astro app manifest"
```

Anmerkung: `@phosphor-icons/react`, `clsx`, `tailwind-merge` aus dem Plan-Manifest entfernt — der React-Doctor-Pre-Commit-Hook flaggte sie als `deslop/unused-dependency` (kein Verbraucher in Task 1-4, Landing ist reines Astro). Kommen mit dem Auth-Islands-Folge-Plan zurück, sobald sie tatsächlich importiert werden (YAGNI).

---

## Task 2: Design-System (Tailwind-4-Tokens + Fonts)

**Files:**
- Create: `apps/developer/src/styles/global.css`
- Create: `apps/developer/src/styles/fonts.css`

Schlankes, eigenständiges Design-System — nur was die Developer-Site braucht (Night-Mode-Gradient, Brand, Text, Surfaces, Status). Kein VFD/CD/Day-Night-Cross-Fade aus dem Frontend.

- [x] **Step 1: global.css anlegen**

```css
@import "tailwindcss";

/* musiccloud Developer — Night-Mode design system.
   Background is the static night-sky gradient of the main site
   (apps/frontend/src/components/background/nightSky/settings.ts: skyTop/skyBottom),
   rendered as a plain vertical CSS gradient — no stars, no clouds. */
@theme {
  /* Night-mode sky gradient (zenith -> horizon) */
  --color-sky-top: #0b1318;
  --color-sky-bottom: #10273b;

  /* Surfaces (glassy, over the gradient) */
  --color-surface: rgba(255, 255, 255, 0.045);
  --color-surface-strong: rgba(255, 255, 255, 0.07);
  --color-border: rgba(255, 255, 255, 0.09);
  --color-border-strong: rgba(255, 255, 255, 0.16);

  /* Brand */
  --color-accent: #28a8d8;
  --color-accent-hover: #45bfe8;
  --color-accent-contrast: #04222e;
  --color-gold: #d4a843;

  /* Text */
  --color-text-primary: #ececf1;
  --color-text-secondary: #9fb0bc;
  --color-text-muted: #67676f;

  /* Status */
  --color-success: #46c98a;
  --color-error: #e8634e;

  /* Code surface */
  --color-code-bg: rgba(0, 0, 0, 0.38);

  /* Typography */
  --font-sans: "Barlow", -apple-system, BlinkMacSystemFont, system-ui, sans-serif;
  --font-condensed: "Roboto Condensed", "Barlow", sans-serif;
  --font-mono: "SF Mono", "Fira Code", ui-monospace, monospace;
}

a {
  text-decoration: none;
  color: inherit;
}

button,
[role="button"] {
  touch-action: manipulation;
}
```

- [x] **Step 2: fonts.css anlegen**

```css
@import "@fontsource/barlow/latin-400.css";
@import "@fontsource/barlow/latin-500.css";
@import "@fontsource/barlow/latin-700.css";
@import "@fontsource/roboto-condensed/latin-400.css";
@import "@fontsource/roboto-condensed/latin-500.css";
```

- [x] **Step 3: Commit**

```bash
git add apps/developer/src/styles/global.css apps/developer/src/styles/fonts.css
git commit -m "Feat: add developer-site design system tokens and fonts"
```

---

## Task 3: Hintergrund und BaseLayout

**Files:**
- Create: `apps/developer/src/components/DeveloperBackground.astro`
- Create: `apps/developer/src/layouts/BaseLayout.astro`

- [x] **Step 1: DeveloperBackground.astro anlegen**

Reiner CSS-Gradient, fixiert hinter dem Inhalt. Kein WebGL, kein Token-Fetch.

```astro
---
/**
 * Static night-mode background for the developer site: a single fixed layer
 * with the main site's night sky gradient (zenith #0b1318 -> horizon #10273b),
 * rendered as a plain vertical CSS gradient. No stars, no clouds, no WebGL.
 */
---

<div
  class="fixed inset-0 -z-10"
  style="background: linear-gradient(180deg, var(--color-sky-top) 0%, var(--color-sky-bottom) 100%);"
  aria-hidden="true"
>
</div>
```

- [x] **Step 2: BaseLayout.astro anlegen**

```astro
---
import "../styles/fonts.css";
import "../styles/global.css";
import DeveloperBackground from "@/components/DeveloperBackground.astro";

interface Props {
  title?: string;
  description?: string;
}

const { title = "musiccloud for developers", description = "Build with the musiccloud API." } = Astro.props;
---

<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>{title}</title>
    <meta name="description" content={description} />
    <link rel="icon" href="/favicon.svg" type="image/svg+xml" />
  </head>
  <body class="min-h-screen text-[var(--color-text-primary)] font-[family-name:var(--font-sans)] antialiased">
    <DeveloperBackground />
    <slot />
  </body>
</html>
```

- [x] **Step 3: Platzhalter-Favicon anlegen**

Create: `apps/developer/public/favicon.svg`

```svg
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><rect width="32" height="32" rx="7" fill="#0b1318"/><path d="M9 21c0-3.3 2.7-6 6-6 1 0 2 .3 2.8.8A5 5 0 0 1 27 18.5 4.5 4.5 0 0 1 22.5 23H10a1 1 0 0 1-1-1z" fill="#28a8d8"/></svg>
```

- [x] **Step 4: Commit**

```bash
git add apps/developer/src/components/DeveloperBackground.astro apps/developer/src/layouts/BaseLayout.astro apps/developer/public/favicon.svg
git commit -m "Feat: add developer-site base layout and gradient background"
```

---

## Task 4: Landing-Page

**Files:**
- Create: `apps/developer/src/pages/index.astro`

- [x] **Step 1: index.astro anlegen**

Statische Landing nach dem abgenommenen Mockup (Logo-Nav, Hero, Code-Teaser, Feature-Karten). Noch keine funktionalen Auth-Buttons (kommen mit dem Frontend-Auth-Plan); Links sind Platzhalter.

```astro
---
import BaseLayout from "@/layouts/BaseLayout.astro";

const features = [
  { title: "Link resolve", body: "One link in, every platform out." },
  { title: "Artist info", body: "Top tracks, similar artists, events." },
  { title: "Creative Commons", body: "Free-to-use catalogue access." },
];
---

<BaseLayout>
  <header class="flex items-center justify-between px-6 py-4 max-w-5xl mx-auto w-full">
    <div class="flex items-center gap-2 text-[15px] font-medium">
      <svg width="20" height="20" viewBox="0 0 32 32" aria-hidden="true"
        ><path
          d="M9 21c0-3.3 2.7-6 6-6 1 0 2 .3 2.8.8A5 5 0 0 1 27 18.5 4.5 4.5 0 0 1 22.5 23H10a1 1 0 0 1-1-1z"
          fill="var(--color-accent)"></path></svg
      >
      musiccloud <span class="text-[var(--color-text-muted)] font-normal">/ developers</span>
    </div>
    <nav class="flex items-center gap-4 text-[13px] text-[var(--color-text-secondary)]">
      <a href="/docs">Docs</a>
      <a href="/login">Log in</a>
      <a
        href="/signup"
        class="rounded-lg bg-[var(--color-accent)] text-[var(--color-accent-contrast)] px-3 py-1.5 font-medium"
        >Sign up</a
      >
    </nav>
  </header>

  <main class="max-w-5xl mx-auto w-full px-6 pt-12 pb-20">
    <h1 class="text-4xl font-medium tracking-tight leading-tight mb-3">Build with the musiccloud API</h1>
    <p class="text-[var(--color-text-secondary)] max-w-md mb-6">
      Resolve any music link, fetch artist info, and explore Creative Commons tracks — one REST API, one key.
    </p>
    <div class="flex gap-3 mb-10">
      <a
        href="/signup"
        class="rounded-lg bg-[var(--color-accent)] text-[var(--color-accent-contrast)] px-4 py-2 text-sm font-medium"
        >Get an API key</a
      >
      <a
        href="/docs"
        class="rounded-lg border border-[var(--color-border-strong)] px-4 py-2 text-sm font-medium"
        >Read the docs</a
      >
    </div>

    <pre
      class="rounded-xl border border-[var(--color-border)] bg-[var(--color-code-bg)] p-4 text-xs font-[family-name:var(--font-mono)] text-[#c2d2dc] overflow-x-auto mb-8"><code><span class="text-[var(--color-text-muted)]"># Resolve a Spotify link to every platform</span>
<span class="text-[var(--color-accent)]">curl</span> https://api.musiccloud.io/api/v1/resolve \
  -H <span class="text-[var(--color-gold)]">"X-API-Key: mc_live_…"</span> -d <span class="text-[var(--color-gold)]">{`'{"url":"…"}'`}</span></code></pre>

    <section class="grid grid-cols-1 sm:grid-cols-3 gap-3">
      {
        features.map((f) => (
          <article class="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-4">
            <h2 class="text-sm font-medium mb-1">{f.title}</h2>
            <p class="text-xs text-[var(--color-text-secondary)]">{f.body}</p>
          </article>
        ))
      }
    </section>
  </main>
</BaseLayout>
```

- [x] **Step 2: Build verifizieren**

Run: `pnpm --filter @musiccloud/developer build`
Expected: erfolgreich, erzeugt `apps/developer/dist/server/entry.mjs` und `apps/developer/dist/client/`.

Anmerkung: Das wörtliche `'{"url":"…"}'` im `<pre>`-Block musste als Astro-Expression `{`'{"url":"…"}'`}` escaped werden — die nackten `{`/`}` interpretiert der Astro-Compiler sonst als JSX-Expression-Delimiter und der esbuild-Parse failt mit `Expected "}" but found ":"`. Sichtbarer Output unverändert.

- [x] **Step 3: SSR-Smoke lokal**

Run: `cd apps/developer && PORT=3002 node ./dist/server/entry.mjs &` dann `curl -s http://localhost:3002/ | grep -c "Build with the musiccloud API"`
Expected: `1` (Hero-Headline im SSR-HTML vorhanden). Danach den Prozess beenden.

Anmerkung: liefert `2` statt `1`, weil derselbe Satz zusätzlich als Default-`description` im `<meta>` (aus `BaseLayout.astro`) rendert. Beide Treffer korrekt, Hero-Headline ist serverseitig vorhanden — Smoke inhaltlich bestanden.

- [x] **Step 4: Commit**

```bash
git add apps/developer/src/pages/index.astro
git commit -m "Feat: add developer-site landing page"
```

---

## Task 5: Lokaler Dev-Runner und Root-Scripts

**Files:**
- Modify: `app.config`
- Modify: `package.json` (root)
- Create: `apps/developer/.env.local`

- [x] **Step 1: Root-Script `dev:developer` ergänzen**

In `package.json` (root) bei den `dev:*`-Scripts ergänzen:

```json
"dev:developer": "pnpm --filter @musiccloud/developer dev",
```

Und `dev:all` um `developer` erweitern (Name-Liste, Farbe, Befehl), z. B.:

```json
"dev:all": "concurrently -k -n dashboard-ui,shared,backend,frontend,developer,dashboard -c blue,gray,magenta,cyan,green,yellow \"pnpm dev:dashboard-ui\" \"pnpm dev:shared\" \"pnpm dev:backend\" \"pnpm dev\" \"pnpm dev:developer\" \"pnpm dev:dashboard\"",
```

- [x] **Step 2: app.config ergänzen**

Die Parallel-Arrays in `app.config` synchron erweitern (Index-Gleichheit ist Pflicht):

```bash
APP_NAMES=(shared backend frontend developer dashboard)
APP_PORTS=(- 4000 3001 3002 4500)
APP_CMDS=(
  "pnpm dev:shared"
  "pnpm dev:backend"
  "pnpm dev"
  "pnpm dev:developer"
  "pnpm dev:dashboard"
)
```

Anmerkung: lokale Ports — Backend 4000, Frontend 3001, Developer 3002, Dashboard 4500 (alle kollisionsfrei). Die echte `app.config` listet heute `APP_PORTS=(- 4000 3001 4500)`; nur den `developer`-Eintrag (Port 3002) an Index 3 einfügen, die Frontend-3001-Position nicht verändern.

- [x] **Step 3: .env.local anlegen**

```
PORT=3002
BACKEND_URL=http://localhost:4000
INTERNAL_API_KEY=dev-internal-key-change-in-production
```

Verifizieren, dass `apps/developer/.env.local` gitignored ist:
Run: `git check-ignore apps/developer/.env.local`
Expected: gibt den Pfad zurück (= ignoriert).

- [x] **Step 4: Runner-Smoke**

Run: `./app start developer && sleep 4 && ./app status`
Expected: `developer` als running gelistet, Port 3002. Run: `curl -s http://localhost:3002/ | grep -c "musiccloud"` → `>=1`. Danach `./app stop developer`.

- [x] **Step 5: Commit**

```bash
git add package.json app.config
git commit -m "Chore: wire developer app into local dev runner and root scripts"
```

---

## Task 6: Zerops-Service-Block

**Files:**
- Modify: `zerops.yml`

- [x] **Step 1: `developer`-Service-Block ergänzen**

Nach dem `frontend`-Block einfügen (Vorlage = `frontend`-Block, angepasst auf `developer`, Port 3002):

```yaml
  - setup: developer
    build:
      base: alpine/nodejs@22
      buildCommands:
        - corepack enable
        - corepack prepare pnpm@10.33.1 --activate
        - pnpm install --frozen-lockfile
        - pnpm --filter @musiccloud/shared build
        - pnpm --filter @musiccloud/developer build
      deployFiles:
        - apps/developer/dist
        - apps/developer/node_modules
        - apps/developer/package.json
        - node_modules
        - packages/shared
        - package.json
    run:
      base: alpine/nodejs@22
      ports:
        - port: 3002
          httpSupport: true
      envVariables:
        HOST: "::"
        PORT: "3002"
        BACKEND_URL: http://backend:4000
        # Set in Zerops Secrets (later sub-projects):
        # INTERNAL_API_KEY: <same key as backend>
      start: node apps/developer/dist/server/entry.mjs
```

- [x] **Step 2: YAML-Validität prüfen**

Run: `python3 -c "import yaml,sys; yaml.safe_load(open('zerops.yml')); print('ok')"`
Expected: `ok` (gültiges YAML, vier `setup`-Blöcke).

- [x] **Step 3: Commit**

```bash
git add zerops.yml
git commit -m "Chore: add developer Zerops service (nodejs@22, port 3001)"
```

---

## Task 7: CI Change-Detection und Deploy-Job

**Files:**
- Modify: `.github/workflows/ci.yml`

Voraussetzung: Der Zerops-`developer`-Service ist in der Zerops-UI angelegt (durch den Betreiber); die `serviceId` wird vor dem Edit aus Zerops abgelesen und unten eingesetzt.

- [ ] **Step 1: Change-Detection um `developer` erweitern**

Im `detect-changes`-Job: zu `outputs:` ergänzen:

```yaml
    developer: ${{ steps.filter.outputs.developer }}
```

Im Filter-Skript die Init-Zeile `developer=false` zu den anderen `*=false`-Flags hinzufügen, einen Case-Block ergänzen, und `developer` in den `$GITHUB_OUTPUT`-Block schreiben:

```bash
        developer=false
        # ... innerhalb der for-Schleife:
          case "$file" in
            apps/developer/*|packages/shared/*|package.json|pnpm-lock.yaml|pnpm-workspace.yaml|zerops.yml)
              developer=true ;;
          esac
        # ... im Output-Block:
          echo "developer=$developer"
```

- [ ] **Step 2: `deploy-developer`-Job ergänzen**

Nach `deploy-frontend` einfügen (Vorlage = ein bestehender Deploy-Job; `<DEVELOPER_SERVICE_ID>` durch die echte Zerops-serviceId ersetzen):

```yaml
  deploy-developer:
    name: Deploy Developer
    runs-on: ubuntu-latest
    needs: detect-changes
    if: needs.detect-changes.outputs.developer == 'true'
    steps:
      - uses: actions/checkout@v5
      - name: Install Zerops CLI
        run: |
          curl -fsSL https://github.com/zeropsio/zcli/releases/latest/download/zcli-linux-amd64 -o /usr/local/bin/zcli
          chmod +x /usr/local/bin/zcli
      - name: Deploy and wait
        env:
          ZEROPS_TOKEN: ${{ secrets.ZEROPS_TOKEN }}
        run: |
          zcli login "$ZEROPS_TOKEN"
          zcli push --serviceId <DEVELOPER_SERVICE_ID>
```

- [ ] **Step 3: Offene Referenz markieren, falls serviceId fehlt**

Falls die `serviceId` zum Implementierungszeitpunkt noch nicht vorliegt: den Deploy-Job mit einem klaren `# TODO serviceId` einfügen, aber **stoppen und den Betreiber nach der serviceId fragen**, bevor der Job aktiv mergt — ein Push mit Platzhalter-ID failt die Pipeline.

- [ ] **Step 4: Commit**

```bash
git add .github/workflows/ci.yml
git commit -m "Chore: add developer app to CI change-detection and deploy"
```

---

## Tests und Gates

Vor Abschluss alle Gates grün:

- `pnpm --filter @musiccloud/developer build` — Astro-SSR-Build erfolgreich.
- SSR-Smoke: `node apps/developer/dist/server/entry.mjs` + `curl` liefert die Landing.
- `pnpm --filter @musiccloud/developer typecheck` (`astro check`) — keine Typfehler.
- `pnpm lint` — Repo-weit grün (Biome).
- `pnpm --filter @musiccloud/shared build` läuft (Developer-App konsumiert `@musiccloud/shared`).
- Lokaler `./app start developer` rendert die Landing auf Port 3002.
- `zerops.yml` ist valides YAML mit vier Services.
- React Doctor: nur falls React-Islands hinzukamen (in diesem Plan keine — Landing ist reines Astro). Sonst überspringen.

## Verifizierte Fakten (2026-06-26)

Alle Referenzen gegen den aktuellen Code geprüft (paralleler Pattern-Audit):

- **Astro-Vorlage** `apps/frontend`: Astro `5.17.3`, `@astrojs/node` `9.5.5` (`mode: "standalone"`), Tailwind 4 via `@tailwindcss/vite`, `output: "server"`, Start `node ./dist/server/entry.mjs`. `tsconfig` extends `astro/tsconfigs/strict` mit `@/*`-Alias. `package.json`-Scripts (`dev` mit `--env-file=.env.local`, `build`, `start`) verifiziert.
- **Design-Tokens** der Hauptseite: `@import "tailwindcss"` + `@theme {}`-Block in `apps/frontend/src/styles/global.css`; Brand-Blau `#28A8D8`, Gold `#D4A843`. Night-Mode-Gradient `skyTop #0b1318` / `skyBottom #10273b` aus `apps/frontend/src/components/background/nightSky/settings.ts:162-163`.
- **zerops.yml**: drei Services (`backend`/`frontend`/`dashboard`), `frontend`-Block (`alpine/nodejs@22`, Port 3000, `HOST: "::"`, `deployFiles`-Liste, `start`) ist die exakte Vorlage. Service-IDs: backend `vftiwXaYQGCnnwEEaiGPYA`, frontend `bMY4g66BRDOfq1AAi8Q85A`, dashboard `IF9Xp4YFRxuQKRQxmAWFBA` — die `developer`-ID liegt erst nach Anlage in Zerops vor.
- **CI** `.github/workflows/ci.yml`: `detect-changes`-Job mit per-App-Case-Blöcken + `outputs`, Deploy-Jobs `if: needs.detect-changes.outputs.<app> == 'true'`, `zcli push --serviceId <id>`, `ZEROPS_TOKEN`-Secret. Node-Version `22`.
- **Lokaler Runner**: `app.config` mit Parallel-Arrays `APP_NAMES`/`APP_PORTS`/`APP_CMDS` (`APP_PORTS=(- 4000 3001 4500)`); Root-`package.json` `dev:*`-Scripts und `dev:all` via `concurrently`. Frontend lokal Port **3001** (Prod 3000), Developer daher **3002** (lokal kollisionsfrei).
- **Shared**: `@musiccloud/shared` (`workspace:*`), build via `tsc`, Import `import { ENDPOINTS } from "@musiccloud/shared"`.
- **pnpm** ist Pflicht-PM (`pnpm@10.33.1`); `npm install` crasht an `workspace:`-Refs.
- [ ] Alle Code-Referenzen erneut verifiziert (Pfade, Scripts, Service-IDs, Ports) vor dem ersten Edit.

## Checkliste

- [x] Task 1: App-Manifest + Astro-Config + tsconfig, `pnpm install` grün
- [x] Task 2: Design-System (global.css `@theme`, fonts.css)
- [x] Task 3: DeveloperBackground (CSS-Gradient) + BaseLayout + favicon
- [x] Task 4: Landing-Page, Build + SSR-Smoke grün
- [x] Task 5: Lokaler Runner (`app.config`, Root-Scripts, `.env.local`), Runner-Smoke grün
- [x] Task 6: `zerops.yml` `developer`-Block, YAML valide
- [ ] Task 7: CI Change-Detection + Deploy-Job (serviceId vom Betreiber)
- [ ] Alle Gates grün (build, typecheck, `pnpm lint`, SSR-Smoke)
- [ ] Plan nach `done/` verschoben, `WHATS-NEXT.md` aktualisiert
