# MarkdownEditor HintsBar — Badge-Notation-Hints — Implementation-Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Die `HintsBar` im Dashboard-`MarkdownEditor` lernt zwei zusätzliche Hint-Einträge, die `[[REQ]]`- und `[[OPT]]`-Source-Notation links und ein farbiges Pill-Preview rechts zeigen, getrennt durch ein `→`.

**Architecture:** Single-File-Touch in `apps/dashboard/src/components/ui/MarkdownEditor.tsx`. Drei neue lokale Components (`NotationCode`, `PillPreview`, `NotationHint`) werden direkt neben den bestehenden `Key`/`Hint`-Components ergänzt. `HintsBar` bekommt einen zweiten Wrap rechts neben dem Tasten-Wrap; das äussere `justify-between` der Bar trennt die zwei Bereiche, `flex-wrap` auf der rechten Seite sorgt für sauberes Umbruch-Verhalten bei engen Breiten.

**Tech Stack:** React, Tailwind, Dashboard-Design-System (`--ds-*`-Tokens). Keine Tests (UI-deklarativ, kein State, keine Logik — siehe Spec §Tests).

---

## Status

**Implementation-Plan ready 2026-05-02** — basiert auf der Spec `docs/superpowers/specs/2026-05-02-markdown-editor-badge-notation-hints-design.md`.

## Pre-flight

- [ ] **PF-1:** `git status --porcelain` — Working-Tree hat höchstens `cheatsheet-mockup.html` (untracked, per User-Wunsch liegen lassen) und die neuen `docs/superpowers/{specs,plans}/2026-05-02-markdown-editor-badge-notation-hints-*.md` (untracked auf `main`). Alles andere muss clean sein.
- [ ] **PF-2:** `git rev-parse --abbrev-ref HEAD` zeigt `main`. `git rev-parse --short HEAD` zeigt `bd22d933` oder weiter (Merge-Commit von `feat/mc-query-and-inline-ext`).
- [ ] **PF-3:** Dashboard-Tokens vorhanden — `grep -E "\-\-ds-danger-bg|\-\-ds-danger-text|\-\-ds-text-muted|\-\-ds-bg-elevated|\-\-ds-border" apps/dashboard/src/shared/styles/tokens.css` muss alle fünf Tokens treffen (in Light- UND Dark-Block).

## File Structure

Modifiziert:

- `apps/dashboard/src/components/ui/MarkdownEditor.tsx` — drei neue lokale Components + erweiterte `HintsBar`-JSX.

Keine Test-Files (siehe Spec).

---

## Implementation

1 Task. Single self-contained committable Change.

### Task 1: Drei neue Components + HintsBar-Erweiterung

**Files:**
- Modify: `apps/dashboard/src/components/ui/MarkdownEditor.tsx` (insert components after `Hint`-Definition Zeile 146, modify `HintsBar`-JSX Zeilen 167-178)

- [ ] **Step 1:** Branch von `main` anlegen.

  ```bash
  git checkout main
  git status --porcelain
  git checkout -b feat/markdown-editor-badge-hints
  ```

  Erwartet: vor checkout zeigt `git status` nur die untracked Spec/Plan/cheatsheet-Dateien.

- [ ] **Step 2:** Spec + Plan als ersten Commit auf den Branch.

  ```bash
  git add docs/superpowers/specs/2026-05-02-markdown-editor-badge-notation-hints-design.md \
          docs/superpowers/plans/2026-05-02-markdown-editor-badge-notation-hints.md
  git commit -m "Docs: Spec + plan for MarkdownEditor badge-notation hints

  - Spec describes adding [[REQ]]/[[OPT]] notation hints with pill-preview to the existing HintsBar in apps/dashboard/src/components/ui/MarkdownEditor.tsx.
  - Plan splits the work into a single self-contained task (three local components + HintsBar JSX update)."
  ```

- [ ] **Step 3:** `NotationCode`-Component nach der `Key`-Definition einfügen (Zeile 135 endet mit `}`, neue Component direkt darunter, vor `Hint`).

  ```tsx
  function NotationCode({ children }: { children: string }) {
    return (
      <code className="inline-flex items-center justify-center h-[1.25rem] px-1 rounded border border-[var(--ds-border-strong)] bg-[var(--ds-bg-elevated)] text-[var(--ds-text-muted)] text-[0.625rem] font-medium font-mono shadow-[0_1px_0_var(--ds-border)] leading-none select-none">
        {children}
      </code>
    );
  }
  ```

  Begründung: identische Höhe/Border/Bg/Shadow wie `Key` damit die Bar visuell einheitlich bleibt. `min-w` ist raus, weil `[[REQ]]` von Natur aus breit genug ist. `px-1` (statt `px-[0.25rem]`) gibt den 7 Zeichen Luft. `<code>` statt `<kbd>`, weil semantisch ein Markdown-Snippet, kein Tastendruck.

- [ ] **Step 4:** `PillPreview`-Component direkt unter `NotationCode` einfügen.

  ```tsx
  function PillPreview({ variant, children }: { variant: "req" | "opt"; children: string }) {
    const variantClasses =
      variant === "req"
        ? "bg-[var(--ds-danger-bg)] text-[var(--ds-danger-text)]"
        : "bg-[var(--ds-bg-elevated)] text-[var(--ds-text-muted)] border border-[var(--ds-border)]";
    return (
      <span
        className={`inline-flex items-center justify-center h-[1.25rem] px-1.5 rounded text-[0.625rem] font-semibold font-mono uppercase tracking-wider leading-none select-none ${variantClasses}`}
      >
        {children}
      </span>
    );
  }
  ```

  Begründung: Höhe/Padding-Y matchen `Key`/`NotationCode` damit die Bar einheitlich auf einer Baseline sitzt. `px-1.5` etwas grosszügiger weil ohne Border-Box-Effekt (req-Variant). Uppercase + tracking-wider matcht den Frontend-Pill-Look von `mc-badge` (siehe `MD_EMBOSSED` in `PageOverlayContent.tsx`).

- [ ] **Step 5:** `NotationHint`-Component direkt unter `PillPreview` einfügen.

  ```tsx
  function NotationHint({
    notation,
    variant,
    pillLabel,
  }: {
    notation: string;
    variant: "req" | "opt";
    pillLabel: string;
  }) {
    return (
      <span className="flex items-center gap-1">
        <NotationCode>{notation}</NotationCode>
        <span className="text-[var(--ds-text-subtle)]" aria-hidden>
          →
        </span>
        <PillPreview variant={variant}>{pillLabel}</PillPreview>
      </span>
    );
  }
  ```

  Begründung: `gap-1` etwas grosszügiger als `gap-0.5` der Tasten-Hints, damit das `→` atmen kann. `aria-hidden` auf dem Pfeil — er ist rein dekorativ. `text-[var(--ds-text-subtle)]` macht den Pfeil dezent.

- [ ] **Step 6:** `HintsBar`-JSX (Zeilen 166-178 vor Edit) erweitern um den rechten Wrap. Vorher:

  ```tsx
  return (
    <div
      ref={ref}
      className="flex items-center justify-between gap-3 px-2.5 py-1.5 border-t border-[var(--ds-border)] bg-[var(--ds-section-header-bg,var(--ds-bg-elevated))] text-[0.625rem]"
    >
      <div className="flex items-center gap-2.5">
        <Hint keys={["⌘", "B"]} label="Bold" />
        <Hint keys={["⌘", "I"]} label="Italic" />
        <Hint keys={["⌘", "K"]} label="Link" />
        <Hint keys={["⌘", "⇧", "D"]} label="Strike" />
      </div>
    </div>
  );
  ```

  Nachher:

  ```tsx
  return (
    <div
      ref={ref}
      className="flex items-center justify-between gap-3 px-2.5 py-1.5 border-t border-[var(--ds-border)] bg-[var(--ds-section-header-bg,var(--ds-bg-elevated))] text-[0.625rem]"
    >
      <div className="flex items-center gap-2.5">
        <Hint keys={["⌘", "B"]} label="Bold" />
        <Hint keys={["⌘", "I"]} label="Italic" />
        <Hint keys={["⌘", "K"]} label="Link" />
        <Hint keys={["⌘", "⇧", "D"]} label="Strike" />
      </div>
      <div className="flex items-center gap-2.5 flex-wrap">
        <NotationHint notation="[[REQ]]" variant="req" pillLabel="REQ" />
        <NotationHint notation="[[OPT]]" variant="opt" pillLabel="OPT" />
      </div>
    </div>
  );
  ```

  Das äussere `justify-between` schiebt die zwei Wraps an die linken/rechten Ränder. `flex-wrap` auf dem rechten Wrap erlaubt automatic Umbruch in eine zweite Zeile, wenn der Container eng wird.

- [ ] **Step 7:** Lint + Typecheck.

  ```bash
  npx biome check apps/dashboard/src/components/ui/MarkdownEditor.tsx
  npx tsc --noEmit -p apps/dashboard/tsconfig.json
  ```

  Erwartet: beide ohne Errors. Bei tsc keine Output-Zeile ist Erfolg.

- [ ] **Step 8:** Visueller Smoke-Test — vom User durchgeführt.

  - Dashboard öffnen (`npm run dev --workspace=apps/dashboard` falls noch nicht läuft, sonst Browser-Tab mit Content-Page-Editor).
  - Eine Hilfe-Page editieren — die `MarkdownEditor`-HintsBar zeigt links die 4 Tasten-Hints (`⌘B Bold`, `⌘I Italic`, `⌘K Link`, `⌘⇧D Strike`) und rechts die 2 Notation-Hints (`[[REQ]] → REQ-Pill`, `[[OPT]] → OPT-Pill`).
  - Browser-Fenster schmaler ziehen — die rechten Notation-Hints wrappen sauber unter die linken Tasten-Hints; bei <420px verschwindet die Bar komplett (bestehendes Hide-Verhalten).
  - Theme-Toggle (Light ↔ Dark) — beide Pills bleiben lesbar (`req` rot, `opt` grau-neutral).

- [ ] **Step 9:** Commit (nach grünem Step 7 + User-OK aus Step 8).

  ```bash
  git add apps/dashboard/src/components/ui/MarkdownEditor.tsx
  git commit -m "Feat: Add badge-notation hints to MarkdownEditor HintsBar

  - New local components NotationCode, PillPreview, and NotationHint extend the HintsBar with two additional entries showing the [[REQ]] / [[OPT]] markdown notation as a code chip plus a live pill preview, separated by an arrow.
  - HintsBar now uses its existing justify-between layout to push the four keyboard-shortcut hints to the left and the two notation hints to the right; the right wrap has flex-wrap so the notation hints fall under the keyboard hints when the editor container narrows below ~540px.
  - Pills approximate the public-site mc-badge look using dashboard --ds-danger-* tokens (req variant) and --ds-bg-elevated + --ds-border (opt variant) so the preview is theme-aware in light and dark mode.
  - No tests added; UI is declarative-only with no state or logic (per spec §Tests)."
  ```

- [ ] **Step 10:** Plan archivieren (analog Konvention von `feat/mc-query-and-inline-ext`).

  ```bash
  git mv docs/superpowers/plans/2026-05-02-markdown-editor-badge-notation-hints.md \
         docs/superpowers/plans/done/2026-05-02-markdown-editor-badge-notation-hints.md
  git commit -m "Chore: Archive markdown-editor-badge-hints plan to done/

  - Plan execution complete: 2 commits on this branch (spec/plan, components+HintsBar update).
  - Lint+tsc clean, visual smoke green."
  ```

---

## Verified facts

| Reference | Verified by |
|---|---|
| `apps/dashboard/src/components/ui/MarkdownEditor.tsx` (full file, 257 lines) | direkt gelesen |
| `Key`-Component (lines 129-135) Tailwind-Klassen | direkt gelesen |
| `Hint`-Component (lines 137-146) Pattern | direkt gelesen |
| `HintsBar`-JSX (lines 166-178 vor Edit), äusseres `justify-between gap-3` | direkt gelesen |
| `HINTS_BAR_MIN_WIDTH = 420` (line 148) Hide-Threshold | direkt gelesen |
| Dashboard `--ds-danger-bg` / `--ds-danger-border` / `--ds-danger-text` (tokens.css:104-106 light, 216-218 dark) | grep |
| Dashboard `--ds-text-muted` (tokens.css:89), `--ds-text-subtle` (tokens.css:90) | grep |
| Dashboard `--ds-bg-elevated` (im Editor verwendet) | grep |
| Dashboard `--ds-border` / `--ds-border-strong` (im Editor verwendet) | grep |
| Backend Badge-Renderer-Output `<span class="mc-badge mc-badge-${variant}">` (admin-content.ts) | direkt gelesen (Commit `3bb8294c`) |
| Frontend Badge-CSS (Uppercase + tracking-wider + font-mono) in `MD_EMBOSSED` (PageOverlayContent.tsx) | direkt gelesen (Commit `5a6a14bd`) |
| Workspace-Lint/TSC-Befehle: `npx biome check`, `npx tsc --noEmit -p apps/dashboard/tsconfig.json` | analog zum mc-query-Plan, dort verifiziert |

- [x] Alle Code-Referenzen verifiziert (Funktionen, Pfade, Tokens, Workspace-Befehle)
