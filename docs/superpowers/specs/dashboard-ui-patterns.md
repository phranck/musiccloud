# Dashboard UI Patterns (verbindlich)

Jede neue Dashboard-Seite MUSS diesen Patterns folgen. Keine Abweichungen ohne vorherige Absprache. Alle UI-Texte MUSSEN via i18n (`messages.developer.*`) lokalisiert sein – niemals hartkodierte Strings.

---

## Typografie

| Verwendung | Element | Klasse | Size | Weight |
|---|---|---|---|---|
| Seiten-Titel | PageHeader (title-Prop) | — | — | — |
| Section-Header | `<h3>` | `text-xs font-semibold uppercase tracking-wider text-[var(--ds-text-muted)]` | 12px | 600 |
| Card-Label | `<div>` | `text-xs font-medium text-[var(--ds-text-muted)] mb-1` | 12px | 500 |
| Form-Label | `<label>` | `block text-xs font-medium text-[var(--ds-text-muted)] mb-1` | 12px | 500 |
| Body-Text | `<p>` | `text-sm leading-relaxed` | 14px | 400 |
| Muted Text | `<span>` | `text-sm text-[var(--ds-text-muted)]` | 14px | 400 |
| Stat-Card-Label | `<p>` | `text-sm text-[var(--ds-text-muted)] mb-1` | 14px | 400 |
| Stat-Card-Value | `<p>` | `text-3xl font-bold` | 30px | 700 |
| Toolbar-Count | `<span>` | `text-sm text-[var(--ds-text-muted)]` | 14px | 400 |
| Table-Header | DataTable header | — (section-header class) | 12px | 500 |
| Table-Cell | DataTable cell | — | 14px | 400 |
| Status-Badge | `<span>` | `inline-flex px-2 py-0.5 rounded text-xs font-semibold` | 12px | 600 |
| Error-Message | `<p>` | `text-sm text-[var(--ds-danger-text)] p-4` | 14px | 400 |
| Code/Token | `<code>` | `text-xs` | 12px | 400 |

**Schrift-Family:** System-UI-Stack (Inter via Google Fonts; `system-ui, -apple-system, sans-serif` als Fallback).
**Icon-Größen:** `w-3.5 h-3.5` (action-size Buttons), `w-4 h-4` (control-size Buttons, Sidebar), `w-12 h-12` (ContentUnavailableView). Icons IMMER mit `weight="duotone"`.

---

## Farben (Design Tokens)

**Niemals harte Farbwerte** (kein `#xxx`, kein `rgb()`). AUSSCHLIESSLICH CSS-Variablen:

| Zweck | Token |
|---|---|
| Seiten-Hintergrund | `var(--ds-bg)` |
| Card/Widget-Hintergrund | `var(--ds-surface)` |
| Erhöhte Fläche (Info-Blöcke in EditorPageShell) | `var(--ds-surface-raised)` |
| Primär-Text | `var(--ds-text)` |
| Sekundär-Text | `var(--ds-text-muted)` |
| Subtitle-Text | `var(--ds-text-subtle)` |
| Border (normal) | `var(--ds-border)` |
| Border (subtil) | `var(--ds-border-subtle)` |
| Akzent | `var(--ds-accent)` |
| Akzent-Hintergrund | `var(--ds-accent-subtle)` |
| Danger-Text | `var(--ds-danger-text)` |
| Danger-Border | `var(--ds-danger-border)` |
| Nav-Hover | `var(--ds-nav-hover-bg)` |
| Table-Row-Separator | `var(--ds-table-row-separator)` |

**Status-Farben (Badges):** Diese sind die EINZIGE Ausnahme – sie nutzen Tailwind-Farben, weil sie semantisch sind:
- Erfolg: `bg-emerald-500/10 text-emerald-400`
- Warnung: `bg-amber-500/10 text-amber-400`
- Fehler/Gefahr: `bg-red-500/10 text-red-400`
- Neutral: `bg-gray-500/10 text-gray-400`

**Border-Radius:** Cards/Wrappers `rounded-lg` (8px), Info-Cards `rounded-xl` (12px), Buttons `rounded` (6px), Badges `rounded` (4px).

---

## Spacing & Layout

### PageLayout / PageBody
```
PageLayout:   flex flex-1 min-h-0 flex-col
PageBody:     flex flex-1 min-h-0 flex-col   (KEIN className bei DataTable)
PageBody:     flex flex-1 min-h-0 flex-col gap-4 p-4   (Cards-Seiten: ServicesPage)
```

### DataTable-Seite
| Bereich | CSS |
|---|---|
| DataTable-Container | `-mx-3 -mt-3 min-h-0 flex-1 overflow-y-auto` |
| Toolbar | `shrink-0 -mx-3 -mb-3 min-h-14 flex items-center gap-4 px-4 py-2.5 border-t border-[var(--ds-border)] bg-[var(--ds-surface)]` |
| Skeleton-Zeilen | `space-y-px` Container, 8× `h-14 bg-[var(--ds-surface)] animate-pulse border-b border-[var(--ds-border-subtle)]` |

### EditorPageShell
```
Layout: flex gap-6 zwischen Left-Info (shrink-0 w-[220px]) und Right-Content (flex-1 min-w-0 space-y-6)
Card:   cardClassName="!flex-initial w-[60%]"
Info:   bg-[var(--ds-surface-raised)] rounded-lg p-4 space-y-3
```

### Overview (Stat Cards)
```
Grid: grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4
Card: h-28 rounded-xl border p-5 text-center flex flex-col items-center justify-center
Accent: border-[var(--ds-accent)] bg-[var(--ds-accent-subtle)]
```

### Cards-Seite (ServicesPage)
```
Container: rounded-lg border border-[var(--ds-border)] bg-[var(--ds-surface)] px-4
Card:      border-b border-[var(--ds-border)] last:border-0 py-4
Gap:       space-y-4 zwischen Cards
```

---

## Buttons

### Dashboard-Buttons (NIE raw `<button>`)

**Semantische Actions (DashboardActionButton):** Vordefinierte Aktionen mit Icon + Label + Farbe. Die Action bestimmt die Farbe automatisch.

| Aktion | DashboardActionId | Farbe | Verwendung |
|---|---|---|---|
| Genehmigen | `DashboardActionId.Approve` | Grün (Success) | Approve, Aktivieren |
| Ablehnen | `DashboardActionId.Reject` | Rot (Danger) | Reject, Ablehnen |
| Löschen | `DashboardActionId.Delete` | Rot (Danger) | Löschen, Entfernen |
| Erstellen | `DashboardActionId.Create` | Blau (Primary) | Neu anlegen |
| Abbrechen | `DashboardActionId.Cancel` | Neutral | Abbrechen, Zurück |
| Speichern | `DashboardActionId.Save` | Grün (Success) | Speichern |
| Bearbeiten | `DashboardActionId.Edit` | Neutral | Bearbeiten |
| Schließen | `DashboardActionId.Close` | Neutral | Schließen |

**Props:** `action={DashboardActionId.Xxx}`, `label="Text"`, `onClick={...}`, `disabled={...}`, `type="button"`, optional `size="action"|"control"`.

**Generische Buttons (DashboardButton):**
| Variante | Verwendung |
|---|---|
| `DashboardButtonVariant.Primary` | Hauptaktion ohne vordefinierte Action |
| `DashboardButtonVariant.Neutral` | Sekundäre Aktion |

**Wo gehören Buttons hin?**
- **Card-Footer:** `DashboardSection.Footer` — Review-Buttons (Approve/Reject), Formular-Actions
- **PageHeader:** Als Children — Create/Add-Buttons für die ganze Seite
- **Toolbar:** `Toolbar`-Komponente — Bulk-Actions (Delete selected), Edit-Mode-Toggle
- **Dialog-Footer:** `Dialog.Footer` — Bestätigen/Abbrechen
- **Editor-Toolbar:** `EditorPageShell`-Toolbar-Prop — NUR für klassische Save/Cancel bei Editor-Pages (TrackEditPage-Pattern). NICHT für Review-Buttons.

### Button-Positionierung

**PageHeader-Actions:** In `<PageHeader>`-Children (rechts im Header):
```tsx
<PageHeader title={titel}>
  <DashboardActionButton action={DashboardActionId.Create} icon={...} label={...} size="control" type="button" />
</PageHeader>
```

**Toolbar-Actions:** Im `<Toolbar>`-Sibling (unten, sticky):
```tsx
<Toolbar>
  <span className="text-sm text-[var(--ds-text-muted)]">Count</span>
  <div className="ml-auto flex items-center gap-2">
    <DashboardButton ... />
  </div>
</Toolbar>
```

**Editor-Toolbar:** In `EditorPageShell`'s `toolbar`-Prop (rechts oben im Card-Header):
```tsx
const toolbar = <div className="flex items-center gap-2 ml-auto">
  <EditorToolbarButton variant={DashboardButtonVariant.Primary} icon={...} onClick={...}>Save</EditorToolbarButton>
  <EditorToolbarButton variant={DashboardButtonVariant.Neutral} icon={...} onClick={...}>Cancel</EditorToolbarButton>
</div>;
<EditorPageShell toolbar={toolbar} ...>
```

**Dialog-Footer:** Buttons rechtsbündig, Cancel links, Bestätigung rechts:
```tsx
<Dialog.Footer>
  <EditorToolbarButton variant={DashboardButtonVariant.Neutral} icon={false}>Cancel</EditorToolbarButton>
  <EditorToolbarButton variant={DashboardButtonVariant.Primary} icon={false}>Confirm</EditorToolbarButton>
</Dialog.Footer>
```

### Button-Props (vollständig)
- `type="button"` immer setzen
- `size="action"` für Toolbar/Action-Buttons (32px Höhe)
- `size="control"` für PageHeader-Action-Buttons (36px Höhe)  
- `leadingIcon={<Icon weight="duotone" className="size-3.5" />}` für Icon vor Text
- `icon={false}` wenn kein Icon (nur bei EditorToolbarButton nötig)
- `disabled` bei pending-Mutations

---

## DataTable-Seite – Vollständiges Pattern

```tsx
import {
  DashboardButton,
  DashboardButtonVariant,
} from "@musiccloud/dashboard-ui";
import { SomeIcon } from "@phosphor-icons/react";
import { useMemo, useState } from "react";
import { ContentUnavailableView } from "@/components/ui/ContentUnavailableView";
import { PageHeader } from "@/components/ui/PageHeader";
import { PageBody, PageLayout } from "@/components/ui/PageLayout";
import { type ColumnDef, DataTable } from "@/components/ui/Table";
import { Toolbar } from "@/components/ui/Toolbar";
import { useI18n } from "@/context/I18nContext";

function useColumns(dm: ...): ColumnDef<Item>[] {
  return useMemo(() => [
    {
      id: "name",
      header: dm.colName,
      headerClassName: "whitespace-nowrap",
      sortKey: (i) => i.name.toLowerCase(),
      cell: (i) => <span className="font-medium">{i.name}</span>,
    },
    {
      id: "date",
      header: dm.colDate,
      className: "w-36",
      headerClassName: "whitespace-nowrap",
      sortKey: (i) => i.date,
      cell: (i) => <span className="text-[var(--ds-text-muted)] whitespace-nowrap">{format(i.date)}</span>,
    },
  ], [dm]);
}

export function MyListPage() {
  const { messages } = useI18n();
  const dm = messages.myNamespace;
  const { data, isLoading } = useMyData();
  const columns = useColumns(dm);
  const items = data?.items ?? [];

  const toolbar = items.length > 0 && (
    <Toolbar>
      <span className="text-sm text-[var(--ds-text-muted)]">{dm.count.replace("{n}", String(items.length))}</span>
    </Toolbar>
  );

  return (
    <PageLayout>
      <PageHeader title={dm.title} />
      <PageBody>
        {isLoading && (
          <div className="space-y-px">
            {Array.from({ length: 8 }, (_, i) => `sk-${i}`).map((key) => (
              <div key={key} className="h-14 bg-[var(--ds-surface)] animate-pulse border-b border-[var(--ds-border-subtle)]" />
            ))}
          </div>
        )}
        {!isLoading && items.length === 0 && (
          <ContentUnavailableView icon={<SomeIcon weight="duotone" aria-hidden />} title={dm.empty} className="flex-1 min-h-0" />
        )}
        {!isLoading && items.length > 0 && (
          <div className="-mx-3 -mt-3 min-h-0 flex-1 overflow-y-auto">
            <DataTable columns={columns} data={items} getRowKey={(i) => i.id} stickyHeader defaultSort={{ id: "date", dir: "desc" }} />
          </div>
        )}
      </PageBody>
      {toolbar}
    </PageLayout>
  );
}
```

---

## Cards-Seite – Vollständiges Pattern

```tsx
<PageLayout>
  <PageHeader title={dm.title} />
  <PageBody className="gap-4 p-4">
    {isLoading && <p className="text-sm text-[var(--ds-text-muted)]">{messages.common.loading}</p>}
    {!isLoading && items.length === 0 && <p className="text-sm text-[var(--ds-text-muted)]">{dm.empty}</p>}
    {!isLoading && items.length > 0 && (
      <div className="rounded-lg border border-[var(--ds-border)] bg-[var(--ds-surface)] px-4">
        {items.map((item) => (
          <div key={item.id} className="border-b border-[var(--ds-border)] last:border-0 py-4 flex items-center gap-4">
            <div className="flex-1">{item.name}</div>
            <DashboardButton type="button" variant={DashboardButtonVariant.Primary} size="action" onClick={...}>Action</DashboardButton>
          </div>
        ))}
      </div>
    )}
  </PageBody>
</PageLayout>
```

---

## EditorPage – Vollständiges Pattern

```tsx
const toolbar = (
  <div className="flex items-center gap-2 ml-auto">
    <EditorToolbarButton variant={DashboardButtonVariant.Primary} icon={<CheckIcon weight="duotone" className="w-3.5 h-3.5" />} onClick={handleSave} disabled={saving}>
      {dm.save}
    </EditorToolbarButton>
    <EditorToolbarButton variant={DashboardButtonVariant.Neutral} icon={<XIcon weight="duotone" className="w-3.5 h-3.5" />} onClick={handleCancel}>
      {dm.cancel}
    </EditorToolbarButton>
  </div>
);

<EditorPageShell title={item.name} backLabel={dm.back} onBack={handleCancel} toolbar={toolbar} cardClassName="!flex-initial w-[60%]">
  <div className="flex gap-6">
    <div className="shrink-0 w-[220px] flex flex-col gap-4">
      <div className="bg-[var(--ds-surface-raised)] rounded-lg p-4 space-y-3">
        <div>
          <div className="text-xs font-medium text-[var(--ds-text-muted)] mb-1">{dm.label1}</div>
          <div className="text-sm">{item.field1}</div>
        </div>
      </div>
    </div>
    <div className="flex-1 min-w-0 space-y-6">
      <div>
        <label htmlFor="field" className="block text-xs font-medium text-[var(--ds-text-muted)] mb-1">{dm.field}</label>
        <DashboardInput id="field" type="text" value={val} onChange={...} />
      </div>
    </div>
  </div>
</EditorPageShell>
```

---

## i18n (Lokalisierung)

Alle sichtbaren Texte MÜSSEN via `messages.developer.*` (oder entsprechendem Namespace) kommen. Niemals hartkodierte Strings.

**Pattern:**
```ts
const { messages } = useI18n();
const dm = messages.developer;
// Verwenden: dm.requestsTitle, dm.statusPending, dm.noRequests, etc.
```

**Neue Keys** werden an drei Stellen definiert:
1. Interface `DashboardMessages["developer"]` (in `messages.ts`)
2. DE-Übersetzung in `DASHBOARD_MESSAGES.de.developer`
3. EN-Übersetzung in `DASHBOARD_MESSAGES.en.developer`

---

## Zusammenfassung: Niemals tun

| Falsch | Richtig |
|---|---|
| Raw `<button>` | `DashboardButton` / `DashboardActionButton` / `EditorToolbarButton` |
| Raw `<input>` / `<textarea>` | `DashboardInput` |
| Custom Filter-Pills | `SegmentedControl` |
| Hand-gerolltes `<table>` | `DataTable` + `ColumnDef<T>[]` |
| `PageLayout` + manueller Back-Button | `EditorPageShell` |
| `PageBody` ohne Bedacht | DataTable: kein className; Cards: `className="gap-4 p-4"` |
| `PageBody` für Toolbar | Toolbar als Sibling von PageBody |
| Loading: Spinner oder Text | 8 Skeleton-Zeilen (DataTable) / 4 Cards (Overview) / `<p>` Text (Cards-Seiten) |
| Button-Varianten raten | `Primary` = Hauptaktion, `Neutral` = sekundär |
| Header-Umbruch in DataTable | `headerClassName: "whitespace-nowrap"` |
| Hartkodierte Strings | `messages.developer.*` via `useI18n()` |
| Harte Farbwerte (`#xxx`, `rgb()`) | CSS-Variablen (`var(--ds-*)`) |
| `forwardRef` in React 19 | Normale Funktionskomponente mit `ref` als Prop |
