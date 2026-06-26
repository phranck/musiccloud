# Dashboard auf Dark-only konsolidieren — Implementierungsplan

Plan-Nr.: MC-041

> **Für ausführende Agents:** Schritte nutzen Checkbox-Syntax (`- [ ]`) zum Tracking. Reihenfolge der Phasen ist bindend (CSS zuerst, JS-Entfernung zuletzt), sonst flasht das Dashboard zwischenzeitlich hell.

**Goal:** Das Admin-Dashboard (`apps/dashboard`) rendert ausschliesslich im Dark-Mode. Der Light/Dark/System-Switch, der `ThemeContext`/`ThemeProvider` und die komplette Light-Token-Ebene werden entfernt; übrig bleibt eine einzige Token-Ebene in `:root`.

**Architektur:** Die Theme-Logik ist rein client-seitig (localStorage, keine Backend-/DB-Persistenz). Das Farbsystem basiert auf zwei CSS-Ebenen: `:root` (Light-Defaults) und `.dark` (Dark-Overrides). Konsolidierung = Dark-Override-Werte werden zu den einzigen `:root`-Werten, die `.dark`-Selektoren und alle Light-only-Werte entfallen. Anschliessend fallen das `.dark`-Klassen-Scoping, die `dark:`-UnoCSS-Varianten und der `ThemeContext` weg.

**Tech Stack:** React 19, Vite, UnoCSS (presetWind4), OKLCH-Design-Tokens, recharts.

**Verifikation:** Reiner Style-/Struktur-Refactor ohne neue Logik — daher keine neuen Unit-Tests. Gates: `typecheck` (fängt alle Symbol-Referenzen), `build` (fängt UnoCSS/CSS), `lint` + `doctor:diff`, plus Browser-Smoke (Dashboard lädt dark ohne Light-Flash, E-Mail-Vorschau-Toggle funktioniert).

**Bleibt unangetastet:**
- E-Mail-Vorschau-Farbschema (`EmailPreview.tsx`, eigener State `email-template:preview-color-scheme`, Backend-Parameter `colorScheme`) — bleibt funktional, nur die Komponente wird umbenannt.
- Website-Design-Settings (`DesignSettingsPage`, anderes Feature).
- Frontend-Day/Night-Switcher (`apps/frontend`, andere App).

---

## Verifizierte Fakten (Stand 2026-06-18, grep/Read gegen Repo)

| Referenz | Verifikation |
|---|---|
| `useTheme`-Konsumenten: genau 2 | `AnalyticsSection.tsx:470,830`, `AdminLayout.tsx:86` (+ Def in `ThemeContext.tsx`) |
| `ThemeSegmentedControl`-Konsumenten: 2 | `EmailPreview.tsx:6,69` (bleibt), `AdminLayout.tsx:10,88` (fällt weg) |
| `dark:`-Varianten: 16 Stellen, 7 Files | siehe Task 2.1 |
| `dark:` in `packages/dashboard-ui/src` | 0 → `uno dark:"class"` gefahrlos entfernbar |
| `--ds-card-bg` | nur in `.dark` (index.css:88) gesetzt; Konsumenten nutzen `var(--ds-card-bg, var(--ds-surface))`-Fallback |
| `--ds-L-surface-step` / `--ds-L-text-step` | nur in den `calc()`-Ketten tokens.css:65-72 referenziert → nach Merge tot |
| `.dark` in `neumorphic.css` | keine |
| Theme-Persistenz Backend/Shared | keine |
| Theme-Tests | keine |
| dashboard typecheck | `pnpm --filter @musiccloud/dashboard typecheck` |
| dashboard build | `pnpm --filter @musiccloud/dashboard build` (= typecheck + vite build) |
| root lint | `pnpm lint` (= `biome check .`) |
| doctor diff | `pnpm run doctor:diff` |

---

## Phase 1 — CSS-Tokens auf Dark-only mergen

Ziel: `.dark`-Override-Werte werden zu den einzigen `:root`-Werten. Muss VOR der Provider-Entfernung (Phase 5) laufen, damit kein Light-Zwischenzustand entsteht.

### Task 1.1: `tokens.css` — Semantic + Component `.dark` in `:root` hochziehen

**Files:**
- Modify: `apps/dashboard/src/shared/styles/tokens.css`

- [ ] **Step 1: Primitive-Block — tote Lightness-Steps entfernen**

In der Primitive-Sektion (`:root`, Zeilen ~53-58) diese zwei Zeilen löschen (nach dem Merge unten ungenutzt):

```css
  --ds-L-surface-step: 0.025;
  --ds-L-text-step: 0.16;
```

`--ds-neutral-c` und `--ds-neutral-h` bleiben.

- [ ] **Step 2: Semantic-Lightness auf feste Dark-Werte setzen**

In der `:root`-Semantic-Sektion die calc()-basierten Lightness-Werte (Zeilen 64-72) durch die festen Dark-Werte ersetzen:

```css
  /* Surface lightness levels */
  --ds-L-surface: 0.225;
  --ds-L-bg: 0.185;
  --ds-L-elevated: 0.25;
  --ds-L-inset: 0.205;

  /* Text lightness levels */
  --ds-L-text: 0.95;
  --ds-L-muted: 0.65;
  --ds-L-subtle: 0.5;
```

- [ ] **Step 3: Restliche Semantic-Light-Werte durch Dark-Werte ersetzen**

In derselben `:root`-Semantic-Sektion folgende Tokens auf ihren Dark-Wert umstellen (alle anderen Tokens — Primitive, Surfaces-Formeln, Accent-Haupt, Typography, Scale, Line-heights, Radius, Spacing, Motion — bleiben unverändert):

```css
  --ds-input-bg: var(--ds-bg-elevated);
  --ds-text-inverse: oklch(var(--ds-L-inset) 0 0);
  --ds-accent-subtle: hsl(215 30% 20%);

  --ds-success-bg: hsl(135 25% 18%);
  --ds-success-border: hsl(130 35% 35%);
  --ds-success-text: hsl(135 50% 55%);
  --ds-danger-bg: hsl(0 30% 20%);
  --ds-danger-border: hsl(0 50% 38%);
  --ds-danger-text: hsl(0 65% 62%);
  --ds-warning-bg: hsl(40 35% 18%);
  --ds-warning-border: hsl(40 50% 35%);
  --ds-warning-text: hsl(38 60% 55%);
  --ds-info-bg: hsl(215 30% 20%);
  --ds-info-border: hsl(215 50% 38%);
  --ds-info-text: hsl(212 70% 65%);

  --ds-border: #3d444d;
  --ds-border-strong: #656c76;
  --ds-border-subtle: hsl(215 12% 28%);

  --ds-shadow-xs: 0 1px 2px rgb(0 0 0 / 0.4);
  --ds-shadow-sm: 0 1px 3px rgb(0 0 0 / 0.5), 0 1px 2px rgb(0 0 0 / 0.4);
  --ds-shadow-md: 0 4px 6px rgb(0 0 0 / 0.45), 0 2px 4px rgb(0 0 0 / 0.35);
  --ds-shadow-lg: 0 10px 15px rgb(0 0 0 / 0.5), 0 4px 6px rgb(0 0 0 / 0.4);
  --ds-shadow-xl: 0 20px 25px rgb(0 0 0 / 0.55), 0 8px 10px rgb(0 0 0 / 0.45);

  --ds-control-hover-bg: oklch(var(--ds-L-text) var(--ds-neutral-c) var(--ds-neutral-h) / 0.08);
  --ds-control-active-bg: color-mix(in srgb, var(--color-primary) 22%, transparent);
  --ds-focus-ring-offset: var(--ds-bg);

  --md-heading: #79c0ff;
  --md-emphasis: #d2a8ff;
  --md-code: #ffa657;
  --md-quote: #7ee787;
  --md-punctuation: #8b949e;
```

Hinweis: `--ds-bg-hover` und `--ds-surface-hover` referenzieren `var(--ds-control-hover-bg)` und passen sich automatisch an.

- [ ] **Step 4: Component-Light-Werte durch Dark-Werte ersetzen**

In der `:root`-Component-Sektion (Zeilen 263-323) folgende Tokens auf Dark umstellen (CTA-Primary `--ds-btn-primary-*` Haupt-Buttons, Segment-bg und Overlay haben in `.dark` keinen abweichenden Wert bzw. identische Referenzen — Segment-active-border weicht ab):

```css
  --ds-btn-filled-bg: var(--ds-color-neutral-700);
  --ds-btn-filled-hover: var(--ds-color-neutral-600);

  --ds-btn-primary-border: hsl(195 40% 30%);
  --ds-btn-primary-text: hsl(195 80% 62%);
  --ds-btn-primary-hover-border: hsl(195 50% 45%);
  --ds-btn-primary-hover-bg: hsl(195 30% 20%);

  --ds-segment-active-border: color-mix(in srgb, var(--color-primary) 20%, var(--ds-border));

  --ds-btn-neutral-hover-bg: hsl(215 12% 24%);

  --ds-btn-danger-border: hsl(0 40% 30%);
  --ds-btn-danger-text: hsl(0 65% 62%);
  --ds-btn-danger-hover-bg: hsl(0 30% 20%);
  --ds-btn-danger-hover-border: hsl(0 50% 42%);

  --ds-btn-success-border: hsl(130 30% 30%);
  --ds-btn-success-text: hsl(135 50% 55%);
  --ds-btn-success-hover-bg: hsl(135 25% 18%);
  --ds-btn-success-hover-border: hsl(130 40% 42%);

  --ds-btn-warning-border: hsl(40 40% 30%);
  --ds-btn-warning-text: hsl(38 60% 55%);
  --ds-btn-warning-hover-bg: hsl(40 35% 18%);
  --ds-btn-warning-hover-border: hsl(40 50% 42%);

  --ds-badge-pending-bg: hsl(40 40% 20%);
  --ds-badge-pending-text: hsl(40 70% 65%);
  --ds-badge-success-bg: hsl(135 30% 18%);
  --ds-badge-success-text: hsl(135 50% 60%);
  --ds-badge-danger-bg: hsl(0 35% 20%);
  --ds-badge-danger-text: hsl(0 70% 65%);
  --ds-badge-info-bg: hsl(210 40% 22%);
  --ds-badge-info-text: hsl(210 80% 72%);
  --ds-badge-review-bg: hsl(270 30% 25%);
  --ds-badge-review-text: hsl(270 80% 80%);
```

- [ ] **Step 5: Beide `.dark`-Blöcke löschen**

Die zwei `.dark { ... }`-Blöcke (Semantic, Zeilen 204-259; Component, Zeilen 325-370) inklusive ihrer `/* -- SEMANTIC TOKENS - Dark mode --` / `/* -- COMPONENT TOKENS - Dark mode --`-Kommentarzeilen vollständig entfernen. Die `:root`-Kommentare auf `/* -- SEMANTIC TOKENS --` bzw. `/* -- COMPONENT TOKENS --` kürzen (kein „Light mode" mehr).

### Task 1.2: `index.css` — `.dark`-Override + color-scheme + btn-delete

**Files:**
- Modify: `apps/dashboard/src/index.css`

- [ ] **Step 1: `.dark`-Werte in `:root` übernehmen**

Im `:root`-Block (Zeilen 28-72) folgende Tokens auf ihren Dark-Wert setzen und `--ds-card-bg` ergänzen:

```css
  --ds-nav-active-bg: color-mix(in srgb, var(--color-primary) 18%, transparent);
  --ds-nav-active-border: #478be6;
  --ds-section-header-bg: #2a3033;
  --ds-section-body-bg: #212528;
  --ds-json-editor-bg: #212628;
  --ds-json-gutter-bg: #252a2e;
  --ds-md-editor-bg: #212628;
  --ds-form-control-bg: #1d2124;
  --ds-card-bg: #1b1f22;
  --ds-table-row-separator: hsl(215 10% 18%);
```

(`--ds-nav-active-text`, `--ds-nav-text`, `--ds-nav-hover-*`, `--ds-brand-text` referenzieren `--ds-text`/`--ds-nav-active-bg` und sind in beiden Modi identisch — bleiben. `--ds-row-hover`, `--ds-surface-hover`, `--ds-row-stripe` nutzen `--ds-L-text` und passen sich automatisch an.)

- [ ] **Step 2: `.dark`-Block löschen**

Den `.dark { ... }`-Block (Zeilen 74-90) vollständig entfernen.

- [ ] **Step 3: color-scheme auf dark fixieren**

Zeilen 187-189 ersetzen:

```css
/* Color scheme */
:root { color-scheme: dark; }
```

- [ ] **Step 4: `.btn-delete:hover` Light-Hardcode auf Token umstellen**

Zeilen 118-120:

```css
.btn-delete:hover {
  background-color: var(--ds-danger-bg);
}
```

### Task 1.3: Gate — Build + visueller Smoke nach CSS-Merge

- [ ] **Step 1: Build**

Run: `pnpm --filter @musiccloud/dashboard build`
Expected: PASS (keine CSS-/TS-Fehler).

- [ ] **Step 2: Browser-Smoke**

Dev-Server starten, Dashboard laden. Erwartung: rendert dark (Provider setzt zu diesem Zeitpunkt noch die `.dark`-Klasse, die jetzt aber leer ist — die Dark-Werte kommen aus `:root`). Keine hellen Flächen, Charts/Badges/Buttons korrekt.

- [ ] **Step 3: Commit**

```bash
git add apps/dashboard/src/shared/styles/tokens.css apps/dashboard/src/index.css
git commit -m "Refactor: collapse dashboard design tokens onto a single dark :root layer"
```

---

## Phase 2 — `dark:`-Utilities auflösen und Build-/HTML-Config bereinigen

### Task 2.1: 16 `dark:`-Varianten zur Basis-Klasse machen

Regel: `base dark:darkval` → nur noch `darkval` (Dark-Wert wird zur Basis). Light-Basis entfällt.

**Files & exakte Ersetzungen:**

- [ ] **`apps/dashboard/src/features/music/TrackEditPage.tsx:252`**
  `text-green-600 dark:text-green-400` → `text-green-400`

- [ ] **`apps/dashboard/src/features/content/PageStatus.tsx:14`**
  `text-green-600 dark:text-green-400` → `text-green-400`

- [ ] **`apps/dashboard/src/features/content/PageStatus.tsx:24`**
  `text-amber-600 dark:text-amber-400` → `text-amber-400`

- [ ] **`apps/dashboard/src/features/system/UsersPage.tsx:69`**
  `bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-400` → `bg-amber-900/40 text-amber-400`

- [ ] **`apps/dashboard/src/features/system/UsersPage.tsx:71`**
  `bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-400` → `bg-blue-900/40 text-blue-400`

- [ ] **`apps/dashboard/src/features/system/UsersPage.tsx:72`**
  `bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400` → `bg-gray-800 text-gray-400`

- [ ] **`apps/dashboard/src/features/templates/email-templates/EmailTemplateEditPage.tsx:287`**
  `text-green-600 dark:text-green-400` → `text-green-400`

- [ ] **`apps/dashboard/src/features/templates/email-templates/EmailTemplateEditPage.tsx:294`**
  `text-green-600 dark:text-green-400` → `text-green-400` (im Template-Literal, Ok-Zweig)

- [ ] **`apps/dashboard/src/features/templates/form-builder/FormBuilderListPage.tsx:49`**
  `text-green-600 dark:text-green-400` → `text-green-400`

- [ ] **`apps/dashboard/src/components/ContentEditorLoadingFallback.tsx:8`**
  `border-slate-200 dark:border-slate-700 border-t-blue-600 dark:border-t-blue-400` → `border-slate-700 border-t-blue-400`

- [ ] **`apps/dashboard/src/components/ContentEditorLoadingFallback.tsx:9`**
  `text-slate-600 dark:text-slate-400` → `text-slate-400`

- [ ] **`apps/dashboard/src/components/ErrorBoundary.tsx:37`**
  `bg-slate-50 dark:bg-slate-950` → `bg-slate-950`

- [ ] **`apps/dashboard/src/components/ErrorBoundary.tsx:38`**
  `bg-white dark:bg-slate-900` → `bg-slate-900`

- [ ] **`apps/dashboard/src/components/ErrorBoundary.tsx:39`**
  `text-slate-900 dark:text-white` → `text-white`

- [ ] **`apps/dashboard/src/components/ErrorBoundary.tsx:40`**
  `text-slate-600 dark:text-slate-400` → `text-slate-400`

- [ ] **`apps/dashboard/src/components/ErrorBoundary.tsx:58`**
  `bg-slate-200 dark:bg-slate-700 text-slate-900 dark:text-white ... hover:bg-slate-300 dark:hover:bg-slate-600` → `bg-slate-700 text-white ... hover:bg-slate-600`

- [ ] **Step Verify:** `grep -rn "dark:" apps/dashboard/src` → 0 Treffer.

### Task 2.2: `uno.config.ts` — `dark: "class"` entfernen

**Files:**
- Modify: `apps/dashboard/uno.config.ts:5`

- [ ] `presetWind4({ dark: "class" })` → `presetWind4()`

### Task 2.3: `index.html` — FOUC-Script entfernen, dark fixieren

**Files:**
- Modify: `apps/dashboard/index.html`

- [ ] **Step 1:** Zeile 25 `<meta name="color-scheme" content="light" />` → `content="dark"`.

- [ ] **Step 2:** Das gesamte `<script>`-FOUC-Bootstrap (Zeilen 27-40) entfernen. Es setzte die `.dark`-Klasse aus localStorage — nach der Konsolidierung kommt Dark aus `:root`, kein Klassen-Hook mehr nötig.

### Task 2.4: Gate — Build

- [ ] **Step 1:** Run: `pnpm --filter @musiccloud/dashboard build` → PASS.

- [ ] **Step 2: Commit**

```bash
git add apps/dashboard/src apps/dashboard/uno.config.ts apps/dashboard/index.html
git commit -m "Refactor: resolve dashboard dark: utilities to base classes and drop dark-class bootstrap"
```

---

## Phase 3 — Chart-Farben vom Theme entkoppeln

### Task 3.1: `AnalyticsSection.tsx` — `useTheme`/`isDark` durch fixe Dark-Werte ersetzen

**Files:**
- Modify: `apps/dashboard/src/features/analytics/AnalyticsSection.tsx`

- [ ] **Step 1: `useTheme`-Import entfernen (Zeile 34)**

```ts
// entfernen:
import { useTheme } from "@/context/ThemeContext";
```

- [ ] **Step 2: `RealtimeCard` (ab Zeile ~469) — Theme-Ableitung ersetzen**

Vorher:
```ts
  const { effectiveTheme } = useTheme();
  const m = messages.analytics;
  const isDark = effectiveTheme === "dark";
  const gridColor = isDark ? "#3d444d" : "#f1f0ef";
  const tickColor = isDark ? "#a8a29e" : "#9ca3af";
  const tooltipBg = isDark ? "oklch(0.19 0.006 38.2)" : "#ffffff";
  const tooltipBorder = isDark ? "oklch(0.30 0.008 38.2)" : "#e7e5e4";
  const tooltipColor = isDark ? "#fafaf9" : "#111827";
  const cursorColor = isDark ? "rgba(255,255,255,0.05)" : "rgba(0,0,0,0.03)";
```

Nachher:
```ts
  const m = messages.analytics;
  const gridColor = "#3d444d";
  const tickColor = "#a8a29e";
  const tooltipBg = "oklch(0.19 0.006 38.2)";
  const tooltipBorder = "oklch(0.30 0.008 38.2)";
  const tooltipColor = "#fafaf9";
  const cursorColor = "rgba(255,255,255,0.05)";
```

- [ ] **Step 3: `AnalyticsSection` (ab Zeile ~827) — Theme-Ableitung ersetzen**

Vorher:
```ts
  const { effectiveTheme } = useTheme();
  const m = messages.analytics;
  const periodStorageKey = getSegmentedStorageKey(user?.id, "analytics:period");
  const isDark = effectiveTheme === "dark";
  const gridColor = isDark ? "#3d444d" : "#f1f0ef";
  const tickColor = isDark ? "#a8a29e" : "#9ca3af";
  const tooltipBg = isDark ? "oklch(0.19 0.006 38.2)" : "#ffffff";
  const tooltipBorder = isDark ? "oklch(0.30 0.008 38.2)" : "#e7e5e4";
  const tooltipColor = isDark ? "#fafaf9" : "#111827";
```

Nachher:
```ts
  const m = messages.analytics;
  const periodStorageKey = getSegmentedStorageKey(user?.id, "analytics:period");
  const gridColor = "#3d444d";
  const tickColor = "#a8a29e";
  const tooltipBg = "oklch(0.19 0.006 38.2)";
  const tooltipBorder = "oklch(0.30 0.008 38.2)";
  const tooltipColor = "#fafaf9";
```

- [ ] **Step 4: Verify** — `grep -n "useTheme\|isDark\|effectiveTheme" apps/dashboard/src/features/analytics/AnalyticsSection.tsx` → 0 Treffer. Typecheck: `pnpm --filter @musiccloud/dashboard typecheck` → PASS.

---

## Phase 4 — `ThemeSegmentedControl` → `ColorSchemeSegmentedControl`

### Task 4.1: Komponente umbenennen und auf light/dark reduzieren

**Files:**
- Rename: `apps/dashboard/src/components/ui/ThemeSegmentedControl.tsx` → `apps/dashboard/src/components/ui/ColorSchemeSegmentedControl.tsx`

- [ ] **Step 1: `git mv`**

```bash
git mv apps/dashboard/src/components/ui/ThemeSegmentedControl.tsx apps/dashboard/src/components/ui/ColorSchemeSegmentedControl.tsx
```

- [ ] **Step 2: Inhalt ersetzen (system + DesktopIcon raus, TSDoc ergänzen)**

```tsx
import { MoonStarsIcon, SunIcon } from "@phosphor-icons/react";

import { SegmentedControl } from "@/components/ui/SegmentedControl";

/** Selectable colour schemes — light or dark, no system option. */
export type ColorSchemeOption = "light" | "dark";

const ALL_OPTIONS = [
  { value: "light" as const, icon: <SunIcon weight="duotone" className="w-3.5 h-3.5" /> },
  { value: "dark" as const, icon: <MoonStarsIcon weight="duotone" className="w-3.5 h-3.5" /> },
] as const;

interface ColorSchemeSegmentedControlProps {
  value: ColorSchemeOption;
  onChange: (v: ColorSchemeOption) => void;
  storageKey?: string;
}

/**
 * Light/dark segmented toggle. Generic colour-scheme picker used by the
 * e-mail-template preview to switch the rendered preview between light and
 * dark recipient clients. Not tied to any application-wide theme.
 *
 * @param value - Currently selected colour scheme.
 * @param onChange - Invoked with the newly selected scheme.
 * @param storageKey - Optional persistence key forwarded to the underlying control.
 */
export function ColorSchemeSegmentedControl({ value, onChange, storageKey }: ColorSchemeSegmentedControlProps) {
  return <SegmentedControl value={value} onChange={onChange} options={ALL_OPTIONS} storageKey={storageKey} />;
}
```

(Die `options?`-Prop entfällt — es gibt nur noch light/dark, kein Filtern mehr nötig.)

### Task 4.2: `EmailPreview.tsx` auf die neue Komponente umstellen

**Files:**
- Modify: `apps/dashboard/src/features/templates/email-templates/EmailPreview.tsx`

- [ ] **Step 1: Import (Zeile 6)**

```ts
import { ColorSchemeSegmentedControl } from "@/components/ui/ColorSchemeSegmentedControl";
```

- [ ] **Step 2: Verwendung (Zeilen 68-78) — system-Guard und options-Prop entfernen**

Vorher:
```tsx
        renderAddOn={() => (
          <ThemeSegmentedControl
            value={colorScheme}
            onChange={(value) => {
              if (value === "system") return;
              setColorScheme(value);
              localStorage.setItem(COLOR_SCHEME_STORAGE_KEY, value);
            }}
            options={["light", "dark"]}
          />
        )}
```

Nachher:
```tsx
        renderAddOn={() => (
          <ColorSchemeSegmentedControl
            value={colorScheme}
            onChange={(value) => {
              setColorScheme(value);
              localStorage.setItem(COLOR_SCHEME_STORAGE_KEY, value);
            }}
          />
        )}
```

- [ ] **Step 3: Verify** — Typecheck PASS. `grep -rn "ThemeSegmentedControl" apps/dashboard/src` → 0 Treffer.

---

## Phase 5 — Dashboard-Theme entfernen (zuletzt)

Läuft nach Phase 1, sonst flasht das Dashboard hell. Erfordert Phase 3 (kein `useTheme` mehr in AnalyticsSection) abgeschlossen.

### Task 5.1: `AdminLayout.tsx` — ThemeToggle entfernen

**Files:**
- Modify: `apps/dashboard/src/components/layout/AdminLayout.tsx`

- [ ] **Step 1: Imports entfernen (Zeilen 10, 15)**

```ts
// entfernen:
import { ThemeSegmentedControl } from "@/components/ui/ThemeSegmentedControl";
import { useTheme } from "@/context/ThemeContext";
```

`getSegmentedStorageKey` (Zeile 23) wird in AdminLayout nur vom ThemeToggle genutzt — ebenfalls entfernen (verifizieren: nach Step 2 kein weiterer Konsument in der Datei).

- [ ] **Step 2: `ThemeToggle`-Funktion entfernen (Zeilen 85-94)**

```tsx
// gesamte Funktion entfernen:
function ThemeToggle({ userId }: { userId?: string }) {
  const { theme, setTheme } = useTheme();
  return (
    <ThemeSegmentedControl
      value={theme}
      onChange={setTheme}
      storageKey={getSegmentedStorageKey(userId, "layout:theme")}
    />
  );
}
```

- [ ] **Step 3: Verwendung im Header entfernen (Zeile 149)**

Vorher:
```tsx
          <div className="flex items-center gap-3 ml-auto">
            <div ref={setActionsEl} className="flex items-center gap-2" />
            <ThemeToggle userId={user?.id} />
          </div>
```

Nachher:
```tsx
          <div className="flex items-center gap-3 ml-auto">
            <div ref={setActionsEl} className="flex items-center gap-2" />
          </div>
```

- [ ] **Step 4: Verify** — `grep -n "getSegmentedStorageKey\|ThemeToggle\|useTheme\|ThemeSegmentedControl" apps/dashboard/src/components/layout/AdminLayout.tsx` → 0 Treffer.

### Task 5.2: `main.tsx` — `ThemeProvider` entfernen

**Files:**
- Modify: `apps/dashboard/src/main.tsx`

- [ ] **Step 1: Import entfernen (Zeile 11)**

```ts
// entfernen:
import { ThemeProvider } from "./context/ThemeContext";
```

- [ ] **Step 2: Provider-Wrapper auflösen (Zeilen 49-53)**

Vorher:
```tsx
            <I18nProvider>
              <ThemeProvider>
                <KeyboardSaveProvider>
                  <RouterProvider router={router} />
                </KeyboardSaveProvider>
              </ThemeProvider>
            </I18nProvider>
```

Nachher:
```tsx
            <I18nProvider>
              <KeyboardSaveProvider>
                <RouterProvider router={router} />
              </KeyboardSaveProvider>
            </I18nProvider>
```

### Task 5.3: `ThemeContext.tsx` löschen

**Files:**
- Delete: `apps/dashboard/src/context/ThemeContext.tsx`

- [ ] **Step 1:** `git rm apps/dashboard/src/context/ThemeContext.tsx`

- [ ] **Step 2: Verify** — `grep -rn "ThemeContext\|ThemeProvider\|useTheme\|ThemeName" apps/dashboard/src` → 0 Treffer.

---

## Phase 6 — Gesamt-Verifikation und Abschluss

### Task 6.1: Gates

- [ ] **Step 1:** `pnpm --filter @musiccloud/dashboard typecheck` → PASS
- [ ] **Step 2:** `pnpm lint` → PASS
- [ ] **Step 3:** `pnpm run doctor:diff` → keine neuen Findings
- [ ] **Step 4:** `pnpm --filter @musiccloud/dashboard build` → PASS

### Task 6.2: Browser-Smoke

- [ ] **Step 1:** Dev-Server, Dashboard laden — rendert dark, kein Light-Flash beim initialen Paint (FOUC-Script ist weg, `:root` ist dark).
- [ ] **Step 2:** Header — kein Theme-Switch mehr sichtbar.
- [ ] **Step 3:** Analytics-Seite — Charts rendern mit Dark-Grid/Tooltips.
- [ ] **Step 4:** E-Mail-Templates → Vorschau — der light/dark-Toggle der Vorschau funktioniert weiterhin (rendert die E-Mail in beiden Schemata).
- [ ] **Step 5:** localStorage-Reste: `dashboard-theme` und `seg:*:layout:theme` werden nicht mehr geschrieben (Altwerte schaden nicht, kein Cleanup nötig).

### Task 6.3: Commit + Plan abschliessen

- [ ] **Step 1: Commit**

```bash
git add apps/dashboard/src/components/layout/AdminLayout.tsx apps/dashboard/src/main.tsx apps/dashboard/src/context/ThemeContext.tsx apps/dashboard/src/features/analytics/AnalyticsSection.tsx apps/dashboard/src/components/ui/ColorSchemeSegmentedControl.tsx apps/dashboard/src/features/templates/email-templates/EmailPreview.tsx
git commit -m "Refactor: drop dashboard theme switch and context, dark-only admin UI"
```

- [ ] **Step 2:** Plan nach `.claude/plans/done/` verschieben, `## Completed`-Vermerk ergänzen.

---

## Self-Review (Spec-Abdeckung)

- Switch-UI entfernt → Task 5.1 ✓
- `ThemeContext`/`ThemeProvider`/system-Logik entfernt → Task 5.2, 5.3 ✓
- CSS vollständig konsolidiert (`.dark` → `:root`, Light-Werte raus) → Task 1.1, 1.2 ✓
- `dark:`-Varianten aufgelöst, `uno dark:"class"` + FOUC raus → Task 2.1-2.3 ✓
- Charts entkoppelt → Task 3.1 ✓
- `ThemeSegmentedControl` umbenannt, system raus, EmailPreview erhalten → Task 4.1, 4.2 ✓
- Reihenfolge CSS-zuerst → Phasen 1 vor 5 ✓
- Keine Platzhalter, alle Pfade/Zeilen/Werte grep-verifiziert ✓

---

## Completed (2026-06-19)

Umgesetzt auf Branch `dashboard-dark-only`, fünf fokussierte Commits:

| Commit | Phase |
|---|---|
| `930876a` | Phase 1 — Design-Tokens auf eine dark `:root`-Ebene konsolidiert |
| `2609527` | Phase 2 — `dark:`-Utilities aufgelöst, `.dark`-Bootstrap entfernt |
| `2d45d6b` | Phase 3 — Analytics-Chart-Farben auf dark fixiert |
| `1c5d218` | Phase 5 — Theme-Switch, Context und Provider entfernt |
| `ea5dd9b` | Phase 4 — `ThemeSegmentedControl` → `ColorSchemeSegmentedControl` (inkl. Import-Sort-Fix) |

**Gates:** typecheck ✓, `pnpm lint` ✓ (661 Files), `pnpm run doctor:diff` ✓ (0 issues), Build ✓.

**Browser-Smoke (chrome-devtools-mcp, localhost:4500):**
- Dark kommt allein aus `:root` — `documentElement` trägt keine `.dark`-Klasse mehr, `--ds-bg`/`bodyBg` = `oklch(0.185 0.006 250)`, `color-scheme: dark`.
- Header ohne Theme-Switch; Login, Übersicht, Analytics und E-Mail-Editor rendern dark.
- E-Mail-Vorschau-Toggle (`ColorSchemeSegmentedControl`) schaltet light↔dark und persistiert nach `localStorage["email-template:preview-color-scheme"]`.
- Analytics-Seite (vormals `useTheme`-Konsument) rendert ohne ErrorBoundary/Console-Fehler.

**Offen / außerhalb Scope:** Der E-Mail-Preview-Render-Call (`POST /api/admin/email-templates/preview`) lieferte lokal `ERR_CONNECTION_REFUSED` — ein Backend-Connectivity-Thema, unabhängig vom Theme-Umbau (die Toggle-UI/State/Persistenz arbeiten korrekt).

**Hinweis:** Branch noch nicht gepusht/gemergt — Push erfolgt nach separater Freigabe.
