# mc-query Custom Language + Inline Extensions — Implementation-Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development. Steps use `- [ ]` checkboxes for tracking.

**Goal:** `\`\`\`mc-query` Code-Blöcke bekommen serverseitig farbiges Syntax-Highlighting via eigener TextMate-Grammar; Inline-Markdown lernt zwei neue Token-Typen `[[REQUIRED]]`/`[[OPT]]` (Pills) und `{{...}}` (Keyboard-Hints).

**Architecture:** Drei Bausteine: (1) `apps/backend/src/services/grammars/mc-query.tmLanguage.json` plus Shiki-Singleton-Highlighter mit expliziter Sprach-Liste in `admin-content.ts`. (2) zwei marked-Inline-Extensions (`mcBadge`, `mcKbd`) mit zentraler `BADGE_LABELS`-Map. (3) Tailwind-CSS-Klassen `mc-badge*` und `mc-kbd` in `MD_EMBOSSED` / `MD_TRANSLUCENT`.

**Tech Stack:** TypeScript, marked v17 + marked-highlight, shiki v3, vitest. Workspace package manager: npm.

---

## Status

**Implementation-Plan ready 2026-05-02** — basiert auf der Spec `docs/superpowers/specs/2026-05-02-mc-query-language-and-inline-extensions-design.md`.

## Pre-flight

- [ ] **PF-1:** `git status` — Tree clean (außer `cheatsheet-mockup.html` untracked, ist OK).
- [ ] **PF-2:** Aktuelles `main` HEAD ≥ `2db2882d` (sequenzielles Segment-Rendering ist bereits drin).
- [ ] **PF-3:** Shiki v3 ist als Backend-Dependency installiert (`apps/backend/package.json`).

## File Structure

Neu:
- `apps/backend/src/services/grammars/mc-query.tmLanguage.json` — TextMate-Grammar.

Modifiziert:
- `apps/backend/src/services/admin-content.ts` — Shiki-Singleton mit Custom-Lang + zwei marked-Inline-Extensions + `BADGE_LABELS`-Map.
- `apps/backend/src/services/__tests__/marked-renderer.test.ts` — neue Tests.
- `apps/frontend/src/components/layout/PageOverlayContent.tsx` — CSS-Selektoren für `mc-badge*` + `mc-kbd` in `MD_EMBOSSED` und `MD_TRANSLUCENT`.

---

## Implementation

3 Tasks. Jeder Task self-contained und committable.

### Task 1: TextMate-Grammar + Shiki-Singleton

**Files:**
- Create: `apps/backend/src/services/grammars/mc-query.tmLanguage.json`
- Modify: `apps/backend/src/services/admin-content.ts` — Highlight-Callback umstellen auf Singleton-Highlighter.

- [ ] **Step 1:** Grammar-JSON mit den sechs Patterns (`comment-hash`, `comment-slash`, `key-pair`, `operator`, `number`, `special`) anlegen — siehe Spec §1 für vollständigen Inhalt.

- [ ] **Step 2:** In `admin-content.ts`:
  - Import: `createHighlighter, type HighlighterGeneric, type BundledLanguage, type BundledTheme` aus `shiki` plus `mcQueryGrammar` aus dem JSON-File mit `import ... with { type: "json" }` (oder `assert { type: "json" }` falls die TS-Version das verlangt).
  - Modul-level Singleton-Promise `highlighterPromise` plus `getHighlighter()`-Helper. Lang-Liste explizit: `["javascript", "typescript", "ts", "js", "tsx", "jsx", "python", "swift", "bash", "json", "css", "html", mcQueryGrammar]`.
  - Im `markedHighlight.highlight`-Callback: `getHighlighter()` plus `hl.codeToHtml(code, { lang, theme: "vitesse-dark" })` ersetzt den direkten `codeToHtml`-Aufruf. Inner-of-`<code>`-Regex-Extraktion und `escapeHtml(code)`-Fallback bleiben.

- [ ] **Step 3:** Tests in `marked-renderer.test.ts` ergänzen:

  ```ts
  it("highlights ```mc-query genre:jazz with custom grammar tokens", async () => {
    const out = (await marked.parse("```mc-query\ngenre: jazz\n```", { async: true })) as string;
    expect(out).toMatch(/<span style="color:/);
  });

  it("recognizes # comments inside ```mc-query", async () => {
    // vitesse-dark renders comments grey-green via color, NOT italic.
    // Assertion checks the grammar isolated the comment into its own span.
    const out = (await marked.parse("```mc-query\ngenre: jazz # filter\n```", { async: true })) as string;
    expect(out).toMatch(/<span style="color:#[0-9A-F]+"># filter<\/span>/i);
  });

  it("recognizes // comments inside ```mc-query", async () => {
    const out = (await marked.parse("```mc-query\nartist: foo // note\n```", { async: true })) as string;
    expect(out).toMatch(/<span style="color:#[0-9A-F]+">\/\/ note<\/span>/i);
  });

  it("falls back gracefully for unknown language not in highlighter list", async () => {
    const out = (await marked.parse("```ruby\nputs :hi\n```", { async: true })) as string;
    expect(out).toContain("puts");
  });
  ```

- [ ] **Step 4:** Tests laufen lassen:

  ```bash
  npm run test:run --workspace=apps/backend -- marked-renderer
  ```

  Erwartet: alle bestehenden + 4 neue Tests grün.

- [ ] **Step 5:** Lint + Typecheck:

  ```bash
  npx biome check apps/backend/src/services/admin-content.ts apps/backend/src/services/__tests__/marked-renderer.test.ts apps/backend/src/services/grammars/mc-query.tmLanguage.json
  npx tsc --noEmit -p apps/backend/tsconfig.json
  ```

- [ ] **Step 6:** Commit:

  ```bash
  git add apps/backend/src/services/grammars/mc-query.tmLanguage.json \
          apps/backend/src/services/admin-content.ts \
          apps/backend/src/services/__tests__/marked-renderer.test.ts
  git commit -m "Feat: Custom mc-query TextMate grammar + Shiki singleton highlighter

  - New mc-query.tmLanguage.json defines tokens for keys (genre/tracks/albums/artists/count/vibe/title/artist/album), '#' and '//' comments, '|' OR-operator, numbers, and the '?' browse trigger.
  - admin-content.ts switches from per-call codeToHtml() to a module-level singleton highlighter created with an explicit language list including the custom grammar; eliminates per-parse highlighter init and lets Shiki pick the right TextMate grammar for mc-query.
  - Four new tests cover the mc-query happy path (highlight tokens), '#' and '//' comments, and the unknown-lang fallback (graceful non-crash for languages outside the explicit list)."
  ```

---

### Task 2: Inline-Extensions mcBadge + mcKbd

**Files:**
- Modify: `apps/backend/src/services/admin-content.ts` — `BADGE_LABELS`-Map plus zwei `marked.use({ extensions: [...] })`-Einträge.
- Modify: `apps/backend/src/services/__tests__/marked-renderer.test.ts`.

- [ ] **Step 1:** `BADGE_LABELS`-Konstante deklarieren plus `BADGE_PATTERN` daraus ableiten (siehe Spec §2 für vollständigen Code). Zentrale Stelle für Erweiterungen.

- [ ] **Step 2:** `marked.use({ extensions: [...] })` mit zwei Einträgen `mcBadge` und `mcKbd` (siehe Spec §2).

- [ ] **Step 3:** Tests ergänzen:

  ```ts
  it("renders [[REQUIRED]] as a req badge", async () => {
    const out = (await marked.parse("foo [[REQUIRED]] bar", { async: true })) as string;
    expect(out).toContain('<span class="mc-badge mc-badge-req">REQUIRED</span>');
  });

  it("renders [[OPT]] as an opt badge", async () => {
    const out = (await marked.parse("foo [[OPT]] bar", { async: true })) as string;
    expect(out).toContain('<span class="mc-badge mc-badge-opt">OPT</span>');
  });

  it("treats [[REQ]] as alias for REQUIRED variant", async () => {
    const out = (await marked.parse("foo [[REQ]] bar", { async: true })) as string;
    expect(out).toContain('<span class="mc-badge mc-badge-req">REQ</span>');
  });

  it("leaves [[UNKNOWN]] markers untouched", async () => {
    const out = (await marked.parse("foo [[UNKNOWN]] bar", { async: true })) as string;
    expect(out).not.toContain("mc-badge");
    expect(out).toContain("[[UNKNOWN]]");
  });

  it("renders {{Esc}} as a mc-kbd element", async () => {
    const out = (await marked.parse("press {{Esc}} now", { async: true })) as string;
    expect(out).toContain('<kbd class="mc-kbd">Esc</kbd>');
  });

  it("escapes HTML inside {{...}} kbd content", async () => {
    const out = (await marked.parse("test {{<script>}} end", { async: true })) as string;
    expect(out).toContain('<kbd class="mc-kbd">&lt;script&gt;</kbd>');
    expect(out).not.toContain("<script>");
  });
  ```

- [ ] **Step 4:** Tests laufen lassen + Lint + Typecheck (gleiche Befehle wie Task 1).

- [ ] **Step 5:** Commit:

  ```bash
  git add apps/backend/src/services/admin-content.ts \
          apps/backend/src/services/__tests__/marked-renderer.test.ts
  git commit -m "Feat: Inline marked extensions for [[BADGE]] pills and {{kbd}} hints

  - New mcBadge inline-extension turns [[REQUIRED]], [[OPT]], [[REQ]] into <span class='mc-badge mc-badge-...'>...</span> elements. Whitelist driven by central BADGE_LABELS map; new badge values can be added by extending the map (one line per new variant).
  - New mcKbd inline-extension turns {{Esc}}, {{Cmd+K}}, etc. into <kbd class='mc-kbd'>...</kbd> elements. Content is HTML-escaped before output to keep author-supplied text safe.
  - Six new tests cover both extensions plus the leave-unknown-markers-untouched and escape-html-inside-kbd cases."
  ```

---

### Task 3: Frontend-CSS + visuelle Verifikation

**Files:**
- Modify: `apps/frontend/src/components/layout/PageOverlayContent.tsx` — `MD_EMBOSSED` + `MD_TRANSLUCENT` erweitern.

- [ ] **Step 1:** In beide Konstanten (Zeilen 11-23 und 25-37) dieselben vier Selektor-Strings einfügen (siehe Spec §3). Bei translucent leicht andere Opacities falls nötig (z.B. `bg-error/20` statt `/15`).

- [ ] **Step 2:** Lint:

  ```bash
  npx biome check apps/frontend/src/components/layout/PageOverlayContent.tsx
  ```

- [ ] **Step 3:** Manueller visual smoke-test:
  - Im Dashboard eine bestehende Hilfe-Page editieren, einen `\`\`\`mc-query`-Block plus `[[REQUIRED]]`-, `[[OPT]]`-, `{{Esc}}`-Marker einfügen, speichern.
  - `http://localhost:3000/<slug>` öffnen und verifizieren: `genre:`/`tracks:`/etc. türkis, Comments grau-italic, Pills mit Background-Farbe, Kbd als Box mit Border.

- [ ] **Step 4:** Commit:

  ```bash
  git add apps/frontend/src/components/layout/PageOverlayContent.tsx
  git commit -m "Style: CSS for mc-badge and mc-kbd inline elements

  - Adds .mc-badge, .mc-badge-req, .mc-badge-opt, and .mc-kbd selector blocks to MD_EMBOSSED and MD_TRANSLUCENT.
  - Pills are mono-uppercase chips; req gets the error tint, opt gets the muted-text tint.
  - kbd elements get a subtle bordered box on a low-opacity white background to read as physical keys."
  ```

---

## Verified facts

| Reference | Verified by |
|---|---|
| `apps/backend/src/services/admin-content.ts` heutiger `markedHighlight`-Block (line 72-89 vor Refactor) | direkt gelesen |
| `apps/backend/src/services/admin-content.ts` `parseInfostring` und `highlightPlainText` (helpers bleiben unverändert) | direkt gelesen |
| `apps/backend/src/services/__tests__/marked-renderer.test.ts` aktuelle Test-Struktur (21 Tests, async) | direkt gelesen |
| Shiki `createHighlighter` API + Custom-Grammar-Loading | `node_modules/shiki/dist/index.d.mts` + `node_modules/@shikijs/langs/dist/toml.mjs` |
| `apps/frontend/src/components/layout/PageOverlayContent.tsx` `MD_EMBOSSED` + `MD_TRANSLUCENT` Tailwind-Pattern | direkt gelesen |

- [x] Alle Code-Referenzen verifiziert
