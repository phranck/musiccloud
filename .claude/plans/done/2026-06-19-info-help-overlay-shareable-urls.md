# Info/Help-Overlays: teilbare URLs — Implementierungsplan

Plan-Nr.: MC-043

> **Für agentische Worker:** Umsetzung task-by-task via `superpowers:executing-plans` oder `superpowers:subagent-driven-development`. Schritte sind als Checkboxen (`- [ ]`) geführt. TDD: Test zuerst, dann minimal implementieren, verifizieren, committen.

**Ziel:** Overlay-mode Content-Pages (Info/Help) bekommen teilbare URLs; der Direktaufruf zeigt stets die Landingpage mit geöffnetem Overlay und der korrekten Sektion.

**Architektur:** Eine overlay-mode Page ist „Landingpage + offenes Overlay". Der Direktaufruf rendert dieselbe Shell wie `index.astro` (`LandingPage` + `PageOverlayIsland(initialPage=contentPage)`) statt der Share-Logo-Shell. Pfad = Overlay-Slug, Hash = Sektion (`targetSlug`).

**Spec:** [docs/superpowers/specs/2026-06-19-info-help-overlay-shareable-urls-design.md](../../../docs/superpowers/specs/2026-06-19-info-help-overlay-shareable-urls-design.md)

**Tech:** Astro 5 (SSR, `server:defer`-Islands), React 19, vitest 4 + `@testing-library/react`.

---

## File-Struktur

| Datei | Verantwortung | Änderung |
| --- | --- | --- |
| `apps/frontend/src/components/layout/PageOverlayContent.tsx` | Overlay-Content + Segment-Tabs (`useSegmented`) | Hash↔`targetSlug`-Sync (nur overlay-mode) |
| `apps/frontend/src/context/OverlayContext.tsx` | Overlay-State, open/close, History | `previousUrl="/"` bei Direktaufruf |
| `apps/frontend/src/components/share/DeferredShareContent.astro` | Browser-SSR-Render für `/[shortId]` | overlay-mode → Landing-Shell + Overlay; Wrapper/Logo raus |
| `apps/frontend/src/pages/[shortId].astro` | Catch-all-Route (Bot- + Browser-Pfad) | Bot-Pfad: overlay-mode Content statisch für Crawler |
| `apps/frontend/src/__tests__/page-overlay-island.test.tsx` | Overlay-Tests | Tests für Hash-Sektion + Close-Ziel |

---

## Task 1: Hash ↔ Sektion in `useSegmented`

**Files:**
- Modify: `apps/frontend/src/components/layout/PageOverlayContent.tsx:119-147` (`useSegmented`) + Aufrufer `EmbossedOverlayContent:200`, `TranslucentOverlayContent:156` (Param `{ syncHash: true }`), `SegmentedPageFullscreen:255` (unverändert, Default `syncHash:false`)
- Test: `apps/frontend/src/__tests__/page-overlay-island.test.tsx`

- [ ] **Step 1: Failing Test** — Direktaufruf-Hash wählt das passende Segment.

```tsx
// in page-overlay-island.test.tsx, neuer describe-Block
describe("PageOverlayIsland section deep-link via hash", () => {
  it("opens the segment whose targetSlug matches the URL hash", async () => {
    mockMatchMedia(false);
    window.location.hash = "#services";
    const p = page({
      segments: [
        { label: "About", targetSlug: "about", title: "About", showTitle: true, content: "", contentHtml: "<p>about-body</p>" },
        { label: "Services", targetSlug: "services", title: "Services", showTitle: true, content: "", contentHtml: "<p>services-body</p>" },
      ],
    });
    render(<PageOverlayIsland initialPage={p} />);
    await screen.findByText("services-body");
    expect(screen.queryByText("about-body")).toBeNull();
    window.location.hash = "";
  });
});
```

- [ ] **Step 2: Test rot laufen lassen**

Run: `pnpm --filter @musiccloud/frontend exec vitest run src/__tests__/page-overlay-island.test.tsx -t "hash"`
Erwartung: FAIL (zeigt `about-body`, da `useSegmented` immer Index 0 startet).

- [ ] **Step 3: `useSegmented` um Hash-Sync erweitern**

```tsx
import { useCallback, useMemo, useState } from "react"; // useCallback ergänzen

function segmentIndexForHash(page: PublicContentPage): number {
  if (typeof window === "undefined") return 0;
  const hash = window.location.hash.replace(/^#/, "");
  if (!hash) return 0;
  const idx = page.segments.findIndex((s) => s.targetSlug === hash);
  return idx >= 0 ? idx : 0;
}

function useSegmented(page: PublicContentPage, { syncHash = false }: { syncHash?: boolean } = {}): {
  segments: { key: string; label: string }[];
  active: string;
  activeIndex: number;
  setActive: (next: string) => void;
  currentHtml: string;
  currentTitle: string;
  currentShowTitle: boolean;
} {
  const segments = useMemo(() => page.segments.map((s, i) => ({ key: String(i), label: s.label })), [page.segments]);
  // Overlay-Islands rendern erst nach Client-Mount (OverlayShell.mounted=false auf
  // dem Server), daher ist das Lesen von location.hash im Initializer SSR-sicher.
  const [activeIndex, setActiveIndex] = useState<number>(() => (syncHash ? segmentIndexForHash(page) : 0));
  const current = page.segments[activeIndex] ?? page.segments[0];

  const setActive = useCallback(
    (next: string) => {
      const idx = Number.parseInt(next, 10);
      if (Number.isNaN(idx)) return;
      setActiveIndex(idx);
      if (syncHash && typeof window !== "undefined") {
        const slug = page.segments[idx]?.targetSlug;
        if (slug) {
          // replaceState: Tab-Wechsel erzeugt keinen History-Eintrag, Back schließt
          // das gesamte Overlay statt tab-für-tab zurückzugehen.
          window.history.replaceState(window.history.state, "", `${window.location.pathname}${window.location.search}#${slug}`);
        }
      }
    },
    [syncHash, page.segments],
  );

  return {
    segments,
    active: String(activeIndex),
    activeIndex,
    setActive,
    currentHtml: current?.contentHtml ?? "",
    currentTitle: current?.title ?? page.title,
    currentShowTitle: current?.showTitle ?? page.showTitle,
  };
}
```

Aufrufer anpassen: in `EmbossedOverlayContent` und `TranslucentOverlayContent` `useSegmented(page, { syncHash: true })`; `SegmentedPageFullscreen` bleibt `useSegmented(page)` (kein Hash auf der Fullscreen-Standalone-Seite).

- [ ] **Step 4: Test grün** — `pnpm --filter @musiccloud/frontend exec vitest run src/__tests__/page-overlay-island.test.tsx -t "hash"` → PASS. Bestehende Mobile/Desktop-Tests weiter grün.

- [ ] **Step 5: Commit** — `git commit -m "Feat: deep-link overlay sections via URL hash"`

---

## Task 2: `previousUrl="/"` bei Direktaufruf

**Files:**
- Modify: `apps/frontend/src/context/OverlayContext.tsx:45-57` (`initialOverlayState`)
- Test: `apps/frontend/src/__tests__/page-overlay-island.test.tsx`

- [ ] **Step 1: Failing Test** — Close nach Direktaufruf navigiert auf `/`.

```tsx
it("returns to the landing page when closing a directly-opened overlay", async () => {
  mockMatchMedia(false);
  const pushSpy = vi.spyOn(window.history, "pushState");
  render(<PageOverlayIsland initialPage={page({ pageType: "default", segments: [] })} />);
  // Backdrop trägt aria-label "Close overlay" und ruft close() — eindeutiger als
  // der innere Close-Button (beide würden /close/i matchen).
  const backdrop = await screen.findByRole("button", { name: "Close overlay" });
  backdrop.click();
  expect(pushSpy).toHaveBeenCalledWith(expect.anything(), "", "/");
  pushSpy.mockRestore();
});
```

- [ ] **Step 2: Test rot** — `… -t "landing page"` → FAIL (aktuell wird die aktuelle URL als `previousUrl` gesetzt, nicht `/`).

- [ ] **Step 3: Fix** — `initialOverlayState` setzt `previousUrl` fest auf `/`, weil `initialPage` ausschließlich beim Direktaufruf einer Overlay-Page gesetzt ist (Menü-Öffnen läuft über `open()` mit `initialPage=null`).

```tsx
  return {
    page: initialPage,
    previousTitle: document.title,
    previousUrl: "/",
  };
```

- [ ] **Step 4: Test grün** + bestehende Tests grün.

- [ ] **Step 5: Commit** — `git commit -m "Fix: close directly-opened overlay returns to landing page"`

---

## Task 3: Direktaufruf rendert Landing-Shell + Overlay (Kern + Containing-Block-Fix)

**Files:**
- Modify: `apps/frontend/src/components/share/DeferredShareContent.astro:16-24` (Imports), `:36-47` (Daten), `:93-106` (overlay-mode Branch)

- [ ] **Step 1: Imports + Daten ergänzen**

```astro
import { fetchNavigation, fetchPublicContentPage, fetchRandomExample, fetchShareData } from "@/api/client";
import { LandingPage } from "@/components/landing/LandingPage";
```

Im Frontmatter nach dem bestehenden `Promise.all`:

```astro
const overlayMode = !!contentPage && contentPage.displayMode !== "fullscreen";
const footerNav = overlayMode ? await fetchNavigation("footer", locale) : [];
const exampleShortId = overlayMode ? (await fetchRandomExample())?.shortId ?? null : null;
```

- [ ] **Step 2: overlay-mode Branch ersetzen** — der bisherige Block `{!notFound && contentPage && contentPage.displayMode !== "fullscreen" && ( … LogoView … <div class="animate-slide-up"> … )}` wird zu:

```astro
{!notFound && overlayMode && (
  <Fragment>
    <LandingPage client:idle footerNav={footerNav} exampleShortId={exampleShortId} initialLocale={locale} />
    <PageOverlayIsland client:load initialPage={contentPage} initialLocale={locale} />
  </Fragment>
)}
```

Kein `animate-slide-up`-Wrapper mehr um das Overlay (der `transform` machte den Div zum Containing-Block für den `position: fixed`-Frame). `LogoView`-Import entfernen, falls danach ungenutzt (Doctor/Typecheck zeigt es).

- [ ] **Step 3: Browser-Verifikation** (SSR-Astro, kein Unit-Test) — Dev-Server auf `:3002`:

```
agent-browser open http://localhost:3002/info
agent-browser eval "(()=>{const f=document.querySelector('[data-overlay-frame-mode]');const r=f.getBoundingClientRect();return JSON.stringify({x:Math.round(r.x),y:Math.round(r.y),landing:!!document.querySelector('[data-testid=\"landing\"], main')});})()"
```
Erwartung: Frame ~zentriert (x≈460 bei 1440 Breite, **nicht** 1180), Landing-Hintergrund vorhanden. Plus `http://localhost:3002/info#services` → Services-Sektion aktiv. Screenshot zum Beleg.

- [ ] **Step 4: Commit** — `git commit -m "Fix: render landing shell with open overlay on direct content-page load"`

---

## Task 4: Bot-Pfad — overlay-mode Content statisch für Crawler

**Files:**
- Modify: `apps/frontend/src/pages/[shortId].astro:153-166` (Bot-Branch overlay-mode)

- [ ] **Step 1:** Im Bot-Pfad (`treatAsBot`) für overlay-mode Content-Pages den Content **statisch** rendern (Crawler führen kein JS aus; das bisherige `PageOverlayIsland` hydratisiert nie). Segmentierte Seiten: alle Segment-Inhalte sequentiell ausgeben; sonst `contentHtml`. `LogoView`-Block beibehalten ist ok, aber das nicht-hydratisierende Island entfällt:

```astro
{contentPage && contentPage.displayMode !== "fullscreen" && (
  <main id="main-content" class="flex-1 w-full max-w-3xl mx-auto px-4 sm:px-6 pt-20 sm:pt-12 pb-12">
    {contentPage.pageType === "segmented"
      ? contentPage.segments.map((seg) => (
          <MarkdownHtml html={seg.contentHtml} className="prose prose-invert max-w-none mb-8" />
        ))
      : <MarkdownHtml html={contentPage.contentHtml} className="prose prose-invert max-w-none" />}
  </main>
)}
```

- [ ] **Step 2: Verifikation** — Bot-UA holt Content:

```
curl -s -H 'user-agent: Twitterbot/1.0' http://localhost:3002/info | grep -c 'About musiccloud'
```
Erwartung: ≥1 (Content im Body).

- [ ] **Step 3: Commit** — `git commit -m "Fix: render overlay content statically for crawlers"`

---

## Task 5: Gesamt-Verifikation + Gates

- [ ] **Step 1: Browser-Repro aller Szenarien**
  - `/` → Homepage unverändert (Hero + Input).
  - Menü → Info öffnen → URL `/info`, zentriertes Modal über Homepage.
  - Tab „Services" → URL `/info#services` (replaceState).
  - Reload auf `/info#services` → Landingpage + Overlay offen, Services aktiv, Frame zentriert.
  - Overlay schließen (per Direktlink geöffnet) → URL `/`, Homepage.
  - Echte Share-URL (`/<shortId>`) → unverändert SharePageShell.
  - Fullscreen-Content-Page → unverändert.
- [ ] **Step 2: Unit-Tests** — `pnpm --filter @musiccloud/frontend test:run` grün.
- [ ] **Step 3: Gates** — Typecheck (`pnpm -r --if-present typecheck`), `pnpm lint`, `pnpm doctor:diff` grün.
- [ ] **Step 4:** Plan nach `.claude/plans/done/` verschieben (`git mv`).

---

## Verified facts (Stand 2026-06-19, gegen Repo gegrept/gelesen)

- `OverlayContext.tsx:45-57` `initialOverlayState` setzt `previousUrl` auf `${pathname}${search}${hash}`; `:80` `pushState(…, "/"+slug)`; `:85-91` `close()` pusht `state.previousUrl`.
- `PageOverlayContent.tsx:119-147` `useSegmented` keyt Segmente per Index, `activeIndex` useState(0); Aufrufer `:156` `TranslucentOverlayContent`, `:200` `EmbossedOverlayContent`, `:255` `SegmentedPageFullscreen`.
- `packages/shared/src/content.ts:125-132` `PublicPageSegment.targetSlug` vorhanden.
- `DeferredShareContent.astro:37-41` fetcht `contentPage`+`shareData` (contentPage Vorrang); `:93-106` overlay-mode Branch mit `LogoView` + `<div class="animate-slide-up">` + `PageOverlayIsland`.
- `index.astro:4,10-12,67,73` Render-Muster `LandingPage` (`@/components/landing/LandingPage`, props `footerNav`,`exampleShortId`,`initialLocale`) + `PageOverlayIsland(initialPage=null)`; Daten via `fetchNavigation("footer", locale)` + `fetchRandomExample()`.
- `api/client.ts:177` `fetchRandomExample(): Promise<{shortId}|null>`; `:230` `fetchNavigation(navId, locale="en")`.
- `[shortId].astro:153-166` Bot-Pfad overlay-mode rendert `LogoView` + `PageOverlayIsland` (hydratisiert für Bots nie).
- Test-Setup: vitest 4 (`apps/frontend/package.json:12-13` `test`/`test:run`), `@testing-library/react`, `page()`-Factory + `mockMatchMedia` in `__tests__/page-overlay-island.test.tsx`.
- `styles/global.css:67` `--animate-slide-up … both` (Fill-Mode `both` → bleibender `transform` → Containing-Block für `fixed`).

## Checklist

- [ ] Alle Code-Referenzen verifiziert (Funktionen, Pfade, Test-Runner, Komponenten)
- [ ] Task 1: Hash ↔ Sektion (`useSegmented`, `syncHash`)
- [ ] Task 2: `previousUrl="/"` bei Direktaufruf
- [ ] Task 3: Landing-Shell + Overlay im Direktaufruf, `animate-slide-up`-Containing-Block weg
- [ ] Task 4: Bot-Pfad Content statisch
- [ ] Task 5: Browser-Repro + Unit-Tests + Gates grün
- [ ] Bestehende Pfade unverändert: `/`, fullscreen Pages, echte Shares

## Completed

Umgesetzt auf Branch `info-help-overlay-shareable-urls` (2026-06-19):

- `69f92f2` — Memory-Verweis-Fix (groundwork)
- `97db806` — Spec + Plan (groundwork)
- `a3dcf86` — Task 1: Hash ↔ Sektion in `useSegmented` (`syncHash`)
- `6f4807e` — Task 2: `previousUrl="/"` bei Direktaufruf (+ exportierte `initialOverlayState`, deterministischer Test)
- `3f84b43` — Task 3: Landing-Shell + offenes Overlay im Direktaufruf; `animate-slide-up`-Containing-Block behoben; `LandingPage.showFooter`
- `9e9b5b0` — Task 4: Bot-Pfad rendert overlay-mode Content statisch

**Verifikation (Browser, lokal :3002):**
- `/info` Direktaufruf → Landingpage-Hintergrund + zentriertes Overlay (Frame x=460, vorher 1180/595).
- `/info#services` → Services-Sektion aktiv über der Landingpage.
- Tab-Wechsel → Hash via `replaceState` (`/info#services`).
- Homepage `/` und echte Share-URL (`/8d-Hi`) unverändert.
- Bot-UA `/info` → alle Segment-Inhalte statisch im HTML.

**Gates:** Frontend-Tests 153/153 ✓ · astro check 0 Fehler ✓ · biome lint ✓ · Typecheck (alle Workspaces) ✓ · react-doctor (pre-commit Full-Scan je Commit) ✓.

Hinweis: Der in `/info#services` sichtbare „Supported Services"-Text ist noch die alte DB-Version; die abgestimmten Markdowns (vorherige Aufgabe) pflegt der User im CMS ein — unabhängig von diesem Fix.
