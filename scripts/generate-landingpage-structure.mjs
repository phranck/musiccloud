#!/usr/bin/env node

import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const outputPath = path.join(root, "docs", "landingpage-structure.html");

const sourceFiles = [
  {
    key: "entry",
    label: "Astro Entry",
    path: "apps/frontend/src/pages/index.astro",
    checks: [
      ["BaseLayout shell", /<BaseLayout[\s\S]*?title=/],
      ["SEO/OG/JSON-LD head", /<Fragment slot="head">[\s\S]*?application\/ld\+json/],
      ["Locale cookie", /getLocaleFromCookie\(Astro\.cookies\.get\("mc:locale"\)\?\.value\)/],
      ["Header/Footer nav preload", /loadNav\(locale\)/],
      ["Pre-hydration share redirect", /new URLSearchParams\(location\.search\)\.get\("share"\)/],
      ["Static background", /<GradientBackground\s*\/>/],
      ["Landing React island", /<LandingPage client:idle/],
      ["Overlay island", /<PageOverlayIsland client:load initialPage=\{null\}/],
      ["No-JS fallback", /<noscript>/],
    ],
  },
  {
    key: "baseLayout",
    label: "Base Layout",
    path: "apps/frontend/src/layouts/BaseLayout.astro",
    checks: [
      ["Global font CSS", /import "\.\.\/styles\/fonts\.css"/],
      ["Global app CSS", /import "\.\.\/styles\/global\.css"/],
      ["Viewport meta", /name="viewport"/],
      ["Head slot", /<slot name="head" \/>/],
      ["Body slot", /<slot \/>/],
      ["Optional Umami tracking", /trackingEnabled && <script/],
    ],
  },
  {
    key: "background",
    label: "Static Background",
    path: "apps/frontend/src/components/background/GradientBackground.astro",
    checks: [
      ["Fixed background layer", /fixed inset-0 -z-10/],
      ["Radial gradients", /radial-gradient/],
      ["Hidden from accessibility", /aria-hidden="true"/],
      ["No runtime animation note", /no runtime animation/],
    ],
  },
  {
    key: "landing",
    label: "React Landing",
    path: "apps/frontend/src/components/LandingPage.tsx",
    checks: [
      ["PageHeader mounted", /<PageHeader navItems=\{headerNav\}/],
      ["HeroInput mounted", /<HeroInput[\s\S]*?onSubmit=\{handleSubmit\}/],
      ["AppFooter mounted", /<AppFooter navItems=\{footerNav\}/],
      ["ErrorBoundary", /<ErrorBoundary>/],
      ["LocaleProvider", /<LocaleProvider>/],
      ["useAppState state machine", /useAppState\(\)/],
      ["Lazy ShareLayout", /lazy\(loadShareLayout\)/],
      ["Lazy DisambiguationPanel", /lazy\(loadDisambiguationPanel\)/],
      ["Lazy GenreBrowseGrid", /lazy\(loadGenreBrowseGrid\)/],
      ["Lazy GenreSearchResults", /lazy\(loadGenreSearchResults\)/],
      ["Example teaser fetch", /ENDPOINTS\.frontend\.randomExample/],
      ["Toast", /lazy\(loadToast\)/],
    ],
  },
  {
    key: "heroInput",
    label: "Hero Input",
    path: "apps/frontend/src/components/input/HeroInput.tsx",
    checks: [
      ["Controlled input", /value=\{displayValue\}/],
      ["Paste auto-submit", /handlePaste[\s\S]*?autoSubmitTimer/],
      ["Music URL detection", /isMusicUrl\(pastedText\)/],
      ["Clear button", /aria-label="Clear search"/],
      ["Search button", /aria-label=\{state === "loading" \? "Searching\.\.\." : "Search"\}/],
      ["Error message", /role="alert"/],
    ],
  },
  {
    key: "header",
    label: "Top Right Header",
    path: "apps/frontend/src/components/layout/PageHeader.tsx",
    checks: [
      ["Fixed top-right", /fixed top-4 right-4/],
      ["Desktop only", /hidden sm:flex/],
      ["Admin nav items", /navItems\.map\(\(item\)/],
      ["LanguageSwitcher", /<LanguageSwitcher\s*\/>/],
      ["Overlay click intercept", /OVERLAY_OPEN_EVENT/],
      ["Safe href helper", /navHref\(item\)/],
    ],
  },
  {
    key: "language",
    label: "Language Switcher",
    path: "apps/frontend/src/components/navigation/LanguageSwitcher.tsx",
    checks: [
      ["Locale context", /useLocale\(\)/],
      ["Current flag button", /current\.flag/],
      ["Dropdown", /isOpen &&/],
      ["All locales mapped", /LOCALES\.map\(\(code\)/],
      ["Persist via setLocale", /setLocale\(code\)/],
    ],
  },
  {
    key: "state",
    label: "State Machine",
    path: "apps/frontend/src/hooks/useAppState.ts",
    checks: [
      ["Reducer-backed state", /useReducer\(appReducer, initialState\)/],
      ["Resolve submit", /handleSubmit[\s\S]*?ENDPOINTS\.frontend\.resolve/],
      ["Disambiguation branch", /status === "disambiguation"/],
      ["Genre browse branch", /status === "genre-browse"/],
      ["Genre search branch", /status === "genre-search"/],
      ["Result branch", /RESOLVE_SUCCESS/],
      ["Clear", /CLEAR_START/],
      ["Internal back", /NAV_BACK/],
    ],
  },
  {
    key: "footer",
    label: "Footer",
    path: "apps/frontend/src/components/layout/AppFooter.tsx",
    checks: [
      ["Copyright", /&copy;/],
      ["Admin footer nav", /navItems\.map\(\(item\)/],
      ["LAYERED link", /https:\/\/layered\.work/],
      ["Localized made by", /t\("footer\.madeBy"\)/],
    ],
  },
  {
    key: "overlayContext",
    label: "Overlay Provider",
    path: "apps/frontend/src/context/OverlayContext.tsx",
    checks: [
      ["Overlay event", /OVERLAY_OPEN_EVENT = "mc:overlay-open"/],
      ["Presence flag", /__mcOverlayActive/],
      ["Content fetch", /fetch\(`\/api\/v1\/content\/\$\{slug\}`/],
      ["History push", /window\.history\.pushState/],
      ["Fallback navigation", /window\.location\.href = `\/\$\{detail\.slug\}`/],
    ],
  },
  {
    key: "overlayIsland",
    label: "Overlay Island",
    path: "apps/frontend/src/components/layout/PageOverlayIsland.tsx",
    checks: [
      ["PageOverlayIsland", /export function PageOverlayIsland/],
      ["LocaleProvider", /<LocaleProvider>/],
      ["OverlayProvider", /<OverlayProvider>/],
      ["Backdrop", /<OverlayBackdrop/],
      ["Draggable frame", /function OverlayFrame/],
      ["Persisted geometry", /mc:overlay-geom:/],
      ["Translucent content", /TranslucentOverlayContent/],
      ["Embossed content", /EmbossedOverlayContent/],
    ],
  },
];

const detailSections = [
  {
    id: "document",
    title: "Browser / Document",
    sourceKeys: ["entry", "baseLayout"],
    body:
      "Die äußerste Ebene steht für das gerenderte Dokument der Route /. Darin liegt die Astro-Hülle mit Head, Body, React-Islands und Fallbacks.",
    facts: [
      "index.astro ist die konkrete Route.",
      "BaseLayout liefert die gemeinsame HTML-Hülle.",
      "Die interaktive App wird als React-Island in dieses Dokument gesetzt.",
    ],
  },
  {
    id: "astro-shell",
    title: "Astro Page Shell",
    sourceKeys: ["entry", "baseLayout"],
    body:
      "Die Astro-Schicht baut die Route / auf. Sie setzt Meta-Daten, liest die Locale aus dem Cookie, lädt Header- und Footer-Navigation serverseitig und rendert die sichtbaren Hauptinseln.",
    facts: [
      "BaseLayout stellt HTML, globale Styles, Favicons und optionales Tracking.",
      "loadNav(locale) lädt Header- und Footer-Navigation vor der React-Hydration.",
      "Der ?share= Redirect läuft als Inline-Script vor React.",
    ],
  },
  {
    id: "head",
    title: "Head / Metadata",
    sourceKeys: ["entry", "baseLayout"],
    body:
      "Der Head-Bereich kommt aus BaseLayout plus dem head-Slot der Landingpage. Hier liegen Titel, Description, Canonical, OpenGraph, Twitter-Meta, JSON-LD, Icons und optional Tracking.",
    facts: [
      "BaseLayout setzt Standard-Meta, Manifest und Favicons.",
      "index.astro ergänzt Landingpage-spezifische SEO- und Social-Meta.",
      "Umami wird nur eingebunden, wenn Tracking aktiv ist.",
    ],
  },
  {
    id: "body",
    title: "Body / Page Surface",
    sourceKeys: ["entry", "baseLayout"],
    body:
      "Der Body enthält die sichtbare Seite: Hintergrund, React-Landingpage, Overlay-Island und No-JS-Fallback.",
    facts: [
      "body bekommt globale Background- und Textklassen.",
      "GradientBackground liegt als fixed Layer hinter allem.",
      "LandingPage und PageOverlayIsland werden als getrennte Islands gemountet.",
    ],
  },
  {
    id: "background",
    title: "Static Background",
    sourceKeys: ["entry", "background"],
    body:
      "Der Hintergrund ist bewusst kein React-State und keine Animation. GradientBackground wird statisch gerendert und liegt fixed hinter der App.",
    facts: ["Kein JavaScript.", "Keine Hydration.", "Dient nur als visuelle Ambient-Fläche."],
  },
  {
    id: "react-island",
    title: "LandingPage React Island",
    sourceKeys: ["entry", "landing"],
    body:
      "LandingPage ist das interaktive Zentrum der Root-Seite. Sie wird client:idle geladen und kapselt Provider, Header, Main-Area, Toast und Footer.",
    facts: [
      "LandingPageInner hält UI-State und Input-Wert.",
      "Panels und ShareLayout werden lazy geladen.",
      "Das Layout schaltet zwischen großer Landing-Ansicht und kompakter Result-Ansicht.",
    ],
  },
  {
    id: "providers",
    title: "React Providers",
    sourceKeys: ["landing"],
    body:
      "LandingPage kapselt den interaktiven Bereich in ErrorBoundary und LocaleProvider. Dadurch laufen Übersetzungen und Fehlerfallbacks innerhalb der React-Island.",
    facts: [
      "ErrorBoundary fängt Renderfehler der Landingpage ab.",
      "LocaleProvider stellt useT/useLocale bereit.",
      "LandingPageInner enthält danach die konkrete UI-Struktur.",
    ],
  },
  {
    id: "page-header",
    title: "Top Right Header",
    sourceKeys: ["header", "language"],
    body:
      "Der sichtbare Bereich aus dem Screenshot ist PageHeader. Er sitzt fixed rechts oben, ist auf Mobile verborgen und enthält dynamische Header-Nav-Items plus LanguageSwitcher.",
    facts: [
      "Info/Help kommen aus Admin-Navigation, nicht aus hardcoded Text im Header.",
      "Overlay-fähige Nav-Items werden clientseitig abgefangen.",
      "LanguageSwitcher zeigt die aktuelle Flagge und öffnet ein Dropdown.",
    ],
  },
  {
    id: "header-nav",
    title: "Admin Header Navigation",
    sourceKeys: ["entry", "header"],
    body:
      "Die sichtbaren Links wie Info und Help werden aus den serverseitig geladenen Header-Nav-Items gerendert.",
    facts: [
      "navItems kommen aus loadNav(locale).",
      "navHref schützt gegen unsichere URLs.",
      "Overlay-fähige Items werden per Event geöffnet.",
    ],
  },
  {
    id: "language-switcher",
    title: "Language Switcher",
    sourceKeys: ["language"],
    body:
      "Der Sprachschalter zeigt die aktuelle Flagge als Button und öffnet ein Dropdown mit den verfügbaren Locales.",
    facts: [
      "Aktuelle Locale kommt aus useLocale().",
      "Die sichtbare Flagge kommt aus LOCALE_META.",
      "setLocale(code) schließt das Dropdown nach Auswahl.",
    ],
  },
  {
    id: "main-area",
    title: "Main Area",
    sourceKeys: ["landing"],
    body:
      "Die Main Area ist der zentrale Arbeitsbereich. Im Idle-Zustand zeigt sie Logo, HeroInput und optional einen Beispiel-Link. Bei Resultaten wechselt sie in die ShareLayout-Ansicht.",
    facts: [
      "LogoView ist groß im Idle-Zustand und kleiner im kompakten Zustand.",
      "HeroInput steuert Paste, Submit, Clear und Loading/Success/Error-Zustände.",
      "ShareResultPlaceholder stabilisiert die Layoutfläche während Lazy Loading.",
    ],
  },
  {
    id: "logo",
    title: "LogoView",
    sourceKeys: ["landing"],
    body:
      "LogoView ist im Idle-Zustand der zentrale visuelle Anker. In kompakten Zuständen wird es kleiner gerendert.",
    facts: [
      "Großes Logo im Idle-Zustand.",
      "Kleineres Logo bei showCompact.",
      "In der Result-Ansicht ist das Logo ein Home-Link.",
    ],
  },
  {
    id: "hero-input",
    title: "HeroInput",
    sourceKeys: ["landing", "heroInput"],
    body:
      "HeroInput ist das primäre Eingabeelement der Landingpage. Es verarbeitet Textsuche, Musiklinks, Paste-Autosubmit, Clear, Loading, Success und Error.",
    facts: [
      "Paste von Musik-URLs wird automatisch nach kurzer Verzögerung submitted.",
      "Enter submitet nicht-leere Eingaben.",
      "Escape/Clear setzen den Suchzustand zurück.",
    ],
  },
  {
    id: "example-teaser",
    title: "Example Teaser",
    sourceKeys: ["landing"],
    body:
      "Der optionale Beispiel-Link wird nur angezeigt, wenn der Random-Example-Endpunkt einen shortId liefert und gerade keine Ergebnis- oder Auswahlansicht aktiv ist.",
    facts: [
      "Fetch an ENDPOINTS.frontend.randomExample.",
      "Fehler werden bewusst verschluckt.",
      "Der Teaser ist nicht kritisch für die App-Funktion.",
    ],
  },
  {
    id: "state-machine",
    title: "Search State Machine",
    sourceKeys: ["state", "landing"],
    body:
      "useAppState verwaltet den Suchfluss. Die Root-Seite bleibt während interner Übergänge auf / und wechselt nur die gerenderte Ansicht.",
    facts: [
      "SUBMIT postet an ENDPOINTS.frontend.resolve.",
      "Mögliche Zielzustände: result, disambiguation, genre-browse, genre-search, error.",
      "NAV_BACK nutzt einen internen Stack, kein Browser-History-Push.",
    ],
  },
  {
    id: "lazy-panels",
    title: "Lazy Panels",
    sourceKeys: ["landing"],
    body:
      "Die schwereren Ergebnis- und Auswahlflächen werden erst geladen, wenn sie wirklich gebraucht werden.",
    facts: [
      "DisambiguationPanel für Mehrfachtreffer.",
      "GenreBrowseGrid für genre:? Einstieg.",
      "GenreSearchResults für Genre-Suchen.",
      "ShareLayout für das aufgelöste Ergebnis.",
    ],
  },
  {
    id: "result-view",
    title: "Result View",
    sourceKeys: ["landing"],
    body:
      "Wenn ein Resolve erfolgreich ist, rendert LandingPage ShareLayout statt der Idle-Landingansicht.",
    facts: [
      "buildShareConfigFromActive bereitet Daten für ShareLayout auf.",
      "ShareLayout wird lazy geladen.",
      "Während der Lazy-Phase hält ShareResultPlaceholder den Platz stabil.",
    ],
  },
  {
    id: "toast",
    title: "Toast",
    sourceKeys: ["landing"],
    body:
      "Toast ist ein lazy geladenes Feedback-Element, das über useToast aus LandingPageInner gesteuert wird.",
    facts: [
      "Wird in Suspense gerendert.",
      "Hat message, variant, visible und onDismiss.",
      "Ist nicht Teil des Suchzustand-Reducers.",
    ],
  },
  {
    id: "footer",
    title: "Footer",
    sourceKeys: ["footer", "landing"],
    body:
      "AppFooter hängt unterhalb der React-Landingpage und nutzt dieselben serverseitig geladenen Nav-Daten wie der Header, nur für die Footer-Position.",
    facts: ["Copyright links.", "Admin Footer Nav mittig.", "made by LAYERED rechts."],
  },
  {
    id: "overlay",
    title: "Content Overlay System",
    sourceKeys: ["header", "overlayContext", "overlayIsland"],
    body:
      "Das Overlay-System ist separat neben der LandingPage montiert. Header-Klicks senden ein Event, OverlayProvider lädt die Content-Seite und PageOverlayIsland rendert einen beweglichen/resizable Frame.",
    facts: [
      "Event: mc:overlay-open.",
      "Fetch: /api/v1/content/{slug}.",
      "Geometrie wird pro Slug in localStorage gespeichert.",
      "Content-Varianten: Embossed oder Translucent.",
    ],
  },
  {
    id: "overlay-provider",
    title: "OverlayProvider",
    sourceKeys: ["overlayContext", "overlayIsland"],
    body:
      "OverlayProvider verwaltet die aktuell geöffnete Content-Seite, History-State und das globale Presence-Flag, das PageHeader für Click-Interception nutzt.",
    facts: [
      "Setzt window.__mcOverlayActive.",
      "Hört auf mc:overlay-open.",
      "Lädt Content per /api/v1/content/{slug}.",
    ],
  },
  {
    id: "overlay-frame",
    title: "OverlayFrame",
    sourceKeys: ["overlayIsland"],
    body:
      "OverlayFrame ist die sichtbare Overlay-Hülle. Sie kann bewegt und skaliert werden und speichert Geometrie pro Page-Slug.",
    facts: [
      "Drag über .overlay-drag-handle.",
      "Resize über Kanten und Ecken.",
      "Geometrie-Key: mc:overlay-geom:{slug}.",
    ],
  },
  {
    id: "no-js",
    title: "No-JS Fallback",
    sourceKeys: ["entry"],
    body:
      "Für deaktiviertes JavaScript rendert index.astro einen statischen Hinweis statt der interaktiven React-App.",
    facts: [
      "Liegt in einem noscript-Block.",
      "Zeigt musiccloud und einen kurzen Hinweis.",
      "Die eigentliche App benötigt JavaScript.",
    ],
  },
];

const layoutBlocks = [
  {
    id: "document",
    label: "Browser / Document",
    type: "astro",
    children: [
      {
        id: "astro-shell",
        label: "BaseLayout + index.astro",
        type: "astro",
        children: [
          { id: "head", label: "Head: SEO / OG / JSON-LD / Tracking", type: "astro" },
          {
            id: "body",
            label: "Body Surface",
            type: "astro",
            children: [
              { id: "background", label: "GradientBackground", type: "astro" },
              {
                id: "react-island",
                label: "LandingPage React Island",
                type: "react",
                children: [
                  {
                    id: "providers",
                    label: "ErrorBoundary + LocaleProvider",
                    type: "react",
                    children: [
                      {
                        id: "page-header",
                        label: "PageHeader",
                        type: "react",
                        children: [
                          { id: "header-nav", label: "Admin Nav: Info / Help", type: "react" },
                          { id: "language-switcher", label: "LanguageSwitcher", type: "react" },
                        ],
                      },
                      {
                        id: "main-area",
                        label: "Main Area",
                        type: "react",
                        children: [
                          { id: "logo", label: "LogoView", type: "react" },
                          { id: "hero-input", label: "HeroInput", type: "react" },
                          { id: "example-teaser", label: "Random Example Teaser", type: "react" },
                          {
                            id: "state-machine",
                            label: "useAppState",
                            type: "state",
                            children: [
                              { id: "lazy-panels", label: "Disambiguation / Genre Panels", type: "state" },
                              { id: "result-view", label: "ShareLayout Result View", type: "state" },
                            ],
                          },
                        ],
                      },
                      { id: "toast", label: "Toast", type: "react" },
                      { id: "footer", label: "AppFooter", type: "react" },
                    ],
                  },
                ],
              },
              {
                id: "overlay",
                label: "PageOverlayIsland",
                type: "overlay",
                children: [
                  { id: "overlay-provider", label: "OverlayProvider", type: "overlay" },
                  { id: "overlay-frame", label: "OverlayFrame + Content", type: "overlay" },
                ],
              },
              { id: "no-js", label: "No-JS Fallback", type: "astro" },
            ],
          },
        ],
      },
    ],
  },
];

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function sourceHash(content) {
  return createHash("sha256").update(content).digest("hex").slice(0, 12);
}

function countLines(content) {
  return content.split(/\r?\n/).length;
}

async function readSources() {
  return Promise.all(
    sourceFiles.map(async (source) => {
      const absolutePath = path.join(root, source.path);
      const content = await readFile(absolutePath, "utf8");
      const checks = source.checks.map(([label, pattern]) => ({ label, ok: pattern.test(content) }));
      return { ...source, hash: sourceHash(content), lines: countLines(content), checks };
    }),
  );
}

function renderDetailJson(sources) {
  const sourcesByKey = Object.fromEntries(sources.map((source) => [source.key, source]));
  const details = Object.fromEntries(
    detailSections.map((section) => [
      section.id,
      {
        ...section,
        sources: section.sourceKeys.map((key) => {
          const source = sourcesByKey[key];
          return {
            label: source.label,
            path: source.path,
            lines: source.lines,
            hash: source.hash,
            checks: source.checks,
          };
        }),
      },
    ]),
  );
  return JSON.stringify(details);
}

function renderBlock(block, depth = 0) {
  const children = block.children?.map((child) => renderBlock(child, depth + 1)).join("") ?? "";
  return `
    <section class="block block-${escapeHtml(block.type)} depth-${depth}">
      <button class="block-hit" data-detail="${escapeHtml(block.id)}" type="button">
        <span class="block-kicker">${escapeHtml(block.type)}</span>
        <span class="block-label">${escapeHtml(block.label)}</span>
      </button>
      ${children ? `<div class="block-children">${children}</div>` : ""}
    </section>`;
}

function renderSourceCards(sources) {
  return sources
    .map((source) => {
      const ok = source.checks.every((check) => check.ok);
      const checks = source.checks
        .map(
          (check) =>
            `<li class="${check.ok ? "pass" : "fail"}"><span>${check.ok ? "✓" : "!"}</span>${escapeHtml(check.label)}</li>`,
        )
        .join("");
      return `
        <article class="source-card ${ok ? "ok" : "warn"}">
          <p class="source-label">${escapeHtml(source.label)}</p>
          <h3>${escapeHtml(source.path)}</h3>
          <div class="source-meta">
            <span>${source.lines} lines</span>
            <span>sha ${source.hash}</span>
          </div>
          <ul>${checks}</ul>
        </article>`;
    })
    .join("");
}

function renderHtml(sources) {
  const generatedAt = new Date().toISOString();
  const totalChecks = sources.reduce((sum, source) => sum + source.checks.length, 0);
  const passedChecks = sources.reduce((sum, source) => sum + source.checks.filter((check) => check.ok).length, 0);
  const verified = passedChecks === totalChecks;
  const detailJson = renderDetailJson(sources).replaceAll("</script", "<\\/script");

  return `<!doctype html>
<html lang="de">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>musiccloud Landingpage Structure</title>
    <style>
      :root {
        color-scheme: dark;
        --bg: #08090c;
        --panel: rgba(18, 21, 27, 0.92);
        --panel-2: rgba(25, 29, 37, 0.92);
        --line: rgba(255, 255, 255, 0.1);
        --text: #f4f7fb;
        --muted: #9ca6b6;
        --cyan: #34c7e8;
        --gold: #d8a948;
        --green: #58d68d;
        --violet: #a48bff;
        --red: #ff7077;
      }

      * { box-sizing: border-box; }

      body {
        margin: 0;
        min-height: 100vh;
        font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
        background:
          radial-gradient(circle at 8% 12%, rgba(52, 199, 232, 0.24), transparent 36%),
          radial-gradient(circle at 92% 18%, rgba(216, 169, 72, 0.16), transparent 30%),
          radial-gradient(circle at 48% 105%, rgba(88, 214, 141, 0.1), transparent 40%),
          var(--bg);
        color: var(--text);
      }

      button {
        font: inherit;
      }

      .page {
        width: min(1480px, 100%);
        margin: 0 auto;
        padding: 36px clamp(16px, 3vw, 48px) 54px;
      }

      .hero {
        display: grid;
        grid-template-columns: minmax(0, 1fr) minmax(320px, 0.78fr);
        gap: 24px;
        margin-bottom: 24px;
      }

      .intro, .preview, .canvas, .source-panel {
        border: 1px solid var(--line);
        border-radius: 14px;
        background: linear-gradient(180deg, rgba(255, 255, 255, 0.06), rgba(255, 255, 255, 0.025));
        box-shadow: 0 24px 80px rgba(0, 0, 0, 0.34);
      }

      .intro {
        padding: 30px;
      }

      .eyebrow {
        margin: 0 0 12px;
        color: var(--cyan);
        font-size: 13px;
        font-weight: 800;
        letter-spacing: 0.08em;
        text-transform: uppercase;
      }

      h1 {
        margin: 0 0 14px;
        font-size: clamp(34px, 4vw, 58px);
        line-height: 1;
        letter-spacing: 0;
      }

      .intro-text {
        max-width: 780px;
        margin: 0;
        color: var(--muted);
        font-size: 17px;
        line-height: 1.55;
      }

      .generated {
        display: flex;
        flex-wrap: wrap;
        gap: 10px;
        margin-top: 18px;
      }

      .pill {
        display: inline-flex;
        align-items: center;
        gap: 7px;
        padding: 7px 10px;
        border-radius: 999px;
        background: rgba(255, 255, 255, 0.07);
        color: var(--muted);
        font-size: 13px;
      }

      .pill.ok { color: var(--green); }
      .pill.warn { color: var(--red); }

      .preview {
        position: relative;
        min-height: 292px;
        overflow: hidden;
        background:
          linear-gradient(180deg, rgba(0, 0, 0, 0.18), rgba(0, 0, 0, 0.6)),
          #050607;
      }

      .browser-frame {
        position: absolute;
        inset: 22px;
        border: 1px solid rgba(255, 255, 255, 0.08);
        border-radius: 12px;
        background: rgba(0, 0, 0, 0.42);
      }

      .floating-header {
        position: absolute;
        top: 36px;
        right: 36px;
        display: flex;
        align-items: center;
        gap: 22px;
        padding: 18px 28px;
        border-radius: 16px;
        background: rgba(28, 24, 22, 0.9);
        box-shadow: 0 22px 48px rgba(0, 0, 0, 0.45);
        color: rgba(255, 255, 255, 0.68);
        font-size: 22px;
      }

      .flag { font-size: 24px; opacity: 0.72; }

      .logo-ghost, .search-ghost {
        position: absolute;
        left: 48px;
        border-radius: 999px;
      }

      .logo-ghost {
        bottom: 62px;
        width: 230px;
        height: 46px;
        background: linear-gradient(90deg, rgba(52, 199, 232, 0.38), rgba(216, 169, 72, 0.16));
        opacity: 0.36;
      }

      .search-ghost {
        bottom: 34px;
        width: min(460px, calc(100% - 96px));
        height: 18px;
        background: rgba(255, 255, 255, 0.08);
      }

      .canvas {
        padding: 22px;
      }

      .canvas-header {
        display: flex;
        justify-content: space-between;
        gap: 16px;
        align-items: end;
        margin-bottom: 18px;
      }

      .canvas-header h2 {
        margin: 0;
        font-size: 24px;
      }

      .hint {
        margin: 0;
        color: var(--muted);
        font-size: 14px;
      }

      .container-map {
        display: grid;
        grid-template-columns: minmax(0, 1.45fr) minmax(320px, 0.85fr);
        gap: 18px;
        align-items: stretch;
      }

      .browser-container {
        min-height: 700px;
        border: 1px solid rgba(255, 255, 255, 0.09);
        border-radius: 14px;
        padding: 18px;
        background:
          linear-gradient(180deg, rgba(255, 255, 255, 0.04), transparent),
          rgba(0, 0, 0, 0.22);
      }

      .topbar {
        display: flex;
        align-items: center;
        gap: 8px;
        margin-bottom: 16px;
        color: var(--muted);
        font-size: 12px;
      }

      .dot-window {
        width: 11px;
        height: 11px;
        border-radius: 999px;
        background: rgba(255, 255, 255, 0.2);
      }

      .window-title {
        margin-left: 8px;
      }

      .block {
        position: relative;
        display: block;
        width: 100%;
        text-align: left;
        color: var(--text);
        border: 1px solid rgba(255, 255, 255, 0.11);
        border-radius: 12px;
        background: var(--panel);
        padding: 10px;
        transition: border-color 150ms ease, transform 150ms ease, background 150ms ease;
      }

      .block:hover {
        transform: translateY(-1px);
        border-color: rgba(255, 255, 255, 0.32);
      }

      .block-hit {
        display: block;
        width: 100%;
        border: 0;
        border-radius: 9px;
        background: rgba(255, 255, 255, 0.035);
        color: inherit;
        cursor: pointer;
        padding: 10px;
        text-align: left;
      }

      .block-hit:hover,
      .block-hit:focus-visible,
      button.block:hover,
      button.block:focus-visible {
        background: rgba(255, 255, 255, 0.07);
        outline: none;
      }

      .block + .block {
        margin-top: 14px;
      }

      .block-children {
        display: grid;
        gap: 12px;
        margin-top: 14px;
      }

      .block-kicker {
        display: block;
        margin-bottom: 6px;
        color: var(--muted);
        font-size: 11px;
        font-weight: 900;
        letter-spacing: 0.08em;
        text-transform: uppercase;
      }

      .block-label {
        display: block;
        font-size: 17px;
        font-weight: 850;
        line-height: 1.2;
      }

      .block-astro { border-color: rgba(216, 169, 72, 0.42); }
      .block-react { border-color: rgba(52, 199, 232, 0.38); }
      .block-state { border-color: rgba(88, 214, 141, 0.38); }
      .block-overlay { border-color: rgba(164, 139, 255, 0.42); }
      .depth-0 { background: rgba(13, 15, 20, 0.9); }
      .depth-1 { background: rgba(22, 25, 32, 0.92); }
      .depth-2 { background: rgba(30, 34, 43, 0.92); }
      .depth-3 { background: rgba(20, 27, 34, 0.94); }
      .depth-4 { background: rgba(22, 32, 39, 0.94); }
      .depth-5 { background: rgba(24, 37, 44, 0.94); }
      .depth-6 { background: rgba(26, 40, 48, 0.94); }
      .depth-7 { background: rgba(28, 42, 50, 0.94); }

      .side-stack {
        display: grid;
        gap: 14px;
      }

      .mini-panel {
        border: 1px solid rgba(255, 255, 255, 0.1);
        border-radius: 12px;
        background: rgba(0, 0, 0, 0.2);
        padding: 14px;
      }

      .mini-panel h3 {
        margin: 0 0 12px;
        font-size: 16px;
      }

      .state-grid {
        display: grid;
        grid-template-columns: repeat(2, minmax(0, 1fr));
        gap: 10px;
      }

      .state-chip {
        min-height: 76px;
        border: 1px solid rgba(88, 214, 141, 0.25);
        border-radius: 10px;
        background: rgba(88, 214, 141, 0.07);
        color: var(--text);
        text-align: left;
        padding: 12px;
        cursor: pointer;
      }

      .state-chip strong {
        display: block;
        margin-bottom: 4px;
        font-size: 13px;
      }

      .state-chip span {
        color: var(--muted);
        font-size: 12px;
      }

      .source-panel {
        margin-top: 22px;
        padding: 20px;
      }

      .source-grid {
        display: grid;
        grid-template-columns: repeat(2, minmax(0, 1fr));
        gap: 14px;
      }

      .source-card {
        border: 1px solid rgba(255, 255, 255, 0.08);
        border-radius: 12px;
        background: rgba(0, 0, 0, 0.18);
        padding: 14px;
      }

      .source-card.ok { border-color: rgba(88, 214, 141, 0.26); }
      .source-card.warn { border-color: rgba(255, 112, 119, 0.38); }
      .source-label { margin: 0 0 6px; color: var(--cyan); font-size: 12px; font-weight: 850; text-transform: uppercase; letter-spacing: 0.06em; }
      .source-card h3 { margin: 0; font-size: 14px; line-height: 1.35; overflow-wrap: anywhere; }
      .source-meta { display: flex; flex-wrap: wrap; gap: 8px; margin: 10px 0; color: var(--muted); font-size: 12px; }
      .source-card ul { list-style: none; padding: 0; margin: 0; display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 6px 10px; }
      .source-card li { color: var(--muted); font-size: 12px; line-height: 1.35; }
      .source-card li span { display: inline-block; width: 16px; color: var(--green); font-weight: 900; }
      .source-card li.fail span { color: var(--red); }

      .detail-popover {
        position: fixed;
        z-index: 40;
        width: min(360px, calc(100vw - 32px));
        pointer-events: none;
        opacity: 0;
        transform: translateY(4px);
        transition: opacity 120ms ease, transform 120ms ease;
        border: 1px solid rgba(255, 255, 255, 0.12);
        border-radius: 12px;
        background: rgba(14, 16, 21, 0.96);
        box-shadow: 0 20px 60px rgba(0, 0, 0, 0.4);
        padding: 14px;
      }

      .detail-popover.visible {
        opacity: 1;
        transform: translateY(0);
      }

      .detail-popover h3,
      .dialog-card h3 {
        margin: 0 0 8px;
        font-size: 18px;
      }

      .detail-popover p,
      .dialog-card p {
        margin: 0;
        color: var(--muted);
        line-height: 1.5;
        font-size: 14px;
      }

      .dialog-backdrop {
        position: fixed;
        inset: 0;
        z-index: 50;
        display: none;
        align-items: center;
        justify-content: center;
        padding: 18px;
        background: rgba(0, 0, 0, 0.66);
      }

      .dialog-backdrop.visible {
        display: flex;
      }

      .dialog-card {
        width: min(760px, 100%);
        max-height: min(760px, calc(100vh - 36px));
        overflow: auto;
        border: 1px solid rgba(255, 255, 255, 0.12);
        border-radius: 14px;
        background: #10131a;
        box-shadow: 0 30px 90px rgba(0, 0, 0, 0.54);
        padding: 20px;
      }

      .dialog-header {
        display: flex;
        justify-content: space-between;
        gap: 14px;
        align-items: start;
        margin-bottom: 12px;
      }

      .close-button {
        width: 34px;
        height: 34px;
        border: 1px solid rgba(255, 255, 255, 0.12);
        border-radius: 999px;
        background: rgba(255, 255, 255, 0.06);
        color: var(--text);
        cursor: pointer;
      }

      .facts {
        display: grid;
        gap: 8px;
        margin: 16px 0;
        padding: 0;
        list-style: none;
      }

      .facts li {
        border: 1px solid rgba(255, 255, 255, 0.08);
        border-radius: 10px;
        background: rgba(255, 255, 255, 0.04);
        padding: 10px 12px;
        color: var(--muted);
        font-size: 14px;
      }

      .dialog-sources {
        display: grid;
        gap: 10px;
      }

      .dialog-source {
        border-top: 1px solid rgba(255, 255, 255, 0.08);
        padding-top: 10px;
      }

      .dialog-source code {
        color: var(--cyan);
        overflow-wrap: anywhere;
      }

      @media (max-width: 1020px) {
        .hero, .container-map { grid-template-columns: 1fr; }
        .source-grid { grid-template-columns: 1fr; }
      }

      @media (max-width: 620px) {
        .source-card ul, .state-grid { grid-template-columns: 1fr; }
        .floating-header {
          right: 22px;
          gap: 14px;
          padding: 14px 18px;
          font-size: 18px;
        }
      }
    </style>
  </head>
  <body>
    <main class="page">
      <section class="hero" aria-labelledby="page-title">
        <div class="intro">
          <p class="eyebrow">Landingpage Struktur</p>
          <h1 id="page-title">musiccloud Frontend als verschachtelte Architektur</h1>
          <p class="intro-text">
            Automatisch generierte grafische Uebersicht aus dem aktuellen Code. Hover zeigt eine Kurzinfo, Klick oeffnet ein Detail-Overlay mit Beschreibung, Fakten und den geprueften Quelldateien.
          </p>
          <div class="generated">
            <span class="pill ${verified ? "ok" : "warn"}">${verified ? "Alle Strukturchecks bestanden" : "Einige Strukturchecks offen"}</span>
            <span class="pill">${passedChecks}/${totalChecks} Checks</span>
            <span class="pill">Generated ${escapeHtml(generatedAt)}</span>
          </div>
        </div>

        <div class="preview" aria-label="Header Vorschau">
          <div class="browser-frame"></div>
          <button class="floating-header" data-detail="page-header" type="button">
            <span>Info</span>
            <span>Help</span>
            <span class="flag">🇬🇧</span>
          </button>
          <div class="logo-ghost"></div>
          <div class="search-ghost"></div>
        </div>
      </section>

      <section class="canvas" aria-label="Containerisierte Landingpage Struktur">
        <div class="canvas-header">
          <div>
            <p class="eyebrow">Container-Aufbau</p>
            <h2>Hierarchisch verschachtelt von Document bis Component</h2>
          </div>
          <p class="hint">Hover fuer Kurzinfo, Klick fuer Details.</p>
        </div>

        <div class="container-map">
          <div class="browser-container">
            <div class="topbar">
              <span class="dot-window"></span>
              <span class="dot-window"></span>
              <span class="dot-window"></span>
              <span class="window-title">musiccloud.io /</span>
            </div>
            ${layoutBlocks.map((block) => renderBlock(block)).join("")}
          </div>

          <aside class="side-stack" aria-label="State und Overlay Zusammenfassung">
            <section class="mini-panel">
              <h3>Search State</h3>
              <div class="state-grid">
                <button class="state-chip" data-detail="state-machine" type="button"><strong>idle</strong><span>Logo, HeroInput, Beispiel-Link</span></button>
                <button class="state-chip" data-detail="state-machine" type="button"><strong>loading</strong><span>kompakter Input, Spinner, Placeholder</span></button>
                <button class="state-chip" data-detail="lazy-panels" type="button"><strong>choice panels</strong><span>Disambiguation, Genre Browse, Genre Search</span></button>
                <button class="state-chip" data-detail="lazy-panels" type="button"><strong>result</strong><span>ShareLayout mit MediaCard und Artist Info</span></button>
              </div>
            </section>

            <section class="mini-panel">
              <h3>Overlay Flow</h3>
              <button class="block block-overlay depth-1" data-detail="overlay" type="button">
                <span class="block-kicker">event flow</span>
                <span class="block-label">Info/Help → mc:overlay-open → Content API → OverlayFrame</span>
              </button>
            </section>

            <section class="mini-panel">
              <h3>Navigation Data</h3>
              <button class="block block-astro depth-1" data-detail="astro-shell" type="button">
                <span class="block-kicker">server data</span>
                <span class="block-label">loadNav(locale) liefert Header- und Footer-Items an die React-Island</span>
              </button>
            </section>
          </aside>
        </div>
      </section>

      <section class="source-panel" aria-label="Code-Pruefprotokoll">
        <p class="eyebrow">Code-Pruefprotokoll</p>
        <div class="source-grid">
          ${renderSourceCards(sources)}
        </div>
      </section>
    </main>

    <div class="detail-popover" id="detail-popover" aria-hidden="true"></div>
    <div class="dialog-backdrop" id="detail-dialog" role="dialog" aria-modal="true" aria-labelledby="dialog-title">
      <article class="dialog-card">
        <div class="dialog-header">
          <div>
            <p class="eyebrow">Details</p>
            <h3 id="dialog-title"></h3>
          </div>
          <button class="close-button" id="dialog-close" type="button" aria-label="Details schliessen">×</button>
        </div>
        <p id="dialog-body"></p>
        <ul class="facts" id="dialog-facts"></ul>
        <div class="dialog-sources" id="dialog-sources"></div>
      </article>
    </div>

    <script type="application/json" id="detail-data">${detailJson}</script>
    <script>
      const detailData = JSON.parse(document.getElementById("detail-data").textContent);
      const popover = document.getElementById("detail-popover");
      const dialog = document.getElementById("detail-dialog");
      const dialogTitle = document.getElementById("dialog-title");
      const dialogBody = document.getElementById("dialog-body");
      const dialogFacts = document.getElementById("dialog-facts");
      const dialogSources = document.getElementById("dialog-sources");
      const closeButton = document.getElementById("dialog-close");

      function escapeText(value) {
        return String(value).replace(/[&<>"']/g, (char) => ({
          "&": "&amp;",
          "<": "&lt;",
          ">": "&gt;",
          '"': "&quot;",
          "'": "&#39;"
        })[char]);
      }

      function detailFor(target) {
        return detailData[target.dataset.detail];
      }

      function showPopover(target) {
        const detail = detailFor(target);
        if (!detail) return;
        popover.innerHTML = "<h3>" + escapeText(detail.title) + "</h3><p>" + escapeText(detail.body) + "</p>";
        const rect = target.getBoundingClientRect();
        const left = Math.min(window.innerWidth - popover.offsetWidth - 16, Math.max(16, rect.left));
        const top = Math.min(window.innerHeight - 120, rect.bottom + 10);
        popover.style.left = left + "px";
        popover.style.top = top + "px";
        popover.classList.add("visible");
      }

      function hidePopover() {
        popover.classList.remove("visible");
      }

      function openDialog(target) {
        const detail = detailFor(target);
        if (!detail) return;
        hidePopover();
        dialogTitle.textContent = detail.title;
        dialogBody.textContent = detail.body;
        dialogFacts.innerHTML = detail.facts.map((fact) => "<li>" + escapeText(fact) + "</li>").join("");
        dialogSources.innerHTML = detail.sources.map((source) => {
          const passed = source.checks.filter((check) => check.ok).length;
          return '<div class="dialog-source"><code>' + escapeText(source.path) + '</code><p>' +
            escapeText(source.label + " · " + source.lines + " lines · sha " + source.hash + " · " + passed + "/" + source.checks.length + " checks") +
            "</p></div>";
        }).join("");
        dialog.classList.add("visible");
        closeButton.focus();
      }

      function closeDialog() {
        dialog.classList.remove("visible");
      }

      document.querySelectorAll("[data-detail]").forEach((target) => {
        target.addEventListener("mouseenter", () => showPopover(target));
        target.addEventListener("mousemove", () => showPopover(target));
        target.addEventListener("mouseleave", hidePopover);
        target.addEventListener("focus", () => showPopover(target));
        target.addEventListener("blur", hidePopover);
        target.addEventListener("click", (event) => {
          event.stopPropagation();
          openDialog(target);
        });
      });

      closeButton.addEventListener("click", closeDialog);
      dialog.addEventListener("click", (event) => {
        if (event.target === dialog) closeDialog();
      });
      document.addEventListener("keydown", (event) => {
        if (event.key === "Escape") closeDialog();
      });
    </script>
  </body>
</html>
`;
}

const sources = await readSources();
await mkdir(path.dirname(outputPath), { recursive: true });
await writeFile(outputPath, renderHtml(sources), "utf8");

const totalChecks = sources.reduce((sum, source) => sum + source.checks.length, 0);
const passedChecks = sources.reduce((sum, source) => sum + source.checks.filter((check) => check.ok).length, 0);

console.log(`Generated ${path.relative(root, outputPath)}`);
console.log(`Verified ${passedChecks}/${totalChecks} structure checks`);

if (passedChecks !== totalChecks) {
  for (const source of sources) {
    for (const check of source.checks) {
      if (!check.ok) console.log(`Missing: ${source.path} -> ${check.label}`);
    }
  }
  process.exitCode = 1;
}
