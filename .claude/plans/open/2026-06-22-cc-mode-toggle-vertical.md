# C/CC-Umschalter → vertikaler Icon-only Control links vom Hero — Implementation Plan

## Preface / Doku-Lücke

Die Zielform des C/CC-Umschalters war eine frühere mündliche Absprache, die **nie in einem Plan/Memory festgehalten** wurde (beim Audit am 2026-06-22 bestätigt: kein Plan, kein Memory, keine Session-Notiz erwähnt sie). Dokumentiert war nur der **gebaute** Stand (cc-pfad-frontend.md, Task 6): horizontaler `EmbossedSegmentedControl` mit Text-Segmenten *über* dem HeroInput (nur Idle) + Modus-Icon *im* Feld. Dieser Plan hält die Zielform fest und setzt sie um.

## Ziel (User-Vision, 2026-06-22)

Den C/CC-Umschalter umbauen auf einen **vertikalen, icon-only Control links neben dem HeroInput**, analog zum Sprachumschalter (`VerticalSegmentedControl`) — **aber mit beiden Optionen permanent sichtbar** (nicht kollabierend).

**User-Entscheidungen:**
- **Hero-Feld-Icon:** entfernen (der Umschalter ist die einzige Mode-Anzeige).
- **Sichtbarkeit:** nur im Idle (wie bisher; verschwindet, sobald ein Ergebnis da ist).
- **Icons:** bleiben — `faCopyright` (Streaming) / `faCreativeCommons` (CC).
- **Layout:** Umschalter + HeroInput bilden EINE horizontal zentrierte Gruppe (nicht: Hero zentriert + Switcher absolut links).

## IST-Zustand

- `EmbossedSegmentedControl` mit zwei Text-Segmenten (`resolveModeSegments`, „Streaming"/„Creative Commons") zentriert ÜBER dem HeroInput, nur `!showCompact` ([LandingPage.tsx:278-288](apps/frontend/src/components/landing/LandingPage.tsx)).
- Modus-Icon LINKS IM Feld (FontAwesome `faCopyright`/`faCreativeCommons`, accent-getönt) ([HeroInput.tsx:162-172](apps/frontend/src/components/landing/HeroInput.tsx)).
- `VerticalSegmentedControl` ist **collapse-by-default**: zeigt nur die aktive Zelle, klappt on-click auf, Auto-Close nach 5s/Escape/Outside ([VerticalSegmentedControl.tsx:50-169](apps/frontend/src/components/ui/VerticalSegmentedControl.tsx)). Sprach-/Day-Night-Switcher nutzen genau das.
- Modus aus persistentem Store (`mc:resolveMode`, Default Commercial) ([resolveMode.ts](apps/frontend/src/lib/resolve/resolveMode.ts)).

## Design

### Kern: nicht-kollabierende Variante des `VerticalSegmentedControl`

Der zentrale Aufwand. Der Control ist collapse-by-default; „beide immer sichtbar" = eine statische Variante. **Empfehlung (DRY):** Prop `static?: boolean` am `VerticalSegmentedControl`:
- `static` → `shown = true` für alle Zellen; kein `open`-State, kein Auto-Close-Timer, keine Outside/Escape-Listener, keine Trigger-Semantik (`aria-haspopup`/`aria-expanded`), kein `inert`. Die aktive Zelle bleibt der embossed Indicator, aber alle Zellen sind permanent gerendert.
- Default (kein `static`) → unverändertes Collapse-Verhalten (Sprach-/Day-Night-Switcher bleiben byte-gleich).
- Der Render (RecessedCard-Track + icon-Cells + Glass) bleibt geteilt; nur die Collapse-Logik wird per Flag übersprungen.

### `ResolveModeSwitcher`-Komponente (analog `LanguageSwitcher`)

Neue Komponente `apps/frontend/src/components/landing/ResolveModeSwitcher.tsx`, gebaut wie [LanguageSwitcher.tsx](apps/frontend/src/components/navigation/LanguageSwitcher.tsx): `<fieldset><legend sr-only>{t("…label")}</legend><VerticalSegmentedControl static segments value={mode} onChange={setResolveMode} /></fieldset>`.
- `segments`: zwei icon-only `Segment<ResolveMode>` (`{ key, label: "", ariaLabel: t("results.modeCommercial"|"results.modeCc"), icon }`). Icons: die bestehenden `faCopyright` (Streaming) / `faCreativeCommons` (CC) wiederverwenden (das Icon „wandert" aus dem Feld in den Control). Icon-Wahl im Browser justierbar.
- CC-Accent (grün): im CC-Modus dieselbe Mechanik wie heute — `data-resolve-mode="cc"`-Scope bzw. die `mc-glass-cc-seg-*`-Flächen, hier auf den vertikalen Track/Indicator gemappt. Token-konform (AGENTS.md), keine ad-hoc-Farben. Im Browser feinjustieren.

### Integration in `LandingPage`

- `EmbossedSegmentedControl`-Block ([:280-288](apps/frontend/src/components/landing/LandingPage.tsx)) entfernen; `resolveModeSegments` (file-lokal) wird obsolet → löschen.
- `ResolveModeSwitcher` LINKS vom HeroInput, als EINE horizontal zentrierte Gruppe: den `searchFieldRef`-Container so umbauen, dass Switcher + HeroInput in einer Zeile (`flex-row items-center`, zentriert) sitzen — die Gruppe ist zentriert, nicht der Hero allein. Nur `!showCompact`.

### HeroInput entschlacken

- Das Modus-Icon-`<span>` ([:162-172](apps/frontend/src/components/landing/HeroInput.tsx)) entfernen; Input-Padding zurück auf den Normalwert; `mode`-Prop entfernen, falls nach dem Icon-Wegfall nirgends mehr gebraucht (prüfen: `data-resolve-mode`/Accent-Scope hängt evtl. am Container, nicht am Icon). FontAwesome-Imports (`faCopyright`/`faCreativeCommons`/`FontAwesomeIcon`) bereinigen, falls ungenutzt.

## Offene Punkte (Browser-Justierung, kein Blocker)
- CC-Grün-Mapping auf Track/Indicator des vertikalen Controls (token-konform, im Browser feinjustieren).
- Vertikale Ausrichtung Switcher↔Hero innerhalb der zentrierten Gruppe (`items-center` vs. Top-Align), im Browser justieren.

## Verified facts (Plan-write-time)
- `VerticalSegmentedControl` collapse-by-default, Props `{segments, value, onChange, className}`, Segment-Felder `{key, icon, ariaLabel, title}` ([VerticalSegmentedControl.tsx:50-169](apps/frontend/src/components/ui/VerticalSegmentedControl.tsx)). ✓ Read.
- `Segment<T>` = `{ key, label, icon?, ariaLabel?, title? }` ([EmbossedSegmentedControl.tsx:20+](apps/frontend/src/components/ui/EmbossedSegmentedControl.tsx)). ✓
- `LanguageSwitcher`-Pattern (fieldset+legend+VerticalSegmentedControl, icon-only segments) ([LanguageSwitcher.tsx](apps/frontend/src/components/navigation/LanguageSwitcher.tsx)). ✓ (Hinweis: dessen TSDoc sagt fälschlich „EmbossedSegmentedControl/persistently visible" — Drift, nicht Teil dieses Plans.)
- Toggle-Ist: `resolveModeSegments` ([LandingPage.tsx:77-82](apps/frontend/src/components/landing/LandingPage.tsx)), Render `:280-288`; `searchFieldRef`-Container `:278`. ✓
- Hero-Feld-Icon: `<span>` mit `FontAwesomeIcon` `faCopyright`/`faCreativeCommons` ([HeroInput.tsx:162-172](apps/frontend/src/components/landing/HeroInput.tsx)), `mode`-Prop `:40/:62`, Input `pl-2` `:190`. ✓
- Store: `getResolveMode`/`setResolveMode`/`subscribeResolveMode`, `mc:resolveMode`, Default Commercial ([resolveMode.ts](apps/frontend/src/lib/resolve/resolveMode.ts)). ✓
- i18n: `results.modeCommercial`=„Streaming", `results.modeCc`=„Creative Commons" (de+en, :43-44). ✓
- `faCreativeCommons` ist ein Brand-Icon (Phosphor hat es nicht — wie die Flaggen-Emojis im LanguageSwitcher); FontAwesome-Nutzung hier gerechtfertigt. `public/icons/creative-commons.svg` existiert als Alternative.
- [ ] Alle Code-Referenzen am Execute-Time re-grep'd.

## Checklist
- [ ] Scheibe 1: `static`-Prop am `VerticalSegmentedControl` (Collapse-Switcher unverändert)
- [ ] Scheibe 2: `ResolveModeSwitcher` (icon-only, CC-Accent) analog LanguageSwitcher
- [ ] Scheibe 3: LandingPage — EmbossedSegmentedControl raus, ResolveModeSwitcher links vom Hero (nur Idle), `resolveModeSegments` löschen
- [ ] Scheibe 4: HeroInput Modus-Icon + `mode`-Prop/FontAwesome-Imports entschlacken
- [ ] Scheibe 5: Gates + Browser-Verify (beide Icons sichtbar links, Wechsel + CC-Grün, Resolve commercial/CC unverändert, Idle-only)
