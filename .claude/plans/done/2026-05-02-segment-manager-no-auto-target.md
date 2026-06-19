# Plan: SegmentManager – Auto-Target-Pick entfernen + Save-Block + Phantom-Eintrag bereinigen

Plan-Nr.: MC-012

**Datum:** 2026-05-02
**Status:** Completed (2026-05-02)
**Commits:** `159138df`, `15f129e6`
**Smoke:** User-bestätigt
**Auslöser:** Beim Anlegen einer neuen segmented Page „Help" entstand ohne erkennbares User-Zutun ein Phantom-`page_segments`-Eintrag `help → privacy, label='Link'`. Folge: Sidebar zeigte „Privacy" unter „Help" statt unter „Information", obwohl der Content-Editor von „Information" Privacy weiterhin korrekt als 4. Segment listete.

## Spec / Goal

1. **Beim Klick auf „Add Segment" darf KEIN Target automatisch zugewiesen werden.** Der User muss explizit eine bestehende Default-Page über das Dropdown auswählen oder per „+ Neue Seite"-Button eine neue erstellen.
2. **Save-Button blockiert, solange irgendein Segment ein leeres Target hat.** Die `canSave`-Prüfung im SegmentManager (Z. 126) wird real-aktiv, nicht mehr nur `void canSave` (Z. 265).
3. **Phantom-Eintrag löschen** — lokal und Prod (`page_segments` id=34 + cascade auf `page_segment_translations`).

## Design

### 1. `apps/dashboard/src/features/content/pages/SegmentManager.tsx`

**`addSegment()` (Z. 237-247) – Auto-Pick raus:**

```ts
function addSegment() {
  const nextIndex = draft.length;
  setDraft([
    ...draft,
    { localId: nextLocalId(), position: nextIndex, label: "", targetSlug: "" },
  ]);
  setActiveIndex(nextIndex);
}
```

Kein `defaultPages[0]?.slug`-Default, kein automatisches Aufpoppen des `CreatePageDialog`. Der bestehende „+ Neue Seite"-Button pro Segment-Row (Z. 334-342) öffnet den Dialog explizit.

**Dropdown-Logik (Z. 290-298) – kein Fallback auf `options[0]`:**

```ts
const dropdownValue = segment.targetSlug;
const options =
  segment.targetSlug && !targetDropdownOptions.some((o) => o.value === segment.targetSlug)
    ? [{ value: segment.targetSlug, label: `/${segment.targetSlug}` }, ...targetDropdownOptions]
    : targetDropdownOptions;
```

Bei leerem `targetSlug` zeigt der Dropdown-Trigger den Placeholder (siehe Punkt 2).

**`canSave` aktivieren (Z. 126, 265):**

`canSave` wird nicht mehr per `void canSave;` ausgegraut. Stattdessen reicht der SegmentManager den invalid-Zustand an den Parent durch. Da der Save in `ContentEditorPage.handleSave` (Z. 611-617) bei `pageType==="segmented"` einfach `segmentSaveRef.current?.()` aufruft, baue ich den Block in die Save-Closure (Z. 132-184): wenn nicht alle Segments ein non-empty Label und Target haben, setzt der SegmentManager `setError(text.invalidSegments)` und kehrt früh zurück, ohne `mutateAsync` aufzurufen. Backend würde sowieso TARGET_NOT_FOUND werfen (admin-segments.ts), aber Frontend-Block vermeidet den Round-Trip und zeigt die Inline-Warnung sofort.

Plus: pro Segment-Row eine Inline-Warnung „Target erforderlich" unter dem Dropdown, sobald `segment.targetSlug === ""`.

### 2. `apps/dashboard/src/components/ui/Dropdown.tsx`

**Neuer optionaler Prop `placeholder`:**

```ts
interface DropdownProps<T extends string = string> {
  // ...bestehend
  placeholder?: string;
}
```

Im Trigger (Z. 126):
```tsx
<span className="flex-1 text-left ...">
  {current?.label ?? (
    <span className="text-[var(--ds-text-subtle)]">{placeholder ?? ""}</span>
  )}
</span>
```

`current` ist `options.find((o) => o.value === value)` (Z. 106). Wenn `value=""` und keine Option `value=""` hat, ist `current` undefined → Placeholder wird gerendert.

### 3. `apps/dashboard/src/i18n/messages.ts`

Die i18n-Keys existieren bereits (verifiziert):
- DE Z. 1238: `targetPlaceholder: "Zielseite wählen"`
- EN Z. 1959: `targetPlaceholder: "Pick a target page"`

Wird einfach via `text.targetPlaceholder` an Dropdown durchgereicht.

Neuer Key: `invalidSegments` für Save-Error (DE: „Mindestens ein Segment hat kein Target.", EN: „At least one segment has no target.").

### 4. DB-Cleanup

**Lokal:**
```sql
DELETE FROM page_segments WHERE id = 34;
-- cascades auf page_segment_translations
```

**Prod (via VPN, gleiche Session):**
```sql
DELETE FROM page_segments WHERE id = 34;
```

Verifikation: `SELECT * FROM page_segments WHERE owner_slug='help';` muss leer sein.

Hinweis: `page_segments_target_slug_fkey` ist `ON DELETE CASCADE`, also würde Privacy-Page gelöscht werden den Segment ebenfalls aufräumen — hier aber ist es der falsche Eintrag der weg muss, nicht die Page.

### 5. Tests

**Backend:** `apps/backend/src/__tests__/admin-segments.test.ts` existiert. Reicht für jetzt — Validierungsweg leeres Target → TARGET_NOT_FOUND ist abgedeckt durch existierende Logik.

**Frontend:** Vitest-Cases für SegmentManager existieren scheinbar nicht. Ich füge keinen neuen Test-Suite hinzu — der UI-Pfad ist klein, aber wir tracken via dashboard UI-test plan (visueller Smoke). Falls UI-Tests gewünscht: in eigenem Plan.

### 6. Strukturelle Schwachstellen, die DIESER Plan NICHT adressiert

Bewusst out of scope (eigener Folge-Plan wenn nötig):

- **Keine DB-Constraint** verhindert, dass dieselbe `target_slug` von mehreren `owner_slug` referenziert wird. Heute Sidebar-„first wins"-Dedup versteckt das. Saubere Lösung wäre `UNIQUE(target_slug)` plus Backend-409 plus Frontend-Filter (eine default-Page, die schon Segment-Target woanders ist, taucht im Dropdown nicht mehr auf).
- **Sidebar dedupliziert silent** — sollte stattdessen einen Warnindikator anzeigen, falls eine Page in mehreren segmented-Parents referenziert wird.

## Implementation – Schritt für Schritt

1. Plan ablegen (= dieser File).
2. `Dropdown.tsx` um `placeholder` erweitern.
3. `SegmentManager.tsx`:
   - `addSegment` neutralisieren
   - `dropdownValue`/`options`-Fallback raus
   - `<Dropdown ... placeholder={text.targetPlaceholder} />`
   - Inline-Warnung pro Row bei leerem Target
   - Save-Closure: Pre-Check `canSave` → setError + return
4. `messages.ts`: neuer Key `invalidSegments` (DE+EN).
5. `npm --workspace=apps/dashboard run lint`, `tsc`.
6. Lokaler psql-DELETE für id=34.
7. Visuelle Smoke (User-Aufgabe nach Feature-Branch-Push): Help anlegen, „Add Segment" klickt → Target leer → Save disabled.
8. Prod-DB-Cleanup via VPN.
9. Plan nach `done/` verschieben.

## Verified facts (re-checked at plan-write time)

- `apps/dashboard/src/features/content/pages/SegmentManager.tsx` Z. 237-247 (addSegment), Z. 89-92 (defaultPages-Filter), Z. 290-298 (dropdownValue Fallback), Z. 126/265 (canSave deklariert + `void canSave`) — `Read` ✓
- `apps/dashboard/src/components/ui/Dropdown.tsx` Z. 11-26 (props), Z. 106 (`current = options.find((o) => o.value === value)`), Z. 125-126 (Trigger-Render `{current?.label}`) — `Read` ✓
- `apps/dashboard/src/i18n/messages.ts` Z. 1238 DE `targetPlaceholder: "Zielseite wählen"`, Z. 1959 EN `targetPlaceholder: "Pick a target page"`, Z. 508 Type-Definition `targetPlaceholder: string` — `grep` ✓
- `apps/dashboard/src/features/content/pages/ContentEditorPage.tsx` Z. 521 `segmentSaveRef = useRef<SegmentSaveFn|null>(null)`, Z. 611-617 `handleSave` ruft `segmentSaveRef.current?.()` für segmented pages, Z. 217-277 lokaler PageEditorHeader mit `onSave`+`disabled={_isSaving}` — `Read` ✓
- `apps/backend/src/services/admin-segments.ts` Z. 22-24 validiert nur `label.trim()` non-empty + Self-Reference, target-leer wird zu TARGET_NOT_FOUND — `Read` ✓
- `apps/backend/src/__tests__/admin-segments.test.ts` existiert — `find` ✓
- DB lokal == Prod (Stand 2026-05-02 19:42 UTC, dump-restore verifiziert): `page_segments id=34 (owner='help', target='privacy', position=0, label='Link')`, `page_segment_translations segment_id=34 (locale='de', label='Link')` — `psql` ✓

- [x] All code references verified (functions, scripts, paths, env vars, package-manager commands)

## Checklist

- [x] `Dropdown.tsx`: optionaler `placeholder`-Prop, render im Trigger wenn `current` undefined
- [x] `SegmentManager.tsx`: `addSegment()` ohne Auto-Pick, keinen `CreatePageDialog`-Auto-Open
- [x] `SegmentManager.tsx`: `dropdownValue`/`options`-Fallback auf `[0]` raus
- [x] `SegmentManager.tsx`: `<Dropdown placeholder={text.targetPlaceholder} />` durchreichen
- [x] `SegmentManager.tsx`: Inline-Warning pro Segment-Row bei leerem Target
- [x] `SegmentManager.tsx`: Save-Closure pre-checks `canSave` und blockt mit setError
- [x] `messages.ts`: neuer i18n-Key `invalidSegments` (DE+EN)
- [x] `npm --workspace=apps/dashboard run lint+tsc` clean
- [x] DB-Cleanup lokal: `DELETE FROM page_segments WHERE id=34;`
- [x] DB-Cleanup Prod: `DELETE FROM page_segments WHERE id=34;` (via VPN, nach User-OK)
- [x] User-Smoke: Help neue Segment-Row → Target leer → Save disabled, Inline-Warnung sichtbar
- [x] Plan nach `.claude/plans/done/` verschieben
