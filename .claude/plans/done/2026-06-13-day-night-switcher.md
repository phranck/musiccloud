# MC-030 — Tag/Nacht-Umschalter im Page-Header

**Status:** abgeschlossen (2026-06-13)
**Branch:** `gsap` (Fortsetzung der MC-029-Arbeit, HEAD `90740e6`)
**Vorgänger:** MC-029 (`done/2026-06-10-gsap-threejs-frontend-migration.md`) — lieferte den Nachthimmel-Stack, dessen Settings/Driver dieses Feature konsumiert.

## Preface

Der Nachthimmel-Hintergrund (MC-029 Phase 4) startet heute fest im Nacht-Modus (`dayness: 0`, `autoDayNight: 0`). Der Shader-Stack bringt den Tag-Modus und die Lokalzeit-Automatik bereits vollständig mit — Settings, Twilight-Mathematik (`daynessForLocalTime`, pure + getestet) und Driver-Clock (`tickAutoClock`) existieren. Es fehlt nur die Bedienoberfläche und eine Lücke in der Laufzeit-Verkabelung.

**User-Anforderung (2026-06-13):** Links vom Sprachumschalter ein Button mit vier Modi: **Tag / Nacht / System / Automatic**. Automatic richtet sich nach der lokalen Uhrzeit des Betrachters.

**User-Entscheidungen (AskUser, 2026-06-13):**
1. **Default für Erstbesucher:** Nacht (Status quo; Tag/System/Automatic sind opt-in — deckt sich mit der Settings-Doku „fixed NIGHT start").
2. **UI-Form:** Dropdown wie der LanguageSwitcher daneben (4 beschriftete Einträge).

**Revision (User, 2026-06-13):** Die ursprünglich gewählte Geolocation-on-demand-Variante (NOAA-Sonnenzeiten je Betrachter-Position) ist gestrichen — „Lass es uns einfach machen." Automatic nutzt die **fixen Twilight-Defaults** aus den Settings (`sunriseHour: 6.5`, `sunsetHour: 20.5`, `twilightHours: 1.5`). Damit entfallen `solar.ts`, `viewerPosition.ts`, jeder Permission-Prompt und der Polar-Edge-Case; die `SetAutoDayNight`-Message braucht nur noch ein `enabled`-Flag, weil die Stunden bereits im Settings-Objekt des Workers liegen.

## Spec / Goal

- Neuer Icon-Button **links** von `<LanguageSwitcher />` in `PageHeader.tsx` (Einfügepunkt vor Zeile 68), gleiche Optik (p-2-Button, Dropdown-Panel `bg-[#1c1c1e]`).
- Vier Modi mit Phosphor-Icons (`weight="duotone"`):
  - **Tag** (`SunIcon`) → Himmel blendet auf `dayness: 1` (animierter Fade über `dayTransition`).
  - **Nacht** (`MoonIcon`) → `dayness: 0` (animierter Fade).
  - **System** (`MonitorIcon`) → folgt `prefers-color-scheme`: dark = Nacht, light = Tag; reagiert live auf OS-Wechsel.
  - **Automatic** (`SunHorizonIcon`) → `autoDayNight: 1` im Driver; Dämmerungs-Verlauf nach lokaler Uhrzeit mit den fixen Default-Stunden (6:30/20:30, 1,5 h Twilight-Fenster) — `tickAutoClock` spielt Morgen-/Abenddämmerung in Echtzeit aus, solange die Seite offen ist.
- Modus wird in localStorage persistiert und überlebt Reloads + ClientRouter-Navigationen.
- Umami-Signal pro tatsächlichem Mode-Wechsel (Konvention `Group: Detail`).
- Labels lokalisiert (de/en).
- **Scope-Abgrenzung:** Der Schalter steuert ausschließlich den **Himmel** (dayness-Blend des WebGL-Hintergrunds). Er ist KEIN Site-weites Light-Theme — UI-Chrome (Cards, Text, Dropdowns) bleibt in allen Modi dunkel. Der Tag-Look des Himmels ist seit dem Prototyp-Sign-off (2026-06-12) abgenommen.

## Design

### Architektur-Überblick

```
DayNightSwitcher (Header-Island, UI)
   │  setDayNightMode(mode)
   ▼
dayNightMode.ts (Module-Store: Persistenz + Subscriber; Vorbild analyzerMode.ts)
   │  subscribeDayNightMode(cb)
   ▼
BackgroundScene.tsx (Bridge: Mode → Worker-Messages / Fallback-Driver-Calls)
   │  nutzt dayNightPolicy.ts (pure Mode→dayness-Mapping)
   ▼
protocol.ts (NEU: SetAutoDayNight) → worker.ts → NightSkyDriver.setAutoDayNight()
```

Beide Islands (Header + Background) teilen den Module-Store über den gemeinsamen ES-Module-Graph — dasselbe bewährte Muster, mit dem `analyzerMode.ts` mehrere Player-Islands synchronisiert. Die bestehende `mc:night-sky`-CustomEvent-API bleibt unverändert als generische Runtime-API bestehen (sie hat bisher keine Dispatcher und wird von diesem Feature nicht benutzt — der Store-Weg ist typsicher und direkter).

### Neue/geänderte Module

1. **`background/dayNightMode.ts` (NEU)** — Mode-Store nach `analyzerMode.ts`-Vorbild:
   - `DayNightMode = { Day: "day", Night: "night", System: "system", Automatic: "automatic" } as const` (PascalCase-Namespace per domain-literals-Regel).
   - `getDayNightMode()` / `setDayNightMode(mode)` / `subscribeDayNightMode(cb)`; localStorage-Key `"mc.background.dayNightMode"`; SSR-safe (`typeof window`-Guards, try/catch um Storage); Default `Night`.
   - Bewusst OHNE dayness-Wissen (SRP) — reine Mode-Verwaltung.

2. **`background/dayNightPolicy.ts` (NEU)** — pure Mode→dayness-Übersetzung (Business-Rule getrennt von Mechanik):
   - `daynessForMode(mode, { prefersDark, date })` → Ziel-dayness: Day = 1, Night = 0, System = `prefersDark ? 0 : 1`, Automatic = `daynessForLocalTime(date, NIGHT_SKY_DEFAULTS)`.
   - Eine Datei, eine Funktion — von Init-Pfad, Wechsel-Pfad und Tests gemeinsam konsumiert (DRY).

3. **`nightSky/protocol.ts` (ERWEITERN)** — neue Message `SetAutoDayNight`:
   ```ts
   SetAutoDayNight: "setAutoDayNight"
   interface SetAutoDayNightMessage {
     type: typeof NightSkyMessageType.SetAutoDayNight;
     enabled: boolean;
   }
   ```
   Keine Stunden-Payload — `sunriseHour`/`sunsetHour`/`twilightHours` stehen seit dem Init im Settings-Objekt des Workers.

4. **`nightSky/loop.ts` (ERWEITERN)** — `NightSkyDriver.setAutoDayNight(enabled: boolean)`:
   - Schreibt `settings.autoDayNight` (1/0).
   - Bei `enabled`: startet einen animierten Fade auf `daynessForLocalTime(new Date(), settings)` — der bestehende Guard `if (autoDayNight !== 1 || this.fade) return` in `tickAutoClock` pausiert die Clock bis Fade-Ende, danach übernimmt sie nahtlos. Unter reduced motion snappt `setDayness` wie gehabt.
   - Bei `!enabled`: nur Flag aus — den Ziel-Fade schickt die Bridge als separates `SetDayness` (Reihenfolge: erst `SetAutoDayNight(false)`, dann `SetDayness(target, animated)`).
   - Worker nutzt `new Date()` — Worker erben die lokale Zeitzone des Browsers, keine Sonderbehandlung nötig (bestehendes `tickAutoClock`-Verhalten).

5. **`nightSky/worker.ts` (ERWEITERN)** — neuer `case SetAutoDayNight` → `driver.setAutoDayNight(message.enabled)`.

6. **`BackgroundScene.tsx` (ERWEITERN)** — Bridge-Anbindung:
   - **Boot:** Init-Settings aus `{ ...NIGHT_SKY_DEFAULTS, ...overridesForMode }` statt hart `NIGHT_SKY_DEFAULTS` (gilt für Worker-Init-Message UND Fallback-Pfad). Day/Night/System setzen `dayness` direkt; Automatic setzt `autoDayNight: 1` plus `dayness` auf den aktuellen Clock-Wert (`daynessForMode`) — der erste Frame stimmt ohne sichtbaren Nachregel-Fade.
   - **Subscribe:** `subscribeDayNightMode` → bei Wechsel die passenden Messages posten (Worker-Pfad) bzw. Driver-Methoden rufen (Fallback-Pfad) — beide Pfade symmetrisch wie bei den bestehenden Handlern.
   - **System-Modus:** „change"-Listener auf `matchMedia("(prefers-color-scheme: dark)")` mit Guard `mode === System` im Handler (kein Add/Remove-Tanz beim Mode-Wechsel).

7. **`navigation/DayNightSwitcher.tsx` (NEU)** — UI nach `LanguageSwitcher.tsx`-Vorbild:
   - Trigger-Button: Icon des aktiven Modus, `size-[18px]`, `weight="duotone"`, `aria-hidden` am Icon, `aria-label`/`aria-expanded` am Button; `useOutsideClick` fürs Schließen.
   - Dropdown: 4 Einträge (Icon + lokalisiertes Label), aktiver Eintrag hervorgehoben (gleiche Klassen wie im LanguageSwitcher).
   - SSR/Hydration: `useSyncExternalStore(subscribeDayNightMode, getDayNightMode, () => Night)` — Server-Snapshot ist der Night-Default, der Client-Snapshot liest den Store, React reconciled direkt nach der Hydration. (Revision beim Execute: der ursprünglich geplante Mount-Effect-Sync nach `useAnalyzerMode`-Muster ist ein React-Doctor-`no-initialize-state`-Befund — der Pre-Commit-Hook blockt ihn; `useSyncExternalStore` ist das idiomatische Pattern für externe Stores.)
   - Umami nur bei tatsächlichem Wechsel (Muster LanguageSwitcher `if (code !== locale)`).
   - Einbau in `PageHeader.tsx` direkt vor `<LanguageSwitcher />`.

8. **`lib/analytics/umami.ts` (ERWEITERN)** — `SkySignal = { Day: "Sky: Day", Night: "Sky: Night", System: "Sky: System", Automatic: "Sky: Automatic" } as const`.

9. **`i18n/translations/de.json` + `en.json` (ERWEITERN)** — 5 Keys: `dayNight.label` (aria, „Hintergrund-Modus"/"Background mode"), `dayNight.day`, `dayNight.night`, `dayNight.system`, `dayNight.automatic`.

### Risiken / Hinweise

- **Lesbarkeit im Tag-Modus:** weißer UI-Text über hellem Tag-Himmel — der Tag-Look ist vom Prototyp abgenommen; finale Beurteilung gehört zum User-Sichttest (Gate).
- **Settings-Header-Doku** (`settings.ts` Zeilen 7–9: „remain opt-in features of the BackgroundScene API") bleibt sachlich korrekt; der BackgroundScene-TSDoc wird um den Store-Pfad ergänzt.

## Implementation

TDD (RED → GREEN) je Task; Gates vor jedem Commit: `pnpm test:run`, `pnpm --filter @musiccloud/frontend exec astro check`, `pnpm lint`, `pnpm doctor:diff`. Commits einzeln nach Freigabe.

### Task 1 — Driver-/Protokoll-Erweiterung
- RED: `loop.test.ts`-Erweiterung (setAutoDayNight: enable→Fade auf Clock-Wert→Clock folgt; disable→Flag aus; reduced motion snappt).
- GREEN: `protocol.ts` (`SetAutoDayNight`), `loop.ts` (`setAutoDayNight`), `worker.ts` (Case).
- Commit: `Feat: runtime auto-day-night switch in the night-sky driver protocol`

### Task 2 — Mode-Store + Policy
- RED: `dayNightMode.test.ts` (Default Night, persist, validate, subscribe), `dayNightPolicy.test.ts` (Day=1, Night=0, System nach prefersDark, Automatic via `daynessForLocalTime`).
- GREEN: `background/dayNightMode.ts`, `background/dayNightPolicy.ts`.
- Commit: `Feat: day-night mode store with dayness policy mapping`

### Task 3 — Bridge-Anbindung BackgroundScene
- RED: `BackgroundScene.test.tsx`-Erweiterung am Fallback-Pfad (Mock `createNightSkyScene` existiert): Boot respektiert gespeicherten Mode; Store-Wechsel ruft Driver-Methoden in korrekter Reihenfolge; System-Change-Listener greift nur im System-Modus.
- GREEN: `BackgroundScene.tsx` (Init-Overrides, subscribe, prefers-color-scheme-Handler).
- Commit: `Feat: drive the night-sky day blend from the day-night mode store`

### Task 4 — UI + Header + i18n + Analytics
- RED: `DayNightSwitcher.test.tsx` (Render Default-Icon, Dropdown öffnen, Auswahl→Store+Signal, kein Signal bei identischem Modus, aria-Attribute).
- GREEN: `navigation/DayNightSwitcher.tsx`, Einbau `PageHeader.tsx`, `umami.ts` (`SkySignal`), de/en-Keys.
- Commit: `Feat: add the day-night switcher to the page header`

### Task 5 — Browser-Gate (Prod-Build :3002, chrome-devtools-mcp)
- Switcher sichtbar links vom Sprachumschalter; Dropdown öffnet/schließt (outside click).
- Tag-Wahl → sichtbarer 1-s-Fade des Himmels; Nacht zurück.
- System: via `emulate` prefers-color-scheme light/dark live umschalten.
- Automatic: Mode wählen → dayness entspricht der lokalen Uhrzeit (Default-Stunden).
- Persistenz: Reload + ClientRouter-Navigation (Landing ↔ /info) behalten Modus + Himmel-Zustand (persistente Islands dürfen nicht remounten).
- Konsole fehlerfrei; danach User-Sichttest in Safari.

## Verified facts (2026-06-13 beim Plan-Schreiben, Branch `gsap`, HEAD `90740e6`)

- `PageHeader.tsx:68` — `<LanguageSwitcher />`; Header-Island persistent via `BaseLayout.astro:77` `transition:persist="mc-header"`, Background via `:70` `transition:persist="mc-background"` (Read ✓)
- `LanguageSwitcher.tsx` — Dropdown-Muster: Button `p-2 opacity-70`, Panel `absolute top-full right-0 … bg-[#1c1c1e]`, `useOutsideClick`, Signal-Guard `if (code !== locale)` (Read ✓)
- `nightSky/settings.ts` — `dayness`, `dayTransition`, `autoDayNight: 0 | 1`, `sunriseHour: 6.5`, `sunsetHour: 20.5`, `twilightHours: 1.5` in `NIGHT_SKY_DEFAULTS`; `daynessForLocalTime(date, config)` pure + getestet (Read ✓)
- `nightSky/loop.ts` — `NightSkyDriver.setDayness(target, {animated})` mit Fade; `tickAutoClock()` mit Guard `if (this.settings.autoDayNight !== 1 || this.fade) return`; `settings`-Objekt shared by reference (Read ✓)
- `nightSky/protocol.ts` — Messages Init/Resize/Visibility/ReducedMotion/SetDayness/SetAnimate; KEIN Runtime-Setter für autoDayNight (Read ✓)
- `nightSky/worker.ts` — Message-Switch, `driver.setDayness(…)`-Dispatch-Muster (Read ✓)
- `BackgroundScene.tsx` — Worker-Init postet `settings: NIGHT_SKY_DEFAULTS` (Zeile 191); Fallback-Pfad `bootFallback()` mit `NightSkyDriver` + `gsap.ticker`; `mc:night-sky`-Event-API ohne externe Dispatcher (grep ✓ — kein Treffer außerhalb BackgroundScene)
- `playback/analyzerMode.ts` — Module-Store-Vorbild: localStorage-Key `"mc.player.analyzerMode"`, Subscriber-Set, SSR-Guards, try/catch (Read ✓)
- `i18n/context.tsx` — `useT()`/`useLocale()`, flache Keys, eager-bundled de/en (Read ✓); `translations/de.json` + `en.json` je 94 Zeilen flaches `Record<string,string>` (head ✓)
- `lib/analytics/umami.ts` — `sendMusicSignal(name)`, as-const-Signal-Namespaces (`DisplaySignal`, `languageSignal`-Muster `Group: Detail`) (Read ✓)
- `hooks/useOutsideClick.ts` existiert (ls ✓)
- Phosphor `@phosphor-icons/react` (apps/frontend/node_modules): `SunIcon`, `MoonIcon`, `MonitorIcon`, `SunHorizonIcon` als Exporte verifiziert (grep dist/csr/*.d.ts ✓); Projekt-Importstil `import { XxxIcon } from "@phosphor-icons/react"` (grep ✓)
- Höchste Plan-Nr.: MC-029 → dieser Plan ist MC-030 (grep ✓)
- pnpm ist Package-Manager (`pnpm@10.33.1`); Tests via `pnpm test:run` (MC-029-Gates ✓)
- OpenSpec: Verzeichnis lokal nicht vorhanden, `openspec/` gitignored (Commit `b5438cf`); MC-029-Feat-Commits ohne OpenSpec-Ref → Muster fortgeführt (ls/git log ✓)
- Worker erben die Zeitzone des Browsers (Web-Platform-Verhalten; `tickAutoClock` nutzt bereits `new Date()` im Worker-Kontext — bestehender Code, kein neues Risiko)

## Open questions

- Keine — Design-Gabeln per User-Entscheidung fixiert; Geolocation-Variante per Revision gestrichen.

## Checklist

- [ ] All code references verified (functions, scripts, paths, env vars, package-manager commands) — Verified-facts-Block oben, am Execute-Start re-greppen
- [x] Task 1 — Driver/Protokoll SetAutoDayNight (RED→GREEN, Commit `a50ef64`; Gates grün 2026-06-13: 120/120 Frontend-Tests, astro check 0/0, biome clean, doctor 0 issues)
- [x] Task 2 — Store + Policy (RED→GREEN, Commit `9c365a6`; Gates grün 2026-06-13: 128/128 Frontend-Tests; Nebenbefund: jsdom 29 ohne localStorage → Map-Mock aus LandingPage.test.tsx nach `src/test/localStorageMock.ts` extrahiert)
- [x] Task 3 — BackgroundScene-Anbindung (RED→GREEN, Commit `3ac9e7c`; Gates grün 2026-06-13: 134/134 Frontend-Tests; Test-matchMedia-Stub auf per-Query-State mit Listener-Dispatch umgebaut)
- [x] Task 4 — DayNightSwitcher + Header + i18n + Umami (RED→GREEN, Commit `3f90a3e`; Gates grün 2026-06-13: 138/138 Frontend-Tests; Pre-Commit-Doctor-Befund `no-initialize-state` behoben via `useSyncExternalStore` statt Mount-Effect-Sync)
- [x] Task 5 — Browser-Gate grün (2026-06-13, Prod-Build :3002, chrome-devtools-mcp); User-Sichttest Safari ausstehend

---

## Completed

**Abgeschlossen am 2026-06-13** (Branch `gsap`, HEAD `3f90a3e`). Alle 5 Tasks, alle Gates grün.

**Commits:**
- `a50ef64` — SetAutoDayNight-Message + `NightSkyDriver.setAutoDayNight` (enable faded auf Clock-Wert, Clock übernimmt; disable überlässt den Ziel-Fade der Bridge; geteilte `clockDayness`-Quantisierung)
- `9c365a6` — `dayNightMode`-Store (Day/Night/System/Automatic, localStorage `mc.background.dayNightMode`, Default Night) + pure `daynessForMode`-Policy; Nebenbefund: jsdom 29 ohne localStorage → Map-Mock als geteilter Test-Helper `src/test/localStorageMock.ts` extrahiert
- `3ac9e7c` — BackgroundScene-Bridge: Boot-Settings spiegeln den gespeicherten Mode (erster Frame korrekt, Automatic bootet mit Clock-dayness), Store-Subscribe → Worker-Messages/Driver-Calls (Automatic-aus VOR Ziel-Fade), `prefers-color-scheme`-Listener mit System-Guard; Test-matchMedia-Stub auf per-Query-State umgebaut
- `3f90a3e` — DayNightSwitcher links vom LanguageSwitcher (Dropdown, Phosphor Sun/Moon/Monitor/SunHorizon duotone), `useSyncExternalStore`-Binding (Pre-Commit-Doctor-Befund `no-initialize-state` ersetzte den geplanten Mount-Effect-Sync), `SkySignal`-Umami-Namespace, de/en-Keys

**Browser-Gate-Befunde (Prod-Build :3002, Chrome):**
- Switcher links vom Sprachumschalter, Dropdown mit 4 Einträgen, `aria-expanded` korrekt, Outside-Click schließt
- Tag-Wahl → sichtbarer 1-s-Fade Nacht→Sommerhimmel; Trigger-Icon wechselt mit
- System: emuliertes dark→Nacht, light→Tag, Live-OS-Flip ohne Reload als animierter Fade
- Automatic um 02:15 lokale Zeit → Nachthimmel (fixe Twilight-Defaults 6:30/20:30)
- Persistenz: Reload behält `automatic` (Trigger-Label korrekt via useSyncExternalStore); ClientRouter-Navigation Landing→/info ohne Canvas-Remount (DOM-Marker überlebt), Mode bleibt
- Konsole: KEINE neuen Befunde — nur die zwei dokumentierten pre-existing (Hero-Input id/name-Hinweis, apple-meta-Deprecation)
- Statische Gates final: Frontend 138/138, Backend 980, astro check 0/0, biome clean, doctor 0 issues

**Offen außerhalb des Plans:** User-Sichttest in Safari (insbesondere Tag-Modus-Lesbarkeit: heller Footer-Text auf hellem Himmel — Tag-Look ist vom Prototyp abgenommen, UI-Chrome bleibt bewusst dunkel). Post-Deploy-Umami-Check der vier Sky-Signale.

**Follow-up (User-Entscheidung 2026-06-13, nach Abschluss):** Der DayNightSwitcher ist im UI wieder AUSGEBLENDET — Einbau in `PageHeader.tsx` entfernt (Begründungs-Kommentar im PageHeader-TSDoc), Komponente/Store/Bridge/Tests bleiben vollständig funktionsfähig. Re-Aktivierung = Import + `<DayNightSwitcher />` vor `<LanguageSwitcher />`.
