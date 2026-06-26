# Flächenbezogenes Typografie-Token-System

Plan-Nr.: MC-037

## Preface

Heute ist Text global: `DesignTokens.text = Record<TextLevelKey, DayNight<TextFields>>`
mit `TextLevel = primary | secondary | muted`, je `{color, opacity}`. `glass.css`
biegt diese drei auf die globalen `--color-text-primary/secondary/muted` um;
jede Fläche nutzt dieselben drei Stufen.

Ziel ist ein **flächenbezogenes** System: je Fläche (EmbossedCard, RecessedCard,
Buttons, EmbossedCard-Title) eigene Stufen **bright/normal/dimmed** × Day/Night +
**Font (Familie + Size + Weight)**; der Title zusätzlich **Capitalization**.
„Buttons" deckt Buttons + Track-Rows + Event-Rows + Service-Buttons ab.

Vom User freigegebene Entscheidungen:
- **Ersetzen** (nicht überlagern): die globalen `{primary,secondary,muted}` fallen
  weg, ersetzt durch per-Fläche-Gruppen.
- **Font = Familie + Size + Weight** je Fläche.
- **Separiert Day/Night** uniform → passt 1:1 in die bestehende
  `group × {day,night} × field`-Maschinerie (`buildContentState`/`buildTuneSection`).
- Diskrete Felder (`fontFamily`, `capitalization`) sind nicht interpolierbar →
  es wird **ein** Wert verwendet (Night), exakt wie skytext heute `--skytext-font`
  aus night emittiert. Cross-fade nur für `color/opacity/fontSize/fontWeight`.
- **Prototyp + JSON first** (wie der Hero). Produktions-Komponenten umverdrahten =
  Follow-up.

## Ziel

`DesignTokens.text` ist per-Fläche; im Prototyp tunebar und als JSON exportierbar;
Produktion bleibt **unverändert lauffähig** über eine Übergangs-Abbildung der
globalen `--color-text-*` aus der Embossed-Fläche. Alle Tests grün.

## Design

### Domain-Literals (PascalCase, react-doctor-konform)

```ts
export const TextSurface = {
  Embossed: "embossed",
  Recessed: "recessed",
  Button: "button",
  EmbossedTitle: "embossedTitle",
} as const;
export const TextEmphasis = { Bright: "bright", Normal: "normal", Dimmed: "dimmed" } as const;
export const TextCapitalization = {
  None: "none", Uppercase: "uppercase", Lowercase: "lowercase", Capitalize: "capitalize",
} as const;
```

### Schema (`DesignTokens.text`)

Ersetzt `Record<TextLevelKey, DayNight<TextFields>>` durch:

```ts
text: Record<TextSurfaceKey, DayNight<TextSurfaceFields>>;

interface TextSurfaceFields {
  fontFamily: string;        // aus TYPO_FONTS (font-kind)
  fontSize: number;          // px (range, z.B. 8..48)
  fontWeight: number;        // aus TYPO_WEIGHTS (enum-kind: 400/500/600/700/900)
  capitalization: string;    // aus TextCapitalization (enum-kind; nur EmbossedTitle konsumiert)
  brightColor: string; brightOpacity: number;
  normalColor: string; normalOpacity: number;
  dimmedColor: string; dimmedOpacity: number;
}
```

Uniform für alle 4 Flächen (eine `fields`-Liste), damit `buildContentState`/
`buildTuneSection`/`sanitizeDayNight` 1:1 greifen. `capitalization` wird nur beim
`EmbossedTitle` gerendert (Feld-Skip, s.u.) und nur dort konsumiert.

### Field-Specs / Validierung (`design-tokens.ts`)

Neue `FieldSpec`-Art `enum`:

```ts
type FieldSpec =
  | { kind: "color" } | { kind: "number"; min; max; bool? }
  | { kind: "font" } | { kind: "enum"; values: readonly string[] };
```

- `sanitizeField` bekommt einen `enum`-Zweig (Wert muss in `values` sein, sonst
  Fallback).
- `TEXT_SURFACE_FIELD_SPECS`: `fontFamily: font`, `fontSize: number(8,48)`,
  `fontWeight: number(100,900)`, `capitalization: enum(TextCapitalization-Werte)`,
  `brightColor/normalColor/dimmedColor: color`, `*Opacity: number(0,1)`.
- `TYPO_FONTS` = die drei `SKYTEXT_FONTS` (Barlow / Roboto / system) wiederverwenden.
- `fontWeight` als **number** (100..900, step 100) — cross-fadet via calc, daher
  keine enum-Art nötig. `capitalization` als **enum** (diskret, Night-Wert).

### Defaults (`TEXT_SURFACE_DEFAULTS`)

Gemappt aus dem heutigen Stand (1:1, kein visueller Bruch bei leerem Blob):

| Fläche | Font | bright | normal | dimmed |
|---|---|---|---|---|
| embossed | Barlow / 14px / 500 | day #fff α1 · night #f5f5f7 α1 | day #fff α.6 · night #c7c7cc α1 | day #fff α.4 · night #9a9aa0 α1 |
| recessed | Barlow / 14px / 500 | wie embossed | wie embossed | wie embossed |
| button | Barlow / 16px / 500 | wie embossed | wie embossed | wie embossed |
| embossedTitle | Roboto Condensed / 20px / 600, capitalization `none` | day #fff α1 · night #f5f5f7 α1 | … | … |

(Stufenfarben = die heutigen primary/secondary/muted aus `TEXT_DEFAULTS`. Fonts =
die heute real verwendeten: Barlow Body, Roboto Condensed für Titel/Labels.)

### designTokensCss-Emission

Pro Fläche `S`, Stufe `L ∈ {bright,normal,dimmed}`, Modus `M ∈ {day,night}`:
- `--text-<S>-<L>-<M>: rgba(color, opacity)` (cross-fade via color-mix in glass.css)
- `--text-<S>-size-<M>: <px>` , `--text-<S>-weight-<M>: <n>` (cross-fade via calc)
- `--text-<S>-font: <fontFamily night>` (diskret, night)
- `--text-<S>-transform: <capitalization night>` (diskret, night; nur embossedTitle relevant)

### glass.css-Konsum + Übergangs-Abbildung

- Pro Fläche cross-faded Intermediates am `:root` (oder Flächen-Scope):
  `--mc-text-<S>-<L> = color-mix(day, night, --g-dayness)`,
  `--mc-text-<S>-size/weight = calc(day*d + night*(1-d))`.
- Flächen-Scopes setzen für Nachfahren:
  `.embossed-gradient-border { font-family: var(--text-embossed-font); font-size: var(--mc-text-embossed-size); font-weight: var(--mc-text-embossed-weight); --mc-text-bright/normal/dimmed: … }`
  analog `.recessed-gradient-border`, `.mc-glass-button`. EmbossedTitle wird per
  Klasse am Title-Element konsumiert (`text-transform: var(--text-embossedTitle-transform)`).
- **Übergangs-Abbildung** (damit Produktion nicht bricht, solange Komponenten noch
  `text-text-*` nutzen): `--color-text-primary: var(--mc-text-embossed-bright)`,
  `--color-text-secondary: var(--mc-text-embossed-normal)`,
  `--color-text-muted: var(--mc-text-embossed-dimmed)` am `:root`. Ersetzt die
  heutige Umbiegung aus `--text-primary/secondary/muted-*`.

### Prototyp (`frontend-prototype.html`)

- `TYPO_SURFACES` (groups: embossed/recessed/button/embossedTitle, je label),
  `TYPO_FIELDS` (font-Select, size-range, weight-range, capitalization-select +
  6× color/opacity), `TYPO_DEFAULTS` (= shared-Defaults gespiegelt).
- `capitalization`-Feld-Skip: in `buildTuneSection` Bedingung wie `frostOnly/noFrost`
  ergänzen — `if (f.titleOnly && g.key !== "embossedTitle") continue;`.
- `applyTypography()` schreibt die Vars (analog `applyText`, plus size/weight/font/
  transform). `buildTypographyControls()`, `typoCfg`, `saveTypo()`, Store-Key.
- Export (`copy`, Zeile 1624): `text: textCfg` → `text: typoCfg` (neuer Shape).
  Import (`paste`, Zeile 1650-1656): `buildContentState(parsed.text, TYPO_DEFAULTS,
  TYPO_SURFACES, TYPO_FIELDS)`. Reset (`reset-glass`, Zeile 3319): `typoCfg =
  structuredClone(TYPO_DEFAULTS)`.
- Sidebar-Sektion `#sec-text` umbauen (Label „Typography"); `wireStaticSections`
  (Zeile 3306) Liste prüfen.
- Konsum in den Sample-Komponenten umverdrahten (heute `body.glass .track-name`
  etc. aus `--text-primary/secondary-day/night`, Zeile 595-601):
  - `.emb-header-title` → embossedTitle (font + transform + bright)
  - `.track-name`, `.svc-name` → button normal
  - `.track-album`, `.track-dur` → button dimmed
  - `.recessed-title`, `.section-title` → recessed normal
  - `.emb-body p` → embossed normal
  - `.seg-btn--active/--inactive` → button normal/dimmed

### Was NICHT in dieser Lieferung

Produktions-Komponenten von `text-text-*` auf die flächen-scoped Tokens
umverdrahten + Übergangs-Abbildung entfernen. Eigener Folge-Schritt (inkl.
Hero-Text aus A).

## Implementation

1. `packages/shared/src/design-tokens.ts`: Domain-Literals, `TextSurfaceFields`,
   `TextSurfaceKey`, `text`-Feld im `DesignTokens`-Interface, `enum`-FieldSpec +
   `sanitizeField`-Zweig, `TEXT_SURFACE_FIELD_SPECS`, `TYPO_FONTS`/`TYPO_WEIGHTS`,
   `TEXT_SURFACE_DEFAULTS`, `DESIGN_TOKENS_DEFAULTS.text`, Parser-Loop (`text`).
   Alte `TextLevel`/`TextFields`/`TEXT_DEFAULTS`/`TEXT_FIELD_SPECS` entfernen.
2. `packages/shared/src/__tests__/design-tokens.test.ts`: Tests auf neuen Shape
   anpassen (Default-Roundtrip, Clamp, unknown-key-drop, enum-Fallback).
3. `apps/frontend/src/lib/designTokensCss.ts`: `text`-Emission auf per-Fläche
   umstellen (Vars s.o.).
4. `apps/frontend/src/styles/glass.css`: per-Fläche-Intermediates + Flächen-Scope-
   Konsum + Übergangs-Abbildung der `--color-text-*`. Alte `--text-*-day/night`
   `:root`-Seeds + Umbiegung ersetzen.
5. `frontend-prototype.html`: TYPO-Defs, Builder, apply, Serialisierung, Sektion,
   Sample-Konsum, Feld-Skip.
6. Verifikation: `pnpm --filter @musiccloud/shared test`; Frontend Browser (Day/Night,
   Text unverändert via Übergangs-Abbildung); Prototyp (file://) Controls + Copy/Paste/
   Reset + Sample-Text reagiert.
7. Gates: astro check, Biome, `doctor:diff`, shared-Tests. Clean-State-Check für
   shared (workspace-konsumiert): `rm -rf packages/shared/dist node_modules …` ist
   hier nicht nötig (kein Schema-Konsument bricht), aber `pnpm -r test` muss grün
   sein.

## Verified facts

- [x] `DesignTokens.text = Record<TextLevelKey, DayNight<TextFields>>`,
  `TextLevel = primary|secondary|muted` — `packages/shared/src/design-tokens.ts:48-54,95-100,238`.
- [x] Parser-Loop `text` nutzt `sanitizeDayNight` + `TEXT_FIELD_SPECS` —
  `design-tokens.ts:843-853,626-629`.
- [x] `FieldSpec`-Arten color/number/font; `sanitizeField`-Switch —
  `design-tokens.ts:611,696-720`. `enum`-Zweig + `sanitizeField` ergänzen.
- [x] `designTokensToCss` emittiert `--text-${level}-${day|night}` aus `tokens.text`
  — `apps/frontend/src/lib/designTokensCss.ts:64-68`.
- [x] glass.css seedet `--text-primary/secondary/muted-day/night` (`:root`) und
  biegt `--color-text-*` per color-mix um — `apps/frontend/src/styles/glass.css:163-170,234-244`.
- [x] skytext-Präzedenz: diskreter Font wird aus night emittiert
  (`--skytext-font: st.night.fontFamily`) — `designTokensCss.ts:107`.
- [x] Prototyp: `buildContentState(saved, defaults, groups, fields)` iteriert
  `groups × {day,night} × fields` — `frontend-prototype.html:2867-2874`.
- [x] `buildTuneSection(rootId, groups, fields, cfg, collapsed, mode, onChange)` +
  Feld-Skip-Muster `if (f.frostOnly && g.noFrost) continue;` —
  `frontend-prototype.html:3223-3263,3256`.
- [x] `applyText` schreibt `--text-${lvl}-${mode}` — `frontend-prototype.html:2918-2924`.
- [x] Select-Feld-Typ existiert (skytext fontFamily) — `frontend-prototype.html:2713`.
- [x] Export `text: textCfg` (Zeile 1624); Import `parsed.text` →
  `buildContentState(... TEXT_DEFAULTS, TEXT_LEVELS, TEXT_FIELDS)` (1650-1656);
  Reset `textCfg = structuredClone(TEXT_DEFAULTS)` (3319).
- [x] Prototyp-Text-Konsum heute aus `--text-primary/secondary-day/night` —
  `frontend-prototype.html:595-601`.
- [x] `body.glass` immer an (3007); `--g-dayness` treibt Cross-fade.
- [ ] OFFEN bis Execute: `buildTuneField`-Signatur/Typen (color/range/select)
  vollständig lesen, bevor `enum`/select-Felder ergänzt werden.

## Checklist

- [x] Alle Code-Referenzen re-verifiziert (`buildTuneField` Zeile ~3123: select/range/
  color, `cfg[ck][mode][f.key]`; Select-Options `[{label,value}]`).
- [x] shared: Schema/Literals (`TextSurface`/`TextEmphasis`/`TextCapitalization`)/
  Defaults/Parser/`enum`-Kind + Tests (44 passed, inkl. neue per-Fläche + enum).
- [x] designTokensCss: per-Fläche-Emission (`--text-<surface>-<level>-<mode>` +
  size/weight; font/transform aus night).
- [x] glass.css: Embossed-Intermediates + Übergangs-Mapping `--color-text-*`;
  Produktion-Text live verifiziert unverändert (`--color-text-primary` → embossed
  bright, Hero-Input #f5f5f7 bei Nacht).
- [x] Prototyp: Typography-Sektion (4 Flächen), Controls, `applyTypography`,
  Copy/Paste/Reset, Sample-Konsum, `capitalization` titleOnly-Skip.
- [x] Browser-Verifikation: keine Konsolen-Fehler; 4 Gruppen; Tuning schlägt durch
  (Button-Size 16→28→16 → `.track-name`); Serialisierung (#t) matcht Schema-Shape.
- [x] Gates grün: astro check 0 errors, Biome clean (3 TS), `doctor:diff` 0 issues,
  Tests: shared 44 / frontend 139 / backend 980 / dashboard 55.

## Completed

Umgesetzt + verifiziert am 2026-06-15. shared `design-tokens.ts` (+ Tests),
`designTokensCss.ts`, `glass.css`, `frontend-prototype.html`. „Replace"-Modell mit
Übergangs-Mapping → Produktion textuell unverändert. Noch nicht committet.

Follow-up (eigener Schritt): Produktions-Komponenten von `text-text-*` auf die
flächen-scoped Tokens umverdrahten + Übergangs-Mapping in glass.css entfernen
(inkl. Hero-Text aus A; md-content + Hero-Input hängen aktuell am Embossed-Mapping).

## Nachträge (2026-06-15, nach Prototyp-Review)

- **5. Fläche `InfoText`** ergänzt (shared `TextSurface` + `TEXT_SURFACE_DEFAULTS`
  Barlow/16/400; Prototyp `TYPO_SURFACES`/`TYPO_DEFAULTS`). Für langen Info-/Help-/
  Bio-Text. shared-Tests weiterhin 44 grün (Round-trip nimmt die Fläche automatisch).
- **Artist-Info-Card** im Prototyp gebaut (Cover + Genre-Pill + Stats + Bio +
  Attribution). Cover-**Top-Left-Radius** leitet aus `--mc-control-radius`
  (= Card-Radius − Insets) ab → folgt dem Radius-Slider; andere Ecken
  `--mc-control-radius-inner`. **Korrektur nach DOM-Inspektion:** Bio = normaler
  Recessed-Text → `recessed` normal (16px in Prod, 14px Default); Attribution
  „Artist data provided by …" = **der** Info/Help-Text → `infoText` dimmed (12px,
  muted, außerhalb der Recessed); Stats/Genre → `recessed`; Titel → `embossedTitle`.
  `infoText`-Default = 12px (Caption). Bio sitzt INNERHALB der Recessed (mit
  Cover+Meta), Attribution außerhalb.
- **Bug-Fix:** diskrete Felder (`fontFamily`/`capitalization`) werden aus Night
  emittiert; Controls editierten nur den aktiven Modus → im Day-Modus kein Effekt.
  Jetzt `bothModes` (schreibt day+night). 
- **Mapping-Fixes:** Button-Stufen waren eine Stufe zu dunkel (track-name etc. →
  bright statt normal); `.section-title` (POPULAR TRACKS/LISTEN ON) → `embossedTitle`
  statt recessed; `.emb-btn--cta` (Cancel/Save) → button.
- **cardRadius-Default = 28** (Production-Blob übernommen; alle übrigen Blob-Werte
  deckten sich bereits mit den Prototyp-Defaults).

### Nachträge 2 (Artist-Card-Review)

- **embossedTitle = Section-Label-Stil**: Default auf Roboto Condensed / **14px /
  700 / UPPERCASE** korrigiert (war 20/600/none → sah falsch aus). `.section-title`
  nutzt jetzt die **normal**-Stufe (gedämpft, = Production `text-secondary`),
  Letter-Spacing bleibt aus der Basis. `.emb-header-title` (zentrierter Karten-/
  Overlay-Header) ist aus der embossedTitle-Regel raus und behält seinen 20px-Stil.
  shared- + Prototyp-Default angeglichen. `TYPO_KEY` → `v2` (alter Store-Wert würde
  sonst die neuen Defaults überschreiben).
- **Track-Row-Stufen**: Titel → bright, Subtext → normal, **Spielzeit → dimmed**
  (alle drei Button-Stufen, jede einzeln tunebar).

### Nachträge 3 (Collapse-Key-Kollision)

- **Bug:** Die Sidebar-Collapse-Map `glassCollapsed` war nur per `g.key` indiziert.
  Glass-Section (`G_CONTROLS`) und Typo-Section (`TYPO_SURFACES`) teilen die Keys
  `recessed` + `button` → Kollabieren der Glass-Gruppe „Recessed Card" setzte den
  geteilten Key, und beim Day/Night-Rebuild (`syncGlassMode` baut alle Sektionen
  neu) schloss die Typo-Gruppe „RecessedCard" mit (live reproduziert).
- **Fix:** `buildTuneSection` scopt den Collapse-Key jetzt per Section:
  `${rootId}:${g.key}` (z. B. `glass-controls:recessed` vs `text-controls:recessed`).
  Verifiziert: unabhängiges Collapse + korrekte Persistenz über Day/Night-Switches.
  Daten-Stores (typoCfg/glass/…) waren nie betroffen (eigene Objekte). Alte unscoped
  Collapse-Keys im localStorage sind inertes Relikt.

### Nachträge 4 (Font je Stufe + Button-Subtext)

- **Modell-Umbau (User-Entscheidung „Font je Stufe"):** `TextSurfaceFields` ist nicht
  mehr „eine Font pro Fläche + 3 Farbstufen", sondern **jede Stufe bright/normal/dimmed
  hat eigene Familie/Size/Weight + Color/Opacity** (flach: `brightFontFamily`,
  `brightFontSize`, … `dimmedOpacity`); `capitalization` bleibt pro Fläche (Title).
  Grund: Production-EmbossedButton hat Haupttext 16/500 + Subtext 12/400 (kleiner +
  leichter) — eine Font pro Fläche konnte das nicht. Betrifft shared (Typen/Defaults/
  Specs/Tests), `designTokensCss` (per-Stufe-Var-Emission `--text-S-L-{size,weight,
  font}-mode`), Prototyp (`TYPO_FIELDS` per-Stufe, `mkTypo`, `applyTypography`,
  Konsum-CSS). `TYPO_KEY` → `v3`. glass.css unverändert (Farb-Var-Namen gleich →
  Übergangs-Mapping + Produktion unberührt). Var-Schema:
  `--text-<surface>-<level>` (color), `…-<level>-size/weight-<mode>`, `…-<level>-font`
  (night), `--text-<surface>-transform` (night).
- **EmbossedButton-Subtext** ergänzt: Service-Buttons haben jetzt eine `.svc-sub`-
  Zeile (status/quality), gemappt auf **button dimmed** (12/400). Track-Rows:
  Titel→bright, Subtext→normal, Spielzeit→dimmed. Verifiziert: Button-dimmed-Size
  tunen ändert nur Subtext/Spielzeit, nicht den bright-Haupttext.
- Gates: shared 45 / frontend 139 / backend 980 / dashboard 55, astro check 0 errors,
  Biome clean, keine Konsolen-Fehler.

### Nachträge 5 (Revert auf per-Fläche + Blob-Defaults + Hover + Day/Night-Split + Paddings)

- **Revert „Font je Stufe" → per-Fläche (User: „so feine Unterteilung braucht es nicht,
  mach es wieder wie vorher"):** `TextSurfaceFields` zurück auf eine `fontFamily/fontSize/
  fontWeight` + `capitalization` pro Fläche + 3 Farbstufen (bright/normal/dimmed Color+
  Opacity). shared (Typen/`mkTextSurface`/Defaults/Field-Specs/Tests), `designTokensCss`
  (per-Fläche-Emission `--text-S-{size,weight}-mode`, `--text-S-font`, `--text-S-transform`
  + 3 Farb-Vars), Prototyp (`TYPO_FIELDS`/`mkTypo`/`TYPO_DEFAULTS`/`applyTypography`/
  Konsum-CSS). `TYPO_KEY` → `v4`. glass.css unverändert (nur Farb-Vars konsumiert).
- **Blob als Default übernommen** (User-Production-Settings): `CARD_RADIUS_DEFAULT` 32→28;
  GLASS_DEFAULTS + Prototyp-`G_DEFAULTS`: card.day.opacity 0.42, button day/night rim 0.06
  + day.opacity 0.13, recessed day/night #000000 @0.28, segTrack.night 0.28,
  segIndicator.night.rim 0.08. `GLASS_KEY` → `v5`. Text-Defaults = Blob (embossed 14/500,
  recessed 14/200, button 15/200, embossedTitle RobotoCond 14/200 uppercase, infoText
  12/200). `dayness` NICHT angefasst (Blob 1 ist Prototyp-Vorschau; Produktions-Night-Seed
  `--g-dayness:0` bleibt).
- **Button-Hover: NIEMALS Größenänderung** (User-Regel). Prototyp: `body.glass .emb-btn:hover/
  :active` setzen nur noch `background` auf einen via **HSL aufgehellten** Tint (kein transform/
  scale/filter). `hsl(from …)` Relative-Color wird im Test-Browser NICHT unterstützt →
  Lift in JS (`liftLightness`, HSL +10% hover / +5% active, gleiche Alpha), emittiert als
  `--button-<mode>-h/a-tt/tb`, im CSS per color-mix cross-faded zu `--_htt/_htb/_att/_atb`.
  Nicht-Glas-Basis-Hover ebenfalls scale-frei. `no-scale`-Klasse (tot) aus Markup entfernt.
  OFFEN: Production-`EmbossedButton.tsx` (scale-Klassen) + glass.css `.mc-glass-button`-Hover
  noch nicht portiert.
- **Day/Night-Split-Audit (User: „strukturelle Werte sind mode-unabhängig, nur Kontrast wird
  day/night getunt"):** Felder bekommen `shared`-Flag = mode-unabhängig (in beide Hälften
  geschrieben, einmal gerendert). Text: fontFamily/fontSize/fontWeight/capitalization shared;
  Farben/Opacity day/night. Footer: fontFamily/size shared; color/opacity/stroke day/night.
  Glas/VFD/Cover/Backdrop bleiben voll day/night (alles Erscheinungs-/Kontrastwerte, Blob
  differenziert sie real). `buildTuneSection`: Shared-Block oben (kein Badge) → `.gg-mode-row`
  Day/Night-Divider → Kontrast-Felder. Reine UI/Prototyp (Schema unverändert, Blob-kompatibel).
- **Neue Paddings-Section (granular pro Element, mode-unabhängig):** 13 `--mc-*`-Vars (Cards:
  card/header/recessed/artist; Rows: track/svc-y/svc-x; Gaps: cards/list/grid/seg/rowitem/
  artist), :root-Seeds + Demo-CSS-Regeln auf die Vars umverdrahtet. Flaches Modell
  `paddingsCfg` (keyed by CSS-Var), `buildPaddingControls` (3 Gruppen), Store `#p`/
  `PADDING_KEY v1`, Export `paddings`, Import/Reset/i18n/collapse verdrahtet. Produktion
  konsumiert die Padding-Tokens noch nicht (Follow-up).
- Verifiziert (Browser): Export-Shape = Blob-Form (per-Fläche-Text + paddings + Blob-Glas),
  Hover deterministisch (CSSOM: kein transform), Day/Night-Divider korrekt, Paddings live
  wirksam. shared 45 grün, biome clean, astro check 0.

### Nachträge 6 (Button-Hover in Production portiert)

- **Audit (Workflow, 4 Agenten):** einzige Button-Hover-Größenänderung in Production =
  `EmbossedButton`s `raisedScaleClasses`. Alle anderen Controls nur Farbe/Opacity;
  Segmented-Indicator + Dialog-Mount sind keine Hover-Effekte. Footprint vollständig.
- **`EmbossedButton.tsx`:** `raisedScaleClasses` (hover/focus/active scale) + `raisedHoverClasses`
  (`brightness-110`) + `transition-[transform,filter]` entfernt; `noScale`-Prop entfernt
  (durch Wegfall des Scales redundant) und aus 6 Konsumenten gestrichen (AlertDialog,
  GenreRowButton, GenreBrowseGrid, UpcomingEventsSection, PopularTracksSection, PlayerParts).
  `transform-gpu` bleibt (statischer GPU-Layer, animiert nie).
- **`designTokensCss.ts`:** TS-`liftLightness(hex, pct)` (HSL-L-Lift) + Emission von
  `--button-<mode>-htt/htb/att/atb` (Hover +10 %, Active +5 %, gleiche Opacity), nach der
  Glass-Loop. Neuer Unit-Test `designTokensCss.test.ts` (Hover-Vars vorhanden, heller als
  Base, Active dazwischen, Alpha erhalten).
- **`glass.css`:** `.mc-glass-button` resolved `--_htt/_htb/_att/_atb` per color-mix; neue
  Regeln `.embossed-gradient-border.mc-glass-button:hover/:active { background: linear-gradient(...) }`
  (auf `.embossed-gradient-border` gegated → gedrückte/recessed Buttons reagieren nicht; kein transform).
- Verifiziert live auf :3001 (Share-Page, echter Hover auf Spotify-Button): Größe 240×60
  unverändert, BG heller (srgb 0.58/0.89/0.996 → 0.78/0.94/0.996, Alpha 0.13 erhalten).
  Gates: astro check 0, biome clean, frontend 141 Tests, doctor:diff 0 issues.
- OFFEN: (a) Hero-Submit (`HeroInput`) hat einen Akzent-Inline-Background → größenstabil,
  aber der Glass-Hover-Lighten greift nicht (Inline gewinnt); falls gewünscht eigener
  Akzent-Hover. (b) glass.css `:root`-Glass-Seeds sind vs. den neuen Blob-Defaults leicht
  stale (von designTokensCss zur Laufzeit überschrieben → niedrige Priorität).

### Nachträge 7 (Single-Group-Sektionen: doppelten Header entfernt)

- **Problem:** Bei Single-Group-Sektionen (VFD, Footer, Cover, Overlay Backdrop) trugen der
  Sektions-Header (`.sec-head`) und der einzige innere Gruppen-Header (`buildTuneSection`)
  dasselbe Label → zwei identische Ausklapp-Einträge übereinander.
- **Fix:** `buildTuneSection` rendert bei `groups.length === 1` den Body (Felder + Day/Night-
  Divider) direkt unter die Sektion — ohne inneren `.glass-group`-Header/Collapse. Der
  Sektions-Header ist dann der einzige Collapse. Multi-Group-Sektionen (Glass 7, Text 5,
  Paddings 3 — distinkte Labels) behalten ihre Gruppen-Header. Verifiziert: backdrop/cover/
  vfd/skytext = 0 innere Header + 1 direkter Body; glass/text/paddings unverändert.

### Nachträge 8 (neue Text-Fläche „Placeholder Text" für den Hero-Input)

- **shared:** `TextSurface.Placeholder = "placeholder"` + `TEXT_SURFACE_DEFAULTS.placeholder
  = mkTextSurface(BARLOW, 16, 500, none)`. Parser + designTokensCss iterieren `text`
  automatisch → emittieren `--text-placeholder-*` ohne weitere Änderung. shared 45 grün.
- **Single-Emphasis-Konzept:** ein Placeholder hat eine Farbe. Neuer Group-Flag
  `singleEmphasis: "dimmed"` (in `TYPO_SURFACES`); `buildTuneSection` zeigt für solche
  Flächen nur die gewählte Stufe (Color/Opacity, ohne Stufen-Präfix relabelt) + Font/Size/
  Weight. Placeholder konsumiert die **dimmed**-Stufe (= das frühere `text-text-muted`).
- **Prototyp:** `TYPO_SURFACES` + `TYPO_DEFAULTS` um `placeholder` ergänzt;
  `body.glass .hero-input::placeholder` konsumiert `--text-placeholder-{font,size,weight,
  dimmed}`. Kein `TYPO_KEY`-Bump (buildContentState merged die neue Fläche als Default in,
  bestehende Tunings bleiben).
- **Production:** `HeroInput.tsx` Input bekommt Klasse `mc-hero-input`; Tailwind
  `placeholder:text-text-muted placeholder:text-base` entfernt (tracking-normal bleibt);
  neue Regel `.mc-hero-input::placeholder` in `global.css` konsumiert die Placeholder-Vars
  (cross-fade day↔night). Erster produktiver Konsument einer flächen-scoped Text-Var.
- **Bug-Fix:** Namens-Kollision in `buildTuneSection` — `const single` (single-group,
  Nachträge 7) wurde von `const single = g.singleEmphasis` überschattet → brach sowohl die
  Single-Group-Sektionen als auch das Placeholder-Group-Rendering. Umbenannt zu `singleGroup`
  bzw. `singleLevel`.
- Verifiziert (Browser): Prototyp zeigt „Placeholder Text" (Font/Size/Weight/Color/Opacity),
  Single-Group-Sektionen weiter ohne Doppelheader, Placeholder-Tuning ändert den Hero-
  Placeholder live; Production :3001 emittiert die Vars + der Hero-Placeholder = Barlow 16/
  500/#9a9aa0 (dimmed). Gates: shared 45, astro check 0, biome clean, frontend 141 Tests.

### Nachträge 9 (Sidebar-Politur: hellere offene Sections, Collapse-Animation, 0.5er-Paddings)

- **Ausgeklappte Sections heller:** `.sec:not(.collapsed)` bekommt `background-color:
  rgba(255,255,255,0.05)` (dezent heller als das dunkle Panel); eingeklappte bleiben dunkel.
  `border-top`-Separator entfernt, stattdessen `margin-top: 6px` + `border-radius: 10px`
  + `padding: 0 10px`.
- **Collapse smooth animiert:** `.sec` ist jetzt `display:grid; grid-template-rows: auto 1fr`
  mit `transition: grid-template-rows 0.28s ease, background-color 0.25s ease`; eingeklappt
  `auto 0fr`. `.sec-body { overflow:hidden; min-height:0 }` (single 1fr↔0fr-Track). Das alte
  `display:none` ist weg. Nur Top-Level-Sections (nicht die inneren `.glass-group`).
- **Paddings 0.5er-Schritte:** `buildPaddingRow` `input.step = 0.5`.
- Verifiziert (Chrome 149): offene Sections rgba(255,255,255,0.05), Collapse-Transition läuft
  (grid-template-rows interpoliert), Padding-Step 0.5, keine Konsolen-Fehler.
- OFFEN/optional: die inneren `.glass-group`-Collapses snappen weiter (display:none) — falls
  gewünscht, dieselbe grid-rows-Technik dort anwenden.
- Section-Jump-Fix: `grid-template-rows`-Transition nur via `.animating`-Klasse (von
  `toggleSection` für 320ms gesetzt) — Inhalts-Änderungen (innere Gruppe / Day-Night-Rebuild)
  resizen instant statt die Section neu zu animieren. Verifiziert.

### Nachträge 10 (ALLE Roundtrip-Lücken geschlossen: Paddings + Text-Flächen + segHover)

Auslöser: Audit ergab, dass Prototyp-Settings teils NICHT in Production ankamen. User: „ALLE
Lücken schliessen". Umgesetzt:

- **Paddings → Production (Schema + Apply):** shared `DesignTokens.paddings: Record<PaddingKey,
  number>` (13 `--mc-*`-Keys, Range 0..48), `PADDING_DEFAULTS`, Parser (clamp + unknown-drop),
  in `DESIGN_TOKENS_DEFAULTS`; `designTokensCss` emittiert sie verbatim. 13 Konsumenten verdrahtet:
  EmbossedCard `DEFAULT_PADDING` + alle Section-Pads (CollapsibleSection `p-3`/`px-3 pt-0 pb-3` +
  ServicesCard) → `--mc-pad-card`; RecessedCard `INHERITED_PADDING` → `--mc-pad-recessed`;
  section-header → `--mc-pad-header`; artist-well → `--mc-pad-artist`; track-row → `--mc-pad-track`;
  PlatformButton → `--mc-pad-svc-x/y`; Gaps (cards/list/grid/seg/rowitem/artist) per
  `[gap:var(--mc-gap-*)]`. Radius-Kaskade NICHT angefasst (entkoppelt). 3 neue shared-Tests.
  Live verifiziert: jeder Token reagiert (z. B. svc-padY 10→22, grid-gap 3→18, section-pad 12→30).
- **Text-Flächen → Production:** 7 `mc-txt-<surface>-<level>`-Klassen in glass.css (unlayered →
  schlagen Tailwind) setzen Font/Size/Weight der Fläche + Stufenfarbe (color-mix day↔night).
  Verdrahtet: Track-Titel/Service-Name/Segment-aktiv → button-bright; Track-Subtext/Segment-inaktiv
  → button-normal; Track-Spielzeit/Service-Sub → button-dimmed; Section-Titel → embossedTitle;
  Stats/Bio/Similar → recessed-normal; Genre-Pill → recessed-dimmed; Attribution → infoText.
  (embossed bleibt globaler Default; placeholder schon verdrahtet.) Inline `font-condensed` am
  Service-Name entfernt, damit die Surface-Font greift. Live verifiziert: Track-Titel 15/200/Barlow,
  Section-Titel RobotoCond 14/uppercase, Genre #9a9aa0 etc.
- **segHover entfernt** (toter Token, kein Production-Konsument): aus shared `GlassControl` +
  `GLASS_DEFAULTS`, aus Prototyp `G_CONTROLS` + `G_DEFAULTS` (→ nicht mehr tunebar/exportiert;
  `buildGlassState` droppt Alt-State automatisch). Demo-CSS/HTML/JS im Prototyp ist inert (kann
  später gelöscht werden).
- Gates: shared 48 / frontend 141, astro check 0, Biome clean, doctor:diff 0. Live verifiziert
  (:3001 share + /info): Text-Flächen greifen, alle Paddings tunen live, Segmented-Indikator
  trotz 3px-seg-gap ausgerichtet, Export hat 13 Paddings + kein segHover, keine Konsolen-Fehler.
