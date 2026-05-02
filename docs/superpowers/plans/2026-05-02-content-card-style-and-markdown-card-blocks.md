# Content Card Style + Markdown-Code-Block-Card-Wrapping — Implementation-Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Page-Editor erlaubt pro Page (im `embossed`/`fullscreen`-Modus) zwischen direkter Darstellung und `RecessedCard`-Wrap zu wählen; Markdown-Code-Blöcke können per Modifier `recessed` oder `embossed` in die jeweilige Card-Component gewrappt werden, mit serverseitigem Syntax-Highlighting via Shiki.

**Architecture:** Neue Spalte `content_card_style` auf `content_pages` fließt durch Backend-Service in den Public-Page-Response und steuert im Frontend (`PageOverlayContent.tsx` plus Astro-Pfade `[shortId].astro` + `DeferredShareContent.astro`) den `RecessedCard`-Wrap. Backend `marked` bekommt einen Custom-Code-Renderer plus `marked-highlight` + Shiki; das `<pre>`-Element trägt ein `data-card-style`-Sentinel. Frontend `MarkdownHtml` wird auf `html-react-parser` umgestellt und ersetzt sentinel-Pres durch `RecessedCard`/`EmbossedCard`-Components. Astro-Inline-`set:html`-Stellen werden auf die React-Island-Variante umgestellt, weil die Card-Wrapping-Logik im React-Layer lebt.

**Tech Stack:** TypeScript, Drizzle ORM (postgres), Fastify, marked v17, neu: `marked-highlight` + `shiki` (Backend) + `html-react-parser` (Frontend). Tests via vitest. Workspace package manager: npm.

---

## Status

**Implementation-Plan ready 2026-05-02** — basiert auf der approved Spec `docs/superpowers/specs/2026-05-02-content-card-style-and-markdown-card-blocks-design.md`. Alle Code-Refs sind grep-/Read-verifiziert gegen `HEAD = a6b1246c`.

## Pre-flight Checks

Bevor irgendein Code geändert wird, einmal ablaufen:

- [ ] **PF-1:** `git status` — Working-Tree sauber. Falls dirty, erst aufräumen oder stashen.
- [ ] **PF-2:** `git rev-parse --short HEAD` zeigt `a6b1246c` oder weiter. Falls weiter, kurzen `git log a6b1246c..HEAD --oneline` prüfen, ob neue Migrations-Files / shared-Type-Änderungen reingerutscht sind. Falls 0025 schon belegt, neue Filename-Nummer wählen.
- [ ] **PF-3:** Lokale DB-Migrations-Tracker spiegeln Production: `PGPASSWORD=dev-password-local-only psql -h localhost -p 5433 -U musiccloud -d musiccloud -c "SELECT MAX(id), COUNT(*) FROM drizzle.__drizzle_migrations;"` muss `max=27, count=25` zeigen. Falls nicht, erst `/db-dump` laufen lassen.
- [ ] **PF-4:** Local file SHA-Drift bei `0004_broad_wild_pack.sql` ist bekannt (lokal `61f40afe`, prod `dbccdc8a`). NICHT in diesem Plan fixen — separates Issue (Spec-Open-Question 1).

## File Structure

Neu erstellt:

- `apps/backend/src/db/migrations/postgres/0025_content_card_style.sql` — Migration ADD COLUMN.
- `apps/backend/src/db/migrations/postgres/meta/0025_snapshot.json` — Drizzle-Snapshot (auto-generated).
- `apps/backend/src/services/__tests__/marked-renderer.test.ts` — Custom-Renderer + Modifier-Parser-Tests.
- `apps/frontend/src/__tests__/markdown-html.test.tsx` — `html-react-parser` Replace-Handler Tests.

Modifiziert:

- `apps/backend/src/db/schemas/postgres.ts` — Spalte `contentCardStyle` auf `contentPages`.
- `apps/backend/src/db/migrations/postgres/meta/_journal.json` — Eintrag für 0025 (auto).
- `apps/backend/src/db/admin-repository.ts` — `ContentPageMetaUpdate.contentCardStyle?` plus Update-Query.
- `apps/backend/src/services/admin-content.ts` — Mapping in `rowToSummary`/`getPublicContentPage`, Validation in `updateManagedContentPageMeta`, marked-Setup mit Custom-Renderer + Shiki.
- `apps/backend/package.json` — neue deps `marked-highlight`, `shiki`.
- `packages/shared/src/content.ts` — `ContentCardStyle`, `CONTENT_CARD_STYLES`, Felder auf `ContentPageSummary`/`PublicContentPage`.
- `apps/frontend/src/components/layout/PageOverlayContent.tsx` — `MarkdownHtml` mit `html-react-parser`, `EmbossedOverlayContent`/`SegmentedPageFullscreen` lesen `contentCardStyle`, erweiterte `MD_EMBOSSED`/`MD_TRANSLUCENT`-CSS.
- `apps/frontend/src/components/share/DeferredShareContent.astro` — fullscreen-Branch nutzt `MarkdownHtml`-React-Island statt `<article set:html>`.
- `apps/frontend/src/pages/[shortId].astro` — gleicher Umbau im Bot-Pfad.
- `apps/frontend/package.json` — neue dep `html-react-parser`.
- `apps/dashboard/src/features/content/pages/PageDisplaySettings.tsx` — dritter Picker.
- `apps/dashboard/src/i18n/messages.ts` — DE + EN Strings für `contentCardStyle`/`cardStyleDefault`/`cardStyleRecessed`.

---

## Implementation

11 Tasks. Tasks 1-6 ziehen Feature 1 durch (Page-Setting). Tasks 7-10 ziehen Feature 2 durch (Markdown-Pipeline). Task 11 ist Visual-Verification.

Jeder Task ist self-contained und committable. TDD: failing Test zuerst, Implementation danach.

---

### Task 1: Migration 0025 + Drizzle-Schema-Spalte

**Files:**
- Create: `apps/backend/src/db/migrations/postgres/0025_content_card_style.sql`
- Modify: `apps/backend/src/db/schemas/postgres.ts` (`contentPages`-Block, nach Zeile mit `overlayWidth`)
- Auto-generated by drizzle-kit: `apps/backend/src/db/migrations/postgres/meta/0025_snapshot.json`, `_journal.json`-Eintrag

- [ ] **Step 1: Schema-Spalte hinzufügen**

In `apps/backend/src/db/schemas/postgres.ts` innerhalb des `contentPages`-Blocks, direkt nach der `overlayWidth`-Zeile:

```ts
contentCardStyle: text("content_card_style").notNull().default("recessed"),
```

- [ ] **Step 2: Migration generieren**

```bash
npm run db:generate
```

Erwartet: drizzle-kit erstellt `apps/backend/src/db/migrations/postgres/0025_<slug>.sql` plus `meta/0025_snapshot.json` und appended einen Journal-Eintrag.

Falls der Slug nicht `0025_content_card_style.sql` heißt: per `git mv` umbenennen, plus den `tag`-Wert im `_journal.json` von `"0025_<slug>"` auf `"0025_content_card_style"` korrigieren.

- [ ] **Step 3: Migration-SQL prüfen / korrigieren**

Erwartet (kann als Referenz dienen, falls drizzle-kit was anderes generiert):

```sql
ALTER TABLE "content_pages"
  ADD COLUMN "content_card_style" text DEFAULT 'recessed' NOT NULL;
```

Reihenfolge `DEFAULT … NOT NULL` ist Postgres-konform und füllt existierende Rows automatisch. Keine manuelle Backfill-`UPDATE` nötig.

- [ ] **Step 4: Migration ausführen**

```bash
npm run db:migrate
```

Erwartet: keine Fehler. Verify:

```bash
PGPASSWORD=dev-password-local-only /opt/homebrew/Cellar/libpq/18.2/bin/psql \
  -h localhost -p 5433 -U musiccloud -d musiccloud \
  -c "\d content_pages" | grep content_card_style
```

Erwartet: `content_card_style | text | | not null | 'recessed'::text`.

- [ ] **Step 5: Verify, dass alle bestehenden Rows den Default haben**

```bash
PGPASSWORD=dev-password-local-only /opt/homebrew/Cellar/libpq/18.2/bin/psql \
  -h localhost -p 5433 -U musiccloud -d musiccloud \
  -c "SELECT content_card_style, COUNT(*) FROM content_pages GROUP BY 1;"
```

Erwartet: nur eine Zeile, `content_card_style = recessed`, `count = <Anzahl bestehender Pages>`.

- [ ] **Step 6: Commit**

```bash
git add apps/backend/src/db/schemas/postgres.ts \
        apps/backend/src/db/migrations/postgres/0025_content_card_style.sql \
        apps/backend/src/db/migrations/postgres/meta/0025_snapshot.json \
        apps/backend/src/db/migrations/postgres/meta/_journal.json
git commit -m "Feat: Add content_card_style column to content_pages

- New text column with values 'default' | 'recessed', NOT NULL DEFAULT 'recessed'.
- ADD COLUMN backfills existing rows to 'recessed' so segmented pages keep their current Inner-RecessedCard look post-migration.
- Drizzle schema and snapshot updated."
```

---

### Task 2: Shared Types — `ContentCardStyle`

**Files:**
- Modify: `packages/shared/src/content.ts:29-118`

- [ ] **Step 1: Constant + Type ergänzen**

Nach Zeile 32 (`OVERLAY_WIDTHS`-Konstante) einfügen:

```ts
export type ContentCardStyle = "default" | "recessed";
export const CONTENT_CARD_STYLES: readonly ContentCardStyle[] = ["default", "recessed"] as const;
```

- [ ] **Step 2: Feld in `ContentPageSummary` ergänzen**

Im Block (Zeile 79-95) nach der `overlayWidth: OverlayWidth;`-Zeile:

```ts
contentCardStyle: ContentCardStyle;
```

- [ ] **Step 3: Feld in `PublicContentPage` ergänzen**

Im Block (Zeile 111-118) nach der `overlayWidth: OverlayWidth;`-Zeile:

```ts
contentCardStyle: ContentCardStyle;
```

`ContentPage` erbt das Feld via `extends ContentPageSummary` (Zeile 96).

- [ ] **Step 4: Typecheck**

```bash
npx tsc --noEmit -p packages/shared/tsconfig.json
```

Erwartet: kein Output (= grün). Falls Fehler in Backend/Frontend wegen fehlender Feld-Werte: das ist erwartet, wird in Task 3 (Backend) und Task 4 (Frontend) gefixt — Workspace-Typecheck überspringt diesen Schritt.

- [ ] **Step 5: Commit**

```bash
git add packages/shared/src/content.ts
git commit -m "Feat: Shared ContentCardStyle type + CONTENT_CARD_STYLES constant

- New type 'default' | 'recessed' added to packages/shared.
- Field contentCardStyle added to ContentPageSummary and PublicContentPage; ContentPage inherits via extends."
```

---

### Task 3: Backend — Repo, Service, Validation

**Files:**
- Modify: `apps/backend/src/db/admin-repository.ts:170` (`ContentPageMetaUpdate`-Interface) plus `updateContentPageMeta`-Implementierung
- Modify: `apps/backend/src/services/admin-content.ts` — `rowToSummary` (Zeile 81-101), `updateManagedContentPageMeta` (Zeile 186-247), `getPublicContentPage`-Base-Literal (Zeile 310-)
- Test: vitest run für Backend

- [ ] **Step 1: Failing test schreiben**

In `apps/backend/src/services/__tests__/admin-content.test.ts` (vermutlich existiert; falls nicht, neu anlegen) ans Ende des `describe("updateManagedContentPageMeta", …)`-Blocks anhängen:

```ts
it("rejects invalid contentCardStyle", async () => {
  const result = await updateManagedContentPageMeta("any-slug", { contentCardStyle: "garbage" as never });
  expect(result.ok).toBe(false);
  if (!result.ok) {
    expect(result.code).toBe("INVALID_INPUT");
    expect(result.message).toMatch(/contentCardStyle/i);
  }
});

it("accepts contentCardStyle 'default' and 'recessed'", async () => {
  const repo = await getAdminRepository();
  await repo.createContentPage({ slug: "card-style-test", title: "x", createdBy: null });

  const a = await updateManagedContentPageMeta("card-style-test", { contentCardStyle: "default" });
  expect(a.ok).toBe(true);

  const b = await updateManagedContentPageMeta("card-style-test", { contentCardStyle: "recessed" });
  expect(b.ok).toBe(true);

  await repo.deleteContentPage("card-style-test");
});
```

(Falls die existierende Test-Datei keine getRepo-Setup-Helper nutzt, an die existierenden Tests anpassen — gleiche Struktur.)

- [ ] **Step 2: Run failing tests**

```bash
npm run test:run --workspace=apps/backend -- admin-content
```

Erwartet: FAIL — `contentCardStyle` ist im `ContentPageMetaUpdate`-Type nicht erlaubt (TS-Error) ODER Validation-Fehler weil das Feld noch nicht geprüft wird.

- [ ] **Step 3: `ContentPageMetaUpdate` erweitern**

In `apps/backend/src/db/admin-repository.ts:170` im `interface ContentPageMetaUpdate` ergänzen:

```ts
contentCardStyle?: ContentCardStyle;
```

Plus den Import oben:

```ts
import type { ContentCardStyle } from "@musiccloud/shared";
```

(Falls `ContentCardStyle` nicht schon mit anderen `import type`-Statements importiert wird; ggf. an existierenden Block anhängen.)

- [ ] **Step 4: `updateContentPageMeta`-Implementierung**

Im selben File die `updateContentPageMeta`-Funktion finden und das `contentCardStyle`-Feld in den `set`-Block der UPDATE-Query aufnehmen, parallel zu den anderen optional-Feldern:

```ts
...(data.contentCardStyle !== undefined ? { contentCardStyle: data.contentCardStyle } : {}),
```

(Exakte Syntax hängt vom existierenden Pattern ab — gleiches Muster wie `displayMode`/`overlayWidth` im selben Block.)

- [ ] **Step 5: Validation in `admin-content.ts` ergänzen**

In `apps/backend/src/services/admin-content.ts` den Import oben erweitern:

```ts
import { ..., CONTENT_CARD_STYLES, ... } from "@musiccloud/shared";
```

Plus den Type-Import:

```ts
import type { ..., ContentCardStyle, ... } from "@musiccloud/shared";
```

Innerhalb `updateManagedContentPageMeta`, parallel zu der `displayMode`/`overlayWidth`-Validation (rund um Zeile 205-213), neuen Block ergänzen:

```ts
if (data.contentCardStyle !== undefined && !isOneOf(CONTENT_CARD_STYLES, data.contentCardStyle))
  return { ok: false, code: "INVALID_INPUT", message: "contentCardStyle invalid" };
```

- [ ] **Step 6: Mapping in `rowToSummary`**

In `rowToSummary` (Zeile 81-101) nach der `overlayWidth: row.overlayWidth,`-Zeile einfügen:

```ts
contentCardStyle: row.contentCardStyle,
```

- [ ] **Step 7: Mapping in `getPublicContentPage`**

In `getPublicContentPage` im `base`-Literal (rund um Zeile 310-320) nach der `overlayWidth: row.overlayWidth,`-Zeile einfügen:

```ts
contentCardStyle: row.contentCardStyle,
```

- [ ] **Step 8: Run tests, ensure pass**

```bash
npm run test:run --workspace=apps/backend -- admin-content
```

Erwartet: PASS für die zwei neuen Tests, plus alle existing tests bleiben grün.

- [ ] **Step 9: Vollständigen Backend-Test-Lauf**

```bash
npm run test:run --workspace=apps/backend
```

Erwartet: alle existierenden Tests grün (vorher 890/890 grün, jetzt 892/892).

- [ ] **Step 10: Lint + Typecheck**

```bash
npm run lint --workspace=apps/backend
npx tsc --noEmit -p apps/backend/tsconfig.json
```

Erwartet: keine Fehler.

- [ ] **Step 11: Commit**

```bash
git add apps/backend/src/db/admin-repository.ts apps/backend/src/services/admin-content.ts apps/backend/src/services/__tests__/admin-content.test.ts
git commit -m "Feat: Backend service + repo support for contentCardStyle

- ContentPageMetaUpdate accepts optional contentCardStyle field; updateContentPageMeta query writes it.
- updateManagedContentPageMeta validates value against CONTENT_CARD_STYLES.
- rowToSummary and getPublicContentPage now map contentCardStyle through to clients.
- Two new tests cover validation and round-trip update."
```

---

### Task 4: Frontend Render-Pfad — `PageOverlayContent.tsx`

**Files:**
- Modify: `apps/frontend/src/components/layout/PageOverlayContent.tsx:119-196` (`EmbossedOverlayContent` + `SegmentedPageFullscreen`)

- [ ] **Step 1: `EmbossedOverlayContent` umbauen**

In `apps/frontend/src/components/layout/PageOverlayContent.tsx` Zeile 142-154 (der `EmbossedCard.Body`-Block) ersetzen:

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

Das `key={…}` für den segmented-Re-Mount bleibt erhalten.

- [ ] **Step 2: `SegmentedPageFullscreen` umbauen**

In Zeile 183-193 (der `EmbossedCard.Body`-Block der `SegmentedPageFullscreen`-Funktion) ersetzen:

```tsx
<EmbossedCard.Body className="p-3">
  {page.contentCardStyle === "recessed" ? (
    <RecessedCard className="px-6 py-6">
      <MarkdownHtml key={`seg-${segmented.activeIndex}`} html={html} className={MD_EMBOSSED} />
    </RecessedCard>
  ) : (
    <div className="px-6 py-6">
      <MarkdownHtml html={html} className={MD_EMBOSSED} />
    </div>
  )}
</EmbossedCard.Body>
```

- [ ] **Step 3: Typecheck**

```bash
npx tsc --noEmit -p apps/frontend/tsconfig.json
```

Erwartet: kein Output (Shared-Type ist seit Task 2 da).

- [ ] **Step 4: Lint**

```bash
npm run lint --workspace=apps/frontend
```

Erwartet: keine Fehler.

- [ ] **Step 5: Commit**

```bash
git add apps/frontend/src/components/layout/PageOverlayContent.tsx
git commit -m "Feat: PageOverlayContent reads contentCardStyle for RecessedCard wrap

- EmbossedOverlayContent and SegmentedPageFullscreen now decide RecessedCard wrap based on page.contentCardStyle === 'recessed' instead of pageType === 'segmented'.
- Wrap is decoupled from segmented/non-segmented; segmented pages keep their current look because the migration default is 'recessed'."
```

---

### Task 5: Astro-Pfade — Fullscreen non-segmented umstellen

**Files:**
- Modify: `apps/frontend/src/pages/[shortId].astro` (Zeilen 186-213, Bot-Pfad)
- Modify: `apps/frontend/src/components/share/DeferredShareContent.astro` (Zeilen 124-146, normaler Pfad)
- Modify: `apps/frontend/src/components/layout/PageOverlayContent.tsx` — `MarkdownHtml` exportieren (heute nicht exportiert)

- [ ] **Step 1: `MarkdownHtml` aus `PageOverlayContent.tsx` exportieren**

In Zeile 42 das `function MarkdownHtml` durch `export function MarkdownHtml` ersetzen — damit die Astro-Imports funktionieren.

- [ ] **Step 2: Bot-Pfad in `[shortId].astro` umstellen**

In `apps/frontend/src/pages/[shortId].astro` Zeilen 202-211 (im fullscreen-Branch des `treatAsBot`-Pfads) den nicht-segmented Zweig umstellen.

Aktuell:

```astro
{contentPage.pageType === "segmented" ? (
  <SegmentedPageFullscreen client:load page={contentPage} />
) : (
  <article class="prose prose-invert max-w-none" set:html={contentPage.contentHtml} />
)}
```

Neu:

```astro
{contentPage.pageType === "segmented" ? (
  <SegmentedPageFullscreen client:load page={contentPage} />
) : contentPage.contentCardStyle === "recessed" ? (
  <RecessedCard client:load className="px-6 py-6">
    <MarkdownHtml client:load html={contentPage.contentHtml} className="prose prose-invert max-w-none" />
  </RecessedCard>
) : (
  <MarkdownHtml client:load html={contentPage.contentHtml} className="prose prose-invert max-w-none" />
)}
```

Plus die Imports oben in der `[shortId].astro` (zu den existierenden `import { SegmentedPageFullscreen } from "@/components/layout/PageOverlayContent";` ergänzen):

```astro
import { MarkdownHtml } from "@/components/layout/PageOverlayContent";
import { RecessedCard } from "@/components/cards/RecessedCard";
```

- [ ] **Step 3: Browser-Pfad in `DeferredShareContent.astro` analog umstellen**

In `apps/frontend/src/components/share/DeferredShareContent.astro` Zeilen 140-144 ersetzen.

Aktuell:

```astro
{contentPage.pageType === "segmented" ? (
  <SegmentedPageFullscreen client:load page={contentPage} />
) : (
  <article class="prose prose-invert max-w-none" set:html={contentPage.contentHtml} />
)}
```

Neu (gleiche Logik wie Step 2):

```astro
{contentPage.pageType === "segmented" ? (
  <SegmentedPageFullscreen client:load page={contentPage} />
) : contentPage.contentCardStyle === "recessed" ? (
  <RecessedCard client:load className="px-6 py-6">
    <MarkdownHtml client:load html={contentPage.contentHtml} className="prose prose-invert max-w-none" />
  </RecessedCard>
) : (
  <MarkdownHtml client:load html={contentPage.contentHtml} className="prose prose-invert max-w-none" />
)}
```

Plus dieselben Imports (`MarkdownHtml`, `RecessedCard`) ergänzen, falls noch nicht da.

- [ ] **Step 4: Build prüfen**

```bash
npm run build --workspace=apps/frontend
```

Erwartet: build success. Falls `MarkdownHtml` als named export nicht aufgelöst wird, Step 1 erneut prüfen.

- [ ] **Step 5: Lint**

```bash
npm run lint --workspace=apps/frontend
```

- [ ] **Step 6: Commit**

```bash
git add apps/frontend/src/pages/[shortId].astro \
        apps/frontend/src/components/share/DeferredShareContent.astro \
        apps/frontend/src/components/layout/PageOverlayContent.tsx
git commit -m "Feat: Fullscreen non-segmented pages honor contentCardStyle in Astro paths

- Replaced inline <article set:html=...> with MarkdownHtml React island so the same component owns markdown rendering across all paths.
- contentCardStyle === 'recessed' wraps the island in RecessedCard.
- Applied to both the bot path ([shortId].astro) and the deferred browser path (DeferredShareContent.astro)."
```

---

### Task 6: Dashboard Picker + i18n

**Files:**
- Modify: `apps/dashboard/src/features/content/pages/PageDisplaySettings.tsx`
- Modify: `apps/dashboard/src/i18n/messages.ts:491-498, 1218-1223, 1936-1941`
- Modify: `apps/dashboard/src/shared/contracts/admin-content.ts` (oder wo immer `ContentPageMetaUpdate` clientseitig lebt)

- [ ] **Step 1: i18n-Type erweitern**

In `apps/dashboard/src/i18n/messages.ts:491-498` (der `display`-Block in der Type-Definition) ergänzen, parallel zu `displayMode`:

```ts
contentCardStyle: string;
cardStyleDefault: string;
cardStyleRecessed: string;
```

- [ ] **Step 2: DE-Übersetzung**

Im DE-Block (rund um Zeile 1218-1223) ergänzen:

```ts
contentCardStyle: "Card-Stil",
cardStyleDefault: "Direkt",
cardStyleRecessed: "Recessed",
```

- [ ] **Step 3: EN-Übersetzung**

Im EN-Block (rund um Zeile 1936-1941) ergänzen:

```ts
contentCardStyle: "Card style",
cardStyleDefault: "Direct",
cardStyleRecessed: "Recessed",
```

- [ ] **Step 4: Dashboard-Contract-Type erweitern**

`grep -rn "ContentPageMetaUpdate\|contentCardStyle" apps/dashboard/src --include="*.ts"` — finde die Stelle, wo der Update-Patch-Typ clientseitig deklariert ist (typischerweise `apps/dashboard/src/shared/contracts/admin-content.ts`). Falls dort Felder wie `displayMode?`, `overlayWidth?` aufgezählt sind, ergänzen:

```ts
contentCardStyle?: ContentCardStyle;
```

Plus Import von `@musiccloud/shared`. Falls der Type rein structural ist (z.B. `Partial<…>` mit ungeschütztem any), reicht der Spread-Pattern in `handlePatch` und nichts ist zu tun. Verify durch Grep + kurzes Lesen.

- [ ] **Step 5: Picker im `PageDisplaySettings.tsx` ergänzen**

In `apps/dashboard/src/features/content/pages/PageDisplaySettings.tsx`:

Imports oben:

```ts
import { CONTENT_CARD_STYLES, type ContentCardStyle, OVERLAY_WIDTHS, ... } from "@musiccloud/shared";
```

Props-Interface ergänzen:

```ts
interface Props {
  displayMode: PageDisplayMode;
  overlayWidth: OverlayWidth;
  contentCardStyle: ContentCardStyle;
  onChange: (
    patch: Partial<{
      displayMode: PageDisplayMode;
      overlayWidth: OverlayWidth;
      contentCardStyle: ContentCardStyle;
    }>,
  ) => void;
}
```

In der Render-Funktion vor der schließenden `</div>` einen weiteren Picker hinzufügen, mit Sichtbarkeits-Bedingung `displayMode !== "translucent"`:

```tsx
const isCardStyleVisible = displayMode !== "translucent";
const cardStyleLabels: Record<ContentCardStyle, string> = {
  default: labels.cardStyleDefault,
  recessed: labels.cardStyleRecessed,
};

// ... innerhalb des return-Blocks, nach dem isOverlay-Picker:
{isCardStyleVisible && (
  <Picker<ContentCardStyle>
    label={labels.contentCardStyle}
    value={contentCardStyle}
    options={CONTENT_CARD_STYLES.map((s) => ({ value: s, label: cardStyleLabels[s] }))}
    onChange={(v) => onChange({ contentCardStyle: v })}
  />
)}
```

- [ ] **Step 6: `ContentEditorPage` anpassen**

In `apps/dashboard/src/features/content/pages/ContentEditorPage.tsx` rund um Zeile 770+ (wo `<PageDisplaySettings>` gerendert wird) das neue Prop weiterreichen:

```tsx
<PageDisplaySettings
  displayMode={page.displayMode}
  overlayWidth={page.overlayWidth}
  contentCardStyle={page.contentCardStyle}
  onChange={(patch) => void handlePatch(patch)}
/>
```

`handlePatch` ist Spread-basiert, also keine separate Anpassung nötig solange das Feld im Patch-Type erlaubt ist (Step 4).

- [ ] **Step 7: Typecheck**

```bash
npx tsc --noEmit -p apps/dashboard/tsconfig.json
```

Erwartet: kein Output.

- [ ] **Step 8: Lint**

```bash
npm run lint --workspace=apps/dashboard
```

- [ ] **Step 9: Visual smoke test**

Dashboard im Browser öffnen (`http://localhost:4001`), eine bestehende Page öffnen. Verifizieren:

- Bei `displayMode = embossed` oder `fullscreen`: Card-Stil-Picker sichtbar, Werte `Direkt` / `Recessed`.
- Bei `displayMode = translucent`: Card-Stil-Picker NICHT sichtbar.
- Picker-Auswahl wechselt → Klick auf "Speichern" → Reload → Wert bleibt.

- [ ] **Step 10: Commit**

```bash
git add apps/dashboard/src/features/content/pages/PageDisplaySettings.tsx \
        apps/dashboard/src/features/content/pages/ContentEditorPage.tsx \
        apps/dashboard/src/i18n/messages.ts \
        apps/dashboard/src/shared/contracts/admin-content.ts
git commit -m "Feat: Dashboard PageDisplaySettings adds contentCardStyle picker

- Third picker shown for displayMode in {fullscreen, embossed}; hidden for translucent.
- DE/EN strings for 'Card style' / 'Direct' / 'Recessed'.
- Patch flows through the existing handlePatch spread."
```

---

### Task 7: Backend Markdown Custom-Renderer (ohne Shiki)

**Files:**
- Create: `apps/backend/src/services/__tests__/marked-renderer.test.ts`
- Modify: `apps/backend/src/services/admin-content.ts:22-25` (marked-Setup)

- [ ] **Step 1: Failing Tests schreiben**

`apps/backend/src/services/__tests__/marked-renderer.test.ts` neu anlegen:

```ts
import { describe, expect, it } from "vitest";

// renderBody is module-private in admin-content.ts. We re-import marked
// directly with the same setup so the test exercises the renderer chain.
// Alternative: export renderBody for tests; chosen here to avoid widening
// the module's public API.
import { marked } from "marked";

describe("marked custom code renderer", () => {
  it("emits language class for plain ```js block", () => {
    const out = marked.parse("```js\nconst x = 1;\n```", { async: false }) as string;
    expect(out).toMatch(/<pre>(?:<code class="language-js">)/);
    expect(out).not.toContain("data-card-style");
  });

  it("emits data-card-style='recessed' for ```js recessed block", () => {
    const out = marked.parse("```js recessed\nconst x = 1;\n```", { async: false }) as string;
    expect(out).toMatch(/<pre data-card-style="recessed">/);
    expect(out).toContain('class="language-js"');
  });

  it("emits data-card-style='embossed' for ```js embossed block", () => {
    const out = marked.parse("```js embossed\nconst x = 1;\n```", { async: false }) as string;
    expect(out).toMatch(/<pre data-card-style="embossed">/);
    expect(out).toContain('class="language-js"');
  });

  it("emits data-card-style without language for ```recessed block", () => {
    const out = marked.parse("```recessed\nplain text\n```", { async: false }) as string;
    expect(out).toMatch(/<pre data-card-style="recessed">/);
    expect(out).not.toContain('class="language-');
  });

  it("ignores unknown modifier (```js foobar treated as ```js)", () => {
    const out = marked.parse("```js foobar\nconst x = 1;\n```", { async: false }) as string;
    expect(out).toContain('class="language-js"');
    expect(out).not.toContain("data-card-style");
  });

  it("inline code stays unchanged", () => {
    const out = marked.parse("hello `foo` world", { async: false }) as string;
    expect(out).toContain("<code>foo</code>");
    expect(out).not.toContain("data-card-style");
  });
});
```

WICHTIG: damit dieser Test läuft, muss `admin-content.ts` (oder ein neuer Modul, der das marked-Setup zentralisiert) importiert sein, weil `marked.use(...)` global wirkt. Im Test File oben einfügen:

```ts
import "../admin-content.js"; // forces marked.use(...) side effect
```

- [ ] **Step 2: Run failing tests**

```bash
npm run test:run --workspace=apps/backend -- marked-renderer
```

Erwartet: FAIL — alle 6 Tests, weil der Custom-Renderer noch nicht da ist.

- [ ] **Step 3: Custom-Renderer implementieren**

In `apps/backend/src/services/admin-content.ts` den Header-Block (Zeile 22-25) ersetzen.

Aktuell:

```ts
import { marked } from "marked";
import markedFootnote from "marked-footnote";

marked.use(markedFootnote(), { gfm: true });
```

Neu:

```ts
import { marked } from "marked";
import markedFootnote from "marked-footnote";

const KNOWN_CARD_MODIFIERS = new Set(["recessed", "embossed"] as const);
type CardModifier = "recessed" | "embossed";

function parseLangAndModifier(raw: string): { lang: string | null; modifier: CardModifier | null } {
  const tokens = raw.trim().split(/\s+/).filter(Boolean);
  let modifier: CardModifier | null = null;
  let lang: string | null = null;
  for (const t of tokens) {
    if (KNOWN_CARD_MODIFIERS.has(t as CardModifier)) modifier = t as CardModifier;
    else if (lang === null) lang = t;
  }
  return { lang, modifier };
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

marked.use(markedFootnote(), { gfm: true });

marked.use({
  renderer: {
    code(code, infostring) {
      const { lang, modifier } = parseLangAndModifier(infostring ?? "");
      const attr = modifier ? ` data-card-style="${modifier}"` : "";
      const langClass = lang ? ` class="language-${escapeHtml(lang)}"` : "";
      // For Task 7 we don't yet highlight — Shiki is added in Task 8.
      // Plain escape keeps the body markup-safe.
      return `<pre${attr}><code${langClass}>${escapeHtml(code)}</code></pre>\n`;
    },
  },
});
```

Achtung: marked v17 ruft den `code`-Renderer mit Argumenten `(code: string, infostring: string | undefined, escaped: boolean)` auf. Die Signatur exakt prüfen via `node_modules/marked/lib/marked.d.ts` (oder Bundle), falls TypeScript meckert. Falls die marked-API eine `Renderer`-Klasse erwartet, das Pattern aus `apps/backend/src/services/email-renderer.ts:1` als Referenz nehmen.

- [ ] **Step 4: Run tests, ensure pass**

```bash
npm run test:run --workspace=apps/backend -- marked-renderer
```

Erwartet: PASS für alle 6 Tests.

- [ ] **Step 5: Run full backend suite**

```bash
npm run test:run --workspace=apps/backend
```

Erwartet: alle existierenden Tests bleiben grün.

- [ ] **Step 6: Lint + Typecheck**

```bash
npm run lint --workspace=apps/backend
npx tsc --noEmit -p apps/backend/tsconfig.json
```

- [ ] **Step 7: Commit**

```bash
git add apps/backend/src/services/admin-content.ts apps/backend/src/services/__tests__/marked-renderer.test.ts
git commit -m "Feat: Custom marked renderer emits data-card-style sentinel

- ```js recessed and ```js embossed code-fences map to <pre data-card-style='...'><code class='language-js'>...
- ```recessed (no language) yields <pre data-card-style='recessed'><code>...
- Unknown modifiers fall back to plain ```lang behavior.
- Six tests covering happy-path, error-path, and inline-code untouched."
```

---

### Task 8: Shiki Syntax-Highlighting

**Files:**
- Modify: `apps/backend/package.json` (deps)
- Modify: `apps/backend/src/services/admin-content.ts` (marked-Setup)
- Test: erweiterte vitest-Tests

- [ ] **Step 1: Dependencies installieren**

```bash
npm install --workspace=apps/backend marked-highlight shiki
```

Erwartet: `apps/backend/package.json` listet beide jetzt unter `dependencies`. Lockfile aktualisiert.

- [ ] **Step 2: Tests erweitern**

In `apps/backend/src/services/__tests__/marked-renderer.test.ts` ans Ende des `describe`-Blocks anhängen:

```ts
it("highlights ```js with shiki tokens", async () => {
  // shiki async path: marked-highlight resolves through marked.parse(async)
  // our renderer setup uses sync parse, but shiki needs async — adjust if
  // marked-highlight enforces async.
  const out = marked.parse("```js\nconst x = 1;\n```", { async: false }) as string;
  // Shiki output uses inline color styles
  expect(out).toMatch(/<span style="color:/);
});

it("falls back to plain text for unknown language", () => {
  const out = marked.parse("```nonexistent-lang\nplain\n```", { async: false }) as string;
  // Should not throw; either no spans or just an outer wrapper without color spans
  expect(out).toContain("<pre");
  expect(out).toContain("plain");
});
```

- [ ] **Step 3: Run failing tests**

```bash
npm run test:run --workspace=apps/backend -- marked-renderer
```

Erwartet: zwei neue FAIL.

- [ ] **Step 4: marked-highlight + shiki einbauen**

In `apps/backend/src/services/admin-content.ts`:

Imports oben ergänzen:

```ts
import { markedHighlight } from "marked-highlight";
import { codeToHtml } from "shiki";
```

Vor dem existierenden `marked.use({ renderer: ... })` (aus Task 7) den `markedHighlight`-Block einfügen:

```ts
marked.use(
  markedHighlight({
    async: true,
    async highlight(code, lang) {
      if (!lang) return escapeHtml(code); // no language → plain escaped text
      try {
        // Shiki returns full <pre><code>... wrapper. We only want the inner
        // highlighted spans, so we strip the wrapper here and let our own
        // renderer (below) decide on attributes.
        const html = await codeToHtml(code, { lang, theme: "vitesse-dark" });
        // Extract inner of <code>...</code>
        const m = html.match(/<code[^>]*>([\s\S]*?)<\/code>/);
        return m ? m[1] : escapeHtml(code);
      } catch {
        // Unknown language: shiki throws; fall back to plain escaped text.
        return escapeHtml(code);
      }
    },
  }),
);
```

ACHTUNG: `markedHighlight` mit `async: true` bedeutet, dass `marked.parse(content, { async: false })` jetzt nicht mehr funktioniert. `renderBody` muss umgestellt werden auf:

```ts
async function renderBody(content: string): Promise<string> {
  return marked.parse(content, { async: true }) as Promise<string>;
}
```

Plus alle Caller von `renderBody` werden async — `getPublicContentPage` muss `await` nutzen:

```ts
contentHtml: await renderBody(resolvedContent),
```

Ist bereits in einer `async function`, daher unproblematisch. Plus die `segments`-Map (Zeile 354-369) wird zu einem `Promise.all`:

```ts
const segments: PublicPageSegment[] = await Promise.all(
  segmentRows
    .filter((s) => bySlug.has(s.targetSlug))
    .map(async (s) => {
      const t = bySlug.get(s.targetSlug)!;
      const tx = targetTranslations.get(s.targetSlug);
      const resolvedSegLabel = segmentTranslationsBySegmentId.get(s.id) ?? s.label;
      const resolvedSegTitle = tx ? tx.title : t.title;
      const resolvedSegContent = tx ? tx.content : t.content;
      return {
        label: resolvedSegLabel,
        targetSlug: s.targetSlug,
        title: resolvedSegTitle,
        showTitle: t.showTitle,
        content: resolvedSegContent,
        contentHtml: await renderBody(resolvedSegContent),
      };
    }),
);
```

- [ ] **Step 5: Custom-Renderer-Code-Funktion anpassen**

Da Shiki jetzt das Highlighting macht und der Renderer nur noch den Wrap setzt, kann der `code`-Renderer aus Task 7 vereinfacht werden:

```ts
marked.use({
  renderer: {
    code(code, infostring) {
      const { lang, modifier } = parseLangAndModifier(infostring ?? "");
      const attr = modifier ? ` data-card-style="${modifier}"` : "";
      const langClass = lang ? ` class="language-${escapeHtml(lang)}"` : "";
      // `code` here is already shiki-highlighted HTML (<span style="color:...">)
      // when language was known, or plain escaped text fallback when unknown.
      return `<pre${attr}><code${langClass}>${code}</code></pre>\n`;
    },
  },
});
```

Wichtig: `code` ist jetzt vorgehighlightetes HTML; **kein zusätzliches `escapeHtml(code)`**. Sonst würden die `<span>`-Tags doppelt escaped werden. Die Fallback-Pfade im `highlight`-Callback (oben) escapen bereits.

- [ ] **Step 6: Run tests, ensure pass**

```bash
npm run test:run --workspace=apps/backend -- marked-renderer
```

Erwartet: alle 8 Tests grün (6 aus Task 7 + 2 neu).

- [ ] **Step 7: Run full backend suite**

```bash
npm run test:run --workspace=apps/backend
```

Achtung: `getPublicContentPage` ist jetzt async für die Body-Render-Phase. Falls existierende Tests `renderBody` synchron aufrufen, müssen sie auf `await` umgestellt werden.

- [ ] **Step 8: Lokal manuell testen**

Backend neu starten (`npm run dev:all` falls aus). Dashboard öffnen, eine Page mit `\`\`\`js\nconsole.log("hi")\n\`\`\`` editieren, speichern. Public-URL aufrufen. Im DOM-Inspector prüfen:

```html
<pre><code class="language-js"><span style="color:#…">const</span>…</code></pre>
```

`<span style="color:…">`-Tokens müssen auftauchen.

- [ ] **Step 9: Lint + Typecheck**

```bash
npm run lint --workspace=apps/backend
npx tsc --noEmit -p apps/backend/tsconfig.json
```

- [ ] **Step 10: Commit**

```bash
git add apps/backend/package.json package-lock.json apps/backend/src/services/admin-content.ts apps/backend/src/services/__tests__/marked-renderer.test.ts
git commit -m "Feat: Shiki syntax highlighting for markdown code blocks

- markedHighlight integrated into marked.use chain; Shiki theme 'vitesse-dark'.
- renderBody is now async; getPublicContentPage segment-mapping uses Promise.all.
- Unknown languages fall back to escaped plain text.
- Code-renderer no longer escapes its body — Shiki produces ready HTML or escaped fallback."
```

---

### Task 9: Frontend `MarkdownHtml` mit `html-react-parser`

**Files:**
- Modify: `apps/frontend/package.json` (deps)
- Modify: `apps/frontend/src/components/layout/PageOverlayContent.tsx:42-44` (MarkdownHtml-Implementation)
- Create: `apps/frontend/src/__tests__/markdown-html.test.tsx` (vitest, jsdom)

- [ ] **Step 1: Dependency installieren**

```bash
npm install --workspace=apps/frontend html-react-parser
```

- [ ] **Step 2: vitest-Setup im Frontend prüfen**

```bash
grep -E "vitest" apps/frontend/package.json
```

Falls vitest schon existiert, weiter zu Step 3. Falls nicht, installieren:

```bash
npm install --workspace=apps/frontend --save-dev vitest jsdom @testing-library/react @testing-library/jest-dom
```

Plus `apps/frontend/vitest.config.ts` anlegen (analog zum Dashboard, falls da existent):

```ts
import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./vitest.setup.ts"],
  },
  resolve: {
    alias: { "@": "/src" },
  },
});
```

Plus `apps/frontend/vitest.setup.ts`:

```ts
import "@testing-library/jest-dom/vitest";
```

Plus in `apps/frontend/package.json` ergänzen:

```json
"scripts": {
  "test": "vitest",
  "test:run": "vitest run",
  ...
}
```

- [ ] **Step 3: Failing test schreiben**

`apps/frontend/src/__tests__/markdown-html.test.tsx`:

```tsx
import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { MarkdownHtml } from "@/components/layout/PageOverlayContent";

describe("MarkdownHtml", () => {
  it("wraps <pre data-card-style='recessed'> in RecessedCard", () => {
    const html = '<pre data-card-style="recessed"><code>foo</code></pre>';
    render(<MarkdownHtml html={html} />);
    // RecessedCard sets the recessed-gradient-border class
    const recessed = document.querySelector(".recessed-gradient-border");
    expect(recessed).not.toBeNull();
    const pre = recessed?.querySelector("pre");
    expect(pre).not.toBeNull();
    expect(pre?.hasAttribute("data-card-style")).toBe(false);
    expect(pre?.getAttribute("data-card-wrapped")).toBe("true");
  });

  it("wraps <pre data-card-style='embossed'> in EmbossedCard", () => {
    const html = '<pre data-card-style="embossed"><code>foo</code></pre>';
    render(<MarkdownHtml html={html} />);
    const embossed = document.querySelector(".embossed-gradient-border");
    expect(embossed).not.toBeNull();
  });

  it("renders <pre> without marker unchanged", () => {
    const html = '<pre><code>foo</code></pre>';
    render(<MarkdownHtml html={html} />);
    const pre = document.querySelector("pre");
    expect(pre).not.toBeNull();
    expect(document.querySelectorAll(".recessed-gradient-border, .embossed-gradient-border").length).toBe(0);
  });

  it("strips unknown data-card-style values defensively", () => {
    const html = '<pre data-card-style="weird"><code>foo</code></pre>';
    render(<MarkdownHtml html={html} />);
    const pre = document.querySelector("pre");
    expect(pre).not.toBeNull();
    // Either the unknown value is stripped, or it is left in place — but no Card wrap.
    expect(document.querySelectorAll(".recessed-gradient-border, .embossed-gradient-border").length).toBe(0);
  });
});
```

- [ ] **Step 4: Run failing tests**

```bash
npm run test:run --workspace=apps/frontend -- markdown-html
```

Erwartet: FAIL — `MarkdownHtml` injiziert heute den HTML-String ohne Replace-Logik.

- [ ] **Step 5: `MarkdownHtml` umschreiben**

In `apps/frontend/src/components/layout/PageOverlayContent.tsx` Zeilen 42-44 (komplette `MarkdownHtml`-Funktion) ersetzen.

Imports oben ergänzen:

```tsx
import parse, { domToReact, Element, type HTMLReactParserOptions } from "html-react-parser";
import { EmbossedCard } from "@/components/cards/EmbossedCard";
// RecessedCard ist bereits importiert (siehe Zeile 6).
```

Neue Implementation:

```tsx
const parserOptions: HTMLReactParserOptions = {
  replace(domNode) {
    if (!(domNode instanceof Element)) return undefined;
    if (domNode.name !== "pre") return undefined;
    const cardStyle = domNode.attribs["data-card-style"];
    if (cardStyle !== "recessed" && cardStyle !== "embossed") return undefined;

    // Strip the marker, add a sentinel so CSS in MD_EMBOSSED can suppress
    // the wrapped <pre>'s own padding/background (the Card owns geometry now).
    const cleanAttribs = { ...domNode.attribs };
    delete cleanAttribs["data-card-style"];
    cleanAttribs["data-card-wrapped"] = "true";

    const inner = (
      <pre {...cleanAttribs}>{domToReact(domNode.children, parserOptions)}</pre>
    );

    return cardStyle === "recessed" ? (
      <RecessedCard padding="0">{inner}</RecessedCard>
    ) : (
      <EmbossedCard padding="0">{inner}</EmbossedCard>
    );
  },
};

// Single markdown injection site — every renderer below funnels through here.
// Input is server-sanitised by the backend markdown renderer before it ever
// leaves `PublicContentPage.contentHtml`.
export function MarkdownHtml({ html, className }: { html: string; className?: string }) {
  return <div className={className}>{parse(html, parserOptions)}</div>;
}
```

(Beachten: `function MarkdownHtml` wurde in Task 5 schon zu `export function`; falls Task 5 noch nicht durchgelaufen ist, jetzt nachholen.)

ACHTUNG `attribs`-Typing: `html-react-parser` bzw. das underlying `domhandler` typt `Element.attribs` als `{ [name: string]: string }`. Das sollte direkt funktionieren — falls TS meckert, expliziter Cast: `(domNode.attribs as Record<string, string>)`.

- [ ] **Step 6: Run tests, ensure pass**

```bash
npm run test:run --workspace=apps/frontend -- markdown-html
```

Erwartet: alle 4 Tests grün.

- [ ] **Step 7: Visual smoke test**

`npm run dev:all` falls aus. Lokal `http://localhost:3000/help` (oder eine andere bestehende Test-Page) öffnen. Markdown mit `\`\`\`js recessed` Block einfügen, speichern, anschauen. Im DOM:

```html
<div class="recessed-gradient-border" style="...">
  <pre data-card-wrapped="true">
    <code class="language-js"><span style="color:...">const</span>...</code>
  </pre>
</div>
```

- [ ] **Step 8: Lint + Typecheck**

```bash
npm run lint --workspace=apps/frontend
npx tsc --noEmit -p apps/frontend/tsconfig.json
```

- [ ] **Step 9: Commit**

```bash
git add apps/frontend/package.json package-lock.json apps/frontend/src/components/layout/PageOverlayContent.tsx apps/frontend/src/__tests__/markdown-html.test.tsx apps/frontend/vitest.config.ts apps/frontend/vitest.setup.ts
git commit -m "Feat: MarkdownHtml uses html-react-parser to wrap code blocks in cards

- <pre data-card-style='recessed|embossed'> is replaced by RecessedCard/EmbossedCard around the <pre>.
- The wrapped <pre> gains data-card-wrapped='true' so CSS can suppress its own padding/background.
- Unknown card-style values render as plain <pre>.
- Four vitest tests cover the four code-paths."
```

---

### Task 10: Default Code-Block-CSS

**Files:**
- Modify: `apps/frontend/src/components/layout/PageOverlayContent.tsx:11-37` (`MD_TRANSLUCENT` + `MD_EMBOSSED`)

- [ ] **Step 1: `MD_EMBOSSED` erweitern**

In `apps/frontend/src/components/layout/PageOverlayContent.tsx:25-37` die Liste vor dem letzten Element (`"[&>*:last-child]:mb-0"`) ergänzen:

```ts
"[&_pre]:my-3 [&_pre]:rounded-lg [&_pre]:overflow-x-auto [&_pre]:p-3 [&_pre]:bg-black/20 [&_pre]:font-mono [&_pre]:text-sm",
"[&_pre[data-card-wrapped]]:p-0 [&_pre[data-card-wrapped]]:bg-transparent [&_pre[data-card-wrapped]]:rounded-none [&_pre[data-card-wrapped]]:my-0",
"[&_:not(pre)>code]:rounded [&_:not(pre)>code]:bg-white/8 [&_:not(pre)>code]:px-1.5 [&_:not(pre)>code]:py-0.5 [&_:not(pre)>code]:font-mono [&_:not(pre)>code]:text-sm",
```

- [ ] **Step 2: `MD_TRANSLUCENT` analog erweitern**

In Zeilen 11-23 dieselben drei Tailwind-Strings einfügen, mit White-Background-Variation für den translucent Hintergrund:

```ts
"[&_pre]:my-3 [&_pre]:rounded-lg [&_pre]:overflow-x-auto [&_pre]:p-3 [&_pre]:bg-black/30 [&_pre]:font-mono [&_pre]:text-sm",
"[&_pre[data-card-wrapped]]:p-0 [&_pre[data-card-wrapped]]:bg-transparent [&_pre[data-card-wrapped]]:rounded-none [&_pre[data-card-wrapped]]:my-0",
"[&_:not(pre)>code]:rounded [&_:not(pre)>code]:bg-white/15 [&_:not(pre)>code]:px-1.5 [&_:not(pre)>code]:py-0.5 [&_:not(pre)>code]:font-mono [&_:not(pre)>code]:text-sm",
```

- [ ] **Step 3: Visual smoke test**

Page mit folgendem Markdown öffnen:

````md
Inline `code` test.

```
plain
```

```js
const x = 1;
```

```js recessed
const y = 2;
```

```js embossed
const z = 3;
```

```recessed
plain in recessed
```
````

In allen vier Code-Block-Varianten visuell prüfen:
- Default: rundes graues Rechteck mit Mono-Font, Highlight-Tokens.
- Recessed: in einer eingelassenen Card, kein eigenes Background, Highlight-Tokens.
- Embossed: in einer hochstehenden Card.
- Inline: kleiner Background-Tint, abgerundete Ecken, Mono-Font.

- [ ] **Step 4: Lint**

```bash
npm run lint --workspace=apps/frontend
```

- [ ] **Step 5: Commit**

```bash
git add apps/frontend/src/components/layout/PageOverlayContent.tsx
git commit -m "Style: Default markdown code-block look + inline-code chip

- <pre> default: mono, padding, rounded, dark background tint, scroll-x.
- <pre data-card-wrapped> suppresses its own padding/background (the Card owns geometry).
- Inline <code> (single backticks) gets a subtle chip background, rounded corners, mono font.
- Variants in MD_EMBOSSED and MD_TRANSLUCENT differ only in background opacity."
```

---

### Task 11: Visual-Verification + Tests-Wrap-Up

**Files:** keine — manuelle Verifikation plus voller Test-Lauf.

- [ ] **Step 1: Stack hochfahren**

```bash
npm run dev:all
```

Verify via `npm run dev:status`: alle vier Services oben.

- [ ] **Step 2: Test-Pages anlegen**

Im Dashboard (`http://localhost:4001`) folgende Test-Pages anlegen:

| Slug | displayMode | contentCardStyle | pageType |
|---|---|---|---|
| `cs-fs-default` | fullscreen | default | default |
| `cs-fs-recessed` | fullscreen | recessed | default |
| `cs-fs-seg-default` | fullscreen | default | segmented |
| `cs-fs-seg-recessed` | fullscreen | recessed | segmented |
| `cs-emb-default` | embossed | default | default |
| `cs-emb-recessed` | embossed | recessed | default |
| `cs-emb-seg-default` | embossed | default | segmented |
| `cs-emb-seg-recessed` | embossed | recessed | segmented |
| `cs-trans` | translucent | (n/a, hidden) | default |

In jede Page denselben Markdown-Body einsetzen:

````md
# Test-Heading

Paragraph mit `inline code`.

```js
const x = 1;
```

```js recessed
const y = 2;
```

```js embossed
const z = 3;
```

```recessed
ohne Sprache, mit Recessed-Wrap
```
````

- [ ] **Step 3: Pro Page im Browser verifizieren (chrome-devtools-mcp)**

`http://localhost:3000/cs-fs-default` etc. aufrufen. Pro Page checken:

- Erwartetes Card-Layout sichtbar (siehe Spec-Tabelle in Section 5).
- Alle vier Code-Block-Varianten korrekt gerendert.
- Keine horizontalen Klipping-Artifakte.
- Console keine Errors/Warnings.

- [ ] **Step 4: Translucent-Verhalten**

`http://localhost:3000/cs-trans` aufrufen, dann das Card-Stil-Setting im Dashboard auf "default" und auf "recessed" toggeln (Picker bleibt versteckt, Wert wird nicht überschrieben). Verifizieren: visuelles Rendering bleibt jeweils gleich (translucent ignoriert das Setting).

- [ ] **Step 5: Voller Test-Lauf**

```bash
npm run lint
npm run test:run
```

Erwartet: keine Lint-Fehler, alle Tests grün.

- [ ] **Step 6: Typecheck über alle Workspaces**

```bash
npx tsc --noEmit -p apps/backend/tsconfig.json
npx tsc --noEmit -p apps/frontend/tsconfig.json
npx tsc --noEmit -p apps/dashboard/tsconfig.json
npx tsc --noEmit -p packages/shared/tsconfig.json
```

- [ ] **Step 7: Plan in `done/` archivieren**

```bash
git mv docs/superpowers/plans/2026-05-02-content-card-style-and-markdown-card-blocks.md \
       docs/superpowers/plans/done/2026-05-02-content-card-style-and-markdown-card-blocks.md
```

(Falls `docs/superpowers/plans/done/` nicht existiert, vorher `mkdir -p`.)

- [ ] **Step 8: Final-Commit**

```bash
git add docs/superpowers/plans/
git commit -m "Docs: Mark content-card-style plan as done

- Visual verification through 9 test-pages (8 styled + 1 translucent control).
- All four code-block variants render as designed.
- Test suites green across backend / frontend / dashboard / shared."
```

---

## Verified facts (re-checked at write time)

| Reference | Verified by |
|---|---|
| `apps/backend/src/db/schemas/postgres.ts` `contentPages` block | `grep -A40 "contentPages"` |
| `apps/backend/src/services/admin-content.ts:22-25` marked-Setup | direct read |
| `apps/backend/src/services/admin-content.ts:51-53` `renderBody`/`marked.parse` | direct read |
| `apps/backend/src/services/admin-content.ts:81-101` `rowToSummary` | direct read |
| `apps/backend/src/services/admin-content.ts:186-247` `updateManagedContentPageMeta` | direct read |
| `apps/backend/src/services/admin-content.ts:292-373` `getPublicContentPage` | direct read |
| `apps/backend/src/db/admin-repository.ts:170` `ContentPageMetaUpdate` interface | grep |
| `packages/shared/src/content.ts:29-32` constants | grep |
| `packages/shared/src/content.ts:79-118` `ContentPageSummary`/`ContentPage`/`PublicContentPage` | grep |
| `apps/frontend/src/components/layout/PageOverlayContent.tsx:11-37` `MD_TRANSLUCENT`/`MD_EMBOSSED` | direct read |
| `apps/frontend/src/components/layout/PageOverlayContent.tsx:42-44` `MarkdownHtml` (current site) | direct read |
| `apps/frontend/src/components/layout/PageOverlayContent.tsx:119-157` `EmbossedOverlayContent` | direct read |
| `apps/frontend/src/components/layout/PageOverlayContent.tsx:159-196` `SegmentedPageFullscreen` | direct read |
| `apps/frontend/src/pages/[shortId].astro:186-237` fullscreen branches (bot path) | direct read |
| `apps/frontend/src/components/share/DeferredShareContent.astro:124-146` fullscreen branches (browser path) | direct read |
| `apps/dashboard/src/features/content/pages/PageDisplaySettings.tsx` (full file) | direct read |
| `apps/dashboard/src/i18n/messages.ts:491-498, 1218-1223, 1936-1941` `display`-Block | grep |
| `apps/dashboard/src/components/ui/Dropdown.tsx` `align="start"` default | direct read |
| `apps/backend/package.json` test scripts: `"test": "vitest"`, `"test:run": "vitest run"` | grep |
| Root package.json db scripts: `db:generate`, `db:migrate`, `db:studio` | grep |
| Drizzle journal: 25 entries, last_idx=24 | direct read |
| `marked-footnote` already a dep | grep |
| `marked-highlight`, `shiki`, `html-react-parser` NOT yet installed | grep |
| Migration tracker on local DB (post-restore): 25 rows, MAX(id)=27 | live `psql` query |

- [x] Alle Code-Referenzen verifiziert (Funktionen, Scripts, Pfade, Env-Vars, Package-Manager-Befehle)
