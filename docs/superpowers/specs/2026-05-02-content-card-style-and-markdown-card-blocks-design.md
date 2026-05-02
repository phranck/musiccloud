# Content Card Style + Markdown-Code-Block-Card-Wrapping

> **Status:** Brainstorming abgeschlossen 2026-05-02. Bereit für Implementation-Plan.
>
> **Scope:** Zwei verwandte, aber unabhängige Features, die das `RecessedCard` / `EmbossedCard`-Idiom teilen — eines wirkt auf Page-Ebene, das andere innerhalb von Markdown-Content. Beide passen in einen einzigen Implementation-Plan, weil sie dieselben Shared-Types, denselben Frontend-Render-Pfad und denselben Backend-Markdown-Service berühren.

## Ziel

1. **Page-Level Card Style.** Für jede Page, die im `embossed`-Overlay-Modus oder im `fullscreen`-Modus gerendert wird, kann der Editor wählen, ob der Page-Content direkt auf der umgebenden `EmbossedCard` (`default`) oder eingelassen in einer `RecessedCard` (`recessed`) dargestellt wird. Heute ist die Inner-Card hart verdrahtet bei segmented Pages und fehlt bei nicht-segmented Pages — das wird zu einem expliziten Page-Setting.
2. **Markdown-Code-Block-Card-Wrapping.** Innerhalb von Markdown-Content kann ein Autor einen Fenced-Code-Block (\`\`\` …) mit `recessed` oder `embossed` markieren, sodass der Block in die jeweilige React-Component eingefasst wird. Der Sprach-Identifier steuert weiterhin unabhängig davon das Syntax-Highlighting. Inline-Code (Single-Backticks) bleibt unangetastet.

Die zwei Features sind im Datenmodell entkoppelt (Page-Level-Setting vs. Per-Block-Markdown-Modifier), teilen aber das visuelle Idiom und die Regel "kein `<div class="recessed-card">`-Platzhalter, ausschließlich die echten `RecessedCard` / `EmbossedCard` React-Components".

## Architektur-Übersicht

Zwei Pipelines werden angefasst:

- **Page-Setting-Pipeline** (Feature 1) ist vollständig im Frontend-React: eine neue Spalte auf `content_pages` fließt durch die bestehende Public-Page-Response und wird von `EmbossedOverlayContent` und `SegmentedPageFullscreen` gelesen, um den `RecessedCard`-Wrap zu entscheiden. Keine Markdown-Änderung nötig.
- **Markdown-Pipeline** (Feature 2) verbindet Backend und Frontend: Der Backend-`marked`-Renderer setzt ein Sentinel-Attribut `data-card-style="recessed|embossed"` auf `<pre>`-Elemente; das bestehende Frontend-`MarkdownHtml` wird umgebaut auf `html-react-parser` statt der bisherigen rohen HTML-Injection-Prop, mit einem Replace-Handler, der markierte `<pre>`-Elemente in die echten `RecessedCard` / `EmbossedCard` Components einfasst. Syntax-Highlighting kommt via `marked-highlight` + `shiki` dazu, sodass Sprach-Tags server-seitig farbige Tokens produzieren.

## 1. Datenmodell

### Datenbank

Neue Spalte auf `apps/backend/src/db/schemas/postgres.ts → contentPages`:

```ts
contentCardStyle: text("content_card_style").notNull().default("recessed"),
```

Werte: `"default" | "recessed"`. Kein `embossed`-Wert auf Page-Level — die Page liegt ohnehin schon auf einer `EmbossedCard`, das sinnvolle Binary ist "Inner-RecessedCard ja/nein".

Migration `0025_content_card_style.sql`:

```sql
ALTER TABLE content_pages
  ADD COLUMN content_card_style text NOT NULL DEFAULT 'recessed';
```

`ADD COLUMN ... NOT NULL DEFAULT 'recessed'` füllt bestehende Rows automatisch — kein zusätzliches `UPDATE` nötig. Sichtbare Konsequenz: Existierende non-segmented embossed/fullscreen Pages bekommen ab jetzt eine `RecessedCard` (vorher nicht). Das entspricht dem im Brainstorming gewählten Default-Wert.

### Shared-Types

`packages/shared/src/content.ts` (Zeilennummern aus Grep):

- Nach Zeile 32 (`OVERLAY_WIDTHS`):
  ```ts
  export type ContentCardStyle = "default" | "recessed";
  export const CONTENT_CARD_STYLES: readonly ContentCardStyle[] = ["default", "recessed"] as const;
  ```
- `ContentPageSummary` (Zeile 79-95): Feld `contentCardStyle: ContentCardStyle;` neben `overlayWidth` ergänzen.
- `ContentPage` (Zeile 96-): erbt via Extension.
- `PublicContentPage` (Zeile 111-): Feld `contentCardStyle: ContentCardStyle;` neben `overlayWidth` ergänzen.

### Backend-Service

`apps/backend/src/services/admin-content.ts`:

- `rowToSummary` (Zeile 81-): mappt `contentCardStyle: row.contentCardStyle`.
- `updateManagedContentPageMeta` (Zeile 186-): zusätzliche Validierung
  ```ts
  if (data.contentCardStyle !== undefined && !isOneOf(CONTENT_CARD_STYLES, data.contentCardStyle))
    return { ok: false, code: "INVALID_INPUT", message: "contentCardStyle invalid" };
  ```
- `getPublicContentPage` (Zeile 292-): `contentCardStyle: row.contentCardStyle` ins `base`-Literal aufnehmen (Zeile 310-).

`apps/backend/src/db/admin-repository.ts`:

- `ContentPageMetaUpdate` (Zeile 170-): Feld `contentCardStyle?: ContentCardStyle;` ergänzen.
- `updateContentPageMeta`-Query muss das Feld schreiben, wenn vorhanden.

## 2. Frontend-Render-Pfad (Feature 1)

`apps/frontend/src/components/layout/PageOverlayContent.tsx`:

### `EmbossedOverlayContent` (Zeilen 119-157)

Den `isSegmented`-Branch (Zeilen 143-153) durch `page.contentCardStyle === "recessed"` ersetzen:

```tsx
<EmbossedCard.Body className="flex-1 min-h-0 overflow-hidden pt-3">
  {page.contentCardStyle === "recessed" ? (
    <RecessedCard className="h-full" padding="0">
      <div className="h-full overflow-y-auto px-4 py-4">
        <MarkdownHtml key={`seg-${segmented.activeIndex}`} html={html} className={MD_EMBOSSED} />
      </div>
    </RecessedCard>
  ) : (
    <div className="h-full overflow-y-auto px-4 py-4">
      <MarkdownHtml html={html} className={MD_EMBOSSED} />
    </div>
  )}
</EmbossedCard.Body>
```

Das `key={…}` für den segmented-Fall bleibt erhalten (es zwingt beim Wechsel des aktiven Segments einen Re-Mount, sodass React's Content-Projection korrekt bleibt). Der `RecessedCard`-Wrap bricht das nicht.

### `SegmentedPageFullscreen` (Zeilen 159-196)

Identische Änderung am `hasSegments`-Conditional (Zeilen 184-192). Nach der Änderung ist die Wrap-Entscheidung rein `page.contentCardStyle === "recessed"`, entkoppelt von `pageType === "segmented"`.

### `TranslucentOverlayContent` (Zeilen 80-117)

Unverändert. Das Dashboard zeigt den `contentCardStyle`-Picker bei `displayMode === "translucent"` nicht — das Feld existiert in der Row, wird zur Render-Zeit aber ignoriert.

### Weitere Render-Pfade

Eine non-segmented `displayMode = "fullscreen"`-Page läuft möglicherweise durch eine andere Component (z.B. eine Astro `[slug].astro`). Der Implementation-Plan muss diesen Pfad lokalisieren und denselben `contentCardStyle === "recessed"`-Branch dort anwenden. Offene Frage: wird beim Plan-Schreiben verifiziert.

## 3. Dashboard-UI (Feature 1)

`apps/dashboard/src/features/content/pages/PageDisplaySettings.tsx`:

- Dritter `<Picker>` neben `displayMode` und `overlayWidth`.
- Sichtbarkeit: `displayMode !== "translucent"`. Konkret:
  - `fullscreen` → `displayMode` + `contentCardStyle`.
  - `embossed` → `displayMode` + `overlayWidth` + `contentCardStyle`.
  - `translucent` → `displayMode` + `overlayWidth`.
- Layout-Reihenfolge (von links nach rechts): `displayMode`, `overlayWidth` (wenn Overlay), `contentCardStyle` (wenn nicht translucent).
- `onChange({ contentCardStyle: v })` läuft durch das bestehende `Partial`-Patch-Pattern; `ContentEditorPage`'s `handlePatch` spreadet Partials bereits in die API-Mutation.

`apps/dashboard/src/i18n/messages.ts`:

- DE-Block (etwa Zeile 1218):
  ```ts
  contentCardStyle: "Card-Stil",
  cardStyleDefault: "Direkt",
  cardStyleRecessed: "Recessed",
  ```
- EN-Block (etwa Zeile 1936):
  ```ts
  contentCardStyle: "Card style",
  cardStyleDefault: "Direct",
  cardStyleRecessed: "Recessed",
  ```
- Type in `messages.ts:491-498` (`display:`-Block): die drei neuen Keys ergänzen.

Das Dropdown nutzt automatisch das neue `align="start"`-Default (vorhin in dieser Session ausgeliefert, siehe `apps/dashboard/src/components/ui/Dropdown.tsx`), sodass die Optionsliste des neuen Pickers nach rechts wächst und am linken Rand des Settings-Panels nicht klippt.

## 4. Markdown-Pipeline (Feature 2)

### Backend: marked Custom-Renderer + Syntax-Highlighter

`apps/backend/src/services/admin-content.ts`:

- Neue Dependencies: `marked-highlight` und `shiki`. In `apps/backend/package.json` ergänzen.
- Den aktuellen `marked.use(markedFootnote(), { gfm: true });` (Zeile 25) durch ein verkettetes Setup ersetzen:
  ```ts
  import { Marked } from "marked";
  import markedFootnote from "marked-footnote";
  import { markedHighlight } from "marked-highlight";
  import { codeToHtml } from "shiki";

  const KNOWN_MODIFIERS = new Set(["recessed", "embossed"]);

  function parseLangAndModifier(raw: string): { lang: string | null; modifier: "recessed" | "embossed" | null } {
    const tokens = raw.trim().split(/\s+/).filter(Boolean);
    let modifier: "recessed" | "embossed" | null = null;
    let lang: string | null = null;
    for (const t of tokens) {
      if (KNOWN_MODIFIERS.has(t)) modifier = t as "recessed" | "embossed";
      else if (lang === null) lang = t;
    }
    return { lang, modifier };
  }
  ```
- Ein `marked.use({ renderer: { code(...) {...} } })` überschreibt den Default-Code-Renderer. Innen: Sprache parsen, `shiki` für den Highlighted-Body laufen lassen, dann zusammenbauen:
  ```ts
  const attr = modifier ? ` data-card-style="${modifier}"` : "";
  const langClass = lang ? ` class="language-${lang}"` : "";
  return `<pre${attr}><code${langClass}>${shikiHtml}</code></pre>`;
  ```
- Shiki-Konfiguration: Theme `vitesse-dark` (passt zum Dark-UI). Unbekannte Sprachen: Shiki fällt still auf Plain-Text zurück, ohne zu werfen.

### Frontend: html-react-parser Replace-Handler

`apps/frontend/src/components/layout/PageOverlayContent.tsx`:

- Neue Dependency: `html-react-parser`. In `apps/frontend/package.json` ergänzen.
- `MarkdownHtml` (Zeilen 42-44) wird umgeschrieben:
  ```tsx
  import parse, { domToReact, type HTMLReactParserOptions, Element } from "html-react-parser";
  import { RecessedCard } from "@/components/cards/RecessedCard";
  import { EmbossedCard } from "@/components/cards/EmbossedCard";

  const parserOptions: HTMLReactParserOptions = {
    replace(domNode) {
      if (!(domNode instanceof Element)) return undefined;
      if (domNode.name !== "pre") return undefined;
      const cardStyle = domNode.attribs["data-card-style"];
      if (cardStyle !== "recessed" && cardStyle !== "embossed") return undefined;
      // Marker entfernen, sodass das gewrappte <pre> sauber rendert.
      const { ["data-card-style"]: _drop, ...rest } = domNode.attribs;
      domNode.attribs = rest;
      const inner = (
        <pre {...domNode.attribs} data-card-wrapped="true">
          {domToReact(domNode.children, parserOptions)}
        </pre>
      );
      return cardStyle === "recessed"
        ? <RecessedCard padding="0">{inner}</RecessedCard>
        : <EmbossedCard padding="0">{inner}</EmbossedCard>;
    },
  };

  function MarkdownHtml({ html, className }: { html: string; className?: string }) {
    return <div className={className}>{parse(html, parserOptions)}</div>;
  }
  ```
- `domToReact(... parserOptions)` (mit Options) ist nötig, damit die Rekursion für verschachtelten Content dieselben Replace-Regeln anwendet. Ein Code-Block, der wieder Markdown enthält, ist ungewöhnlich, aber Rekursion ist by-default richtig.

### Default-Code-Block-CSS

`MD_EMBOSSED` (Zeilen 25-37) und `MD_TRANSLUCENT` (Zeilen 11-23) werden erweitert:

```ts
"[&_pre]:my-3 [&_pre]:rounded-lg [&_pre]:overflow-x-auto [&_pre]:p-3 [&_pre]:bg-black/20 [&_pre]:font-mono [&_pre]:text-sm",
"[&_:not(pre)>code]:rounded [&_:not(pre)>code]:bg-white/8 [&_:not(pre)>code]:px-1.5 [&_:not(pre)>code]:py-0.5 [&_:not(pre)>code]:font-mono [&_:not(pre)>code]:text-sm",
```

Der `[&_:not(pre)>code]`-Selector trifft Inline-`<code>` (Single-Backtick) und lässt Block-`<code>` innerhalb `<pre>` in Ruhe (das wird durch Shiki's `<span style="color:…">`-Tokens gestylt). Bei `recessed`/`embossed`-Blöcken übernimmt die Geometrie des Wrap-Components — das innere `<pre>` muss seinen eigenen Padding/Background unterdrücken, damit die Card-Geometrie kanonisch bleibt:

```ts
"[&_pre[data-card-wrapped]]:p-0 [&_pre[data-card-wrapped]]:bg-transparent",
```

Der Frontend-Wrap-Handler setzt `data-card-wrapped="true"` auf das innere `<pre>`, sodass dieser CSS-Selector greift. (Das ursprüngliche `data-card-style` wird beim Wrap entfernt — siehe Implementation-Note in Section 4.)

### Sanitization

`marked` produziert per Default sanitisiertes HTML für Inputs, die ohnehin durch die Admin-Side-Textarea-Validierung laufen (`CONTENT_MAX_LEN = 100_000`). Shiki-Output ist `<span style="color:#…">`-only, keine Scripts. Das einzige zusätzliche Attribut (`data-card-style="recessed|embossed"`) ist im Frontend-Handler whitelisted (alles andere wird gestrippt), Injection durch dieses Attribut ist also auf zwei bekannte Werte begrenzt.

## 5. Tests + Migrations-Drift-Check

### Pre-flight: Migrations-Drift-Audit

Migrations-Filename `0025_content_card_style.sql` ist korrekt (nächste freie File-Nummer — die letzte ausgelieferte ist `0024_invalidate_lastfm_toptracks_cache.sql`). Drizzle-Tracker in Production hat 25 Einträge mit `MAX(id) = 27` (Lücken bei 20 und 21 aus früheren Rollbacks). Die nächste eingefügte Tracker-Row bekommt `id = 28`. Kein Code-Change wegen der Lücke.

**Latenter Drift gefunden** während der Spec-Verifikation: lokale Datei `0004_broad_wild_pack.sql` hat SHA `61f40afe…`, der Production-Tracker hat aber Hash `dbccdc8a…` für denselben Migrations-Index. Heißt: jemand hat die lokale Migrations-Datei nach dem Deployment editiert. **Nicht blockierend** für das neue Feature (Drizzle führt nur Migrations aus, deren Hash nicht im Tracker steht; der alte Hash von 0004 ist da, also wird die modifizierte lokale Datei zur Laufzeit ignoriert). **Gefährlich**, wenn die DB jemals gewipped und reseeded wird — dann läuft die modifizierte Datei statt der Originals. Listed unter Open Questions.

### Backend-Tests

Neue Datei `apps/backend/src/services/__tests__/marked-renderer.test.ts` (oder Erweiterung von `admin-content.test.ts`):

- `\`\`\`js\\n…\\n\`\`\`` → `<pre><code class="language-js">…</code></pre>`, kein `data-card-style`-Attribut.
- `\`\`\`js recessed\\n…\\n\`\`\`` → `<pre data-card-style="recessed"><code class="language-js">…</code></pre>`.
- `\`\`\`js embossed\\n…\\n\`\`\`` → `<pre data-card-style="embossed"><code class="language-js">…</code></pre>`.
- `\`\`\`recessed\\n…\\n\`\`\`` → `<pre data-card-style="recessed"><code>…</code></pre>` (kein language-class, weil Shiki keine Sprache zum Highlighten hatte).
- `\`\`\`js foobar\\n…\\n\`\`\`` → `<pre><code class="language-js">…</code></pre>` (unbekannter Modifier ignoriert).
- `\`\`\`unknown-lang\\n…\\n\`\`\`` → graceful Fallback (Shiki gibt Plain-Text zurück, kein Error).
- Inline-Code (`` `foo` ``) → `<code>foo</code>` unverändert.

Service-Layer-Tests für `updateManagedContentPageMeta`:

- `contentCardStyle: "default"` akzeptiert.
- `contentCardStyle: "recessed"` akzeptiert.
- `contentCardStyle: "garbage"` → `INVALID_INPUT`.
- `contentCardStyle` weggelassen → existing-Wert bleibt.

### Frontend-Tests

Neue Datei `apps/frontend/src/__tests__/markdown-html.test.tsx` (vitest, jsdom):

- `<MarkdownHtml html='<pre data-card-style="recessed"><code>foo</code></pre>'>` rendert ein `RecessedCard`-Element mit `<pre>`-Child, dessen `data-card-style` nicht mehr im DOM ist.
- Selber Test für `embossed` → `EmbossedCard`.
- `<MarkdownHtml html='<pre><code>foo</code></pre>'>` rendert das `<pre>` direkt, kein Card-Wrap.
- Unbekannter `data-card-style`-Wert (z.B. `"weird"`) → kein Card-Wrap, Attribut entfernt (defensiv).

Component-Level-Tests für `EmbossedOverlayContent`:

- `page.contentCardStyle === "recessed"` und segmented Page → rendert `RecessedCard`-Wrap.
- `page.contentCardStyle === "default"` und segmented Page → rendert ohne `RecessedCard`-Wrap.
- Selbe Matrix für non-segmented Pages.

### Gates

Vor jedem Commit und am Ende der Implementation:

- `npm run lint` (Biome).
- `npm run test --workspace=apps/backend`.
- `npm run test --workspace=apps/dashboard`.
- `npm run test --workspace=apps/frontend` (sofern vitest verdrahtet ist).
- TypeScript: `tsc --noEmit` in jeder der drei Apps und in `packages/shared`.

### Visual-Verification (manuell + chrome-devtools-mcp)

Test-Pages (anlegen via Dashboard):

| `displayMode` | `contentCardStyle` | `pageType` | Erwartung |
|---|---|---|---|
| `fullscreen` | `default` | `default` | Content direkt auf EmbossedCard |
| `fullscreen` | `recessed` | `default` | Content in RecessedCard innerhalb EmbossedCard |
| `fullscreen` | `default` | `segmented` | Content direkt auf EmbossedCard, Segments funktionieren |
| `fullscreen` | `recessed` | `segmented` | Content in RecessedCard, Segments funktionieren (heutiges Default) |
| `embossed` | `default` | `default` | Overlay zeigt Content direkt |
| `embossed` | `recessed` | `default` | Overlay zeigt RecessedCard-Wrap |
| `embossed` | `default` | `segmented` | Overlay-Segments ohne RecessedCard |
| `embossed` | `recessed` | `segmented` | Overlay-Segments mit RecessedCard |
| `translucent` | (egal) | (egal) | TranslucentCard-Rendering, Setting wird ignoriert |

Markdown-Content pro Page mit allen vier Code-Block-Varianten:

````md
```js
// kein Modifier — Default-Look, language-js Highlight
```

```js recessed
// Recessed-Wrap, language-js Highlight
```

```js embossed
// Embossed-Wrap, language-js Highlight
```

```recessed
// keine Sprache, Recessed-Wrap, kein Highlight
```
````

Pro Page verifizieren: Card-Wrap erscheint wie designed, Sprach-Highlight ist da wo erwartet, Layout klippt nicht horizontal.

## Offene Fragen

1. **Latenter Drift bei Migration `0004`.** Lokales File-SHA `61f40afe…` vs. Production-Tracker-Hash `dbccdc8a…`. Nicht blockierend für das neue Feature, aber separat zu adressieren: entweder lokales File auf den Production-Stand revert'en, oder eine Remediation-Migration schreiben. Der Implementation-Plan soll diesen Fix nicht stillschweigend mitnehmen.
2. **Render-Pfad für non-segmented Fullscreen-Page.** `SegmentedPageFullscreen` deckt segmented ab; das Rendering für `displayMode === "fullscreen"` + `pageType === "default"` läuft durch eine andere Component (vermutlich Astro `[slug].astro` oder eine Sibling-React-Komponente). Der Implementation-Plan muss sie lokalisieren und den `contentCardStyle === "recessed"`-Branch dort anwenden.
3. **Embossed-in-embossed Visual.** Wenn ein Code-Block `\`\`\`js embossed` in einer Page nutzt, die selbst auf einer `EmbossedCard` rendert, stapeln sich zwei embossed Surfaces. Das ist gemäß User-Wahl ("ich moechte explizit recessed oder embossed sagen koennen") so beabsichtigt. Falls das visuell zu unruhig wird, könnte ein Follow-up den Inner-Embossed-Gradient dimmen — out of scope für dieses Design.
4. **Shiki-Bundle-Weight im Backend.** Shiki bringt umfangreiche Theme- und Sprach-Daten mit. Backend-Startup-Time und Memory nach dem Dependency-Add prüfen; falls sich das deutlich verschlechtert, auf `shiki/bundle/web` oder ein hand-picked-Sprach-Subset wechseln.

## Verified facts

Alle konkreten Code-Refs in diesem Design sind gegen `HEAD = a6b1246c` am 2026-05-02 grep-/Read-verifiziert:

| Reference | Verified by |
|---|---|
| `apps/backend/src/db/schemas/postgres.ts` → `contentPages` Spalten | `grep -B2 -A40 "contentPages"` |
| `apps/backend/src/services/admin-content.ts:25` `marked.use(markedFootnote, { gfm: true })` | Direct read |
| `apps/backend/src/services/admin-content.ts:51-53` `renderBody` / `marked.parse` | Direct read |
| `apps/backend/src/services/admin-content.ts:81-101` `rowToSummary`-Shape | Direct read |
| `apps/backend/src/services/admin-content.ts:186-247` `updateManagedContentPageMeta` Validation-Block | Direct read |
| `apps/backend/src/services/admin-content.ts:292-373` `getPublicContentPage` (incl. `base`-Literal) | Direct read |
| `apps/backend/src/db/admin-repository.ts:170` `ContentPageMetaUpdate`-Interface | Grep |
| `packages/shared/src/content.ts:29-32` Konstanten (`PAGE_TITLE_ALIGNMENTS`, `PAGE_TYPES`, `PAGE_DISPLAY_MODES`, `OVERLAY_WIDTHS`) | Grep |
| `packages/shared/src/content.ts:79-118` `ContentPageSummary` / `ContentPage` / `PublicContentPage` | Grep |
| `apps/frontend/src/components/layout/PageOverlayContent.tsx:11-37` `MD_TRANSLUCENT` / `MD_EMBOSSED`-Konstanten | Direct read |
| `apps/frontend/src/components/layout/PageOverlayContent.tsx:42-44` `MarkdownHtml` (aktuelle HTML-Injection-Site) | Direct read |
| `apps/frontend/src/components/layout/PageOverlayContent.tsx:119-157` `EmbossedOverlayContent` und `isSegmented`-Branch | Direct read |
| `apps/frontend/src/components/layout/PageOverlayContent.tsx:159-196` `SegmentedPageFullscreen` und `hasSegments`-Branch | Direct read |
| `apps/dashboard/src/features/content/pages/PageDisplaySettings.tsx` (komplette 70 Zeilen) | Direct read |
| `apps/dashboard/src/i18n/messages.ts:491-498, 1218-1223, 1936-1941` `display`-Block (DE + EN + Type) | Grep |
| `apps/dashboard/src/components/ui/Dropdown.tsx` `align?: "start" \| "end"` (Default `"start"`, vorhin in dieser Session ausgeliefert) | Direct read |
| Existierende Migrations: `apps/backend/src/db/migrations/postgres/0000_*.sql` … `0024_*.sql` (25 Files insgesamt) | `ls` |
| Production-Migration-Tracker: 25 Rows, `MAX(id) = 27`, Lücken bei 20/21, Hash-Mismatch bei `0004` | Live `psql`-Query gegen die restored-local-DB (= Production-State) |
| `marked-footnote` bereits in `apps/backend/package.json` | Grep |
| `marked-highlight` und `shiki` NICHT vorhanden — neue Dependencies | Grep |
| `html-react-parser` NICHT vorhanden in `apps/frontend/package.json` — neue Dependency | Grep |

- [ ] Alle Code-Referenzen verifiziert (Funktionen, Scripts, Pfade, Env-Vars, Package-Manager-Befehle)
