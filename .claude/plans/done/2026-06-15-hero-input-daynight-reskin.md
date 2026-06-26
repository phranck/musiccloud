# Hero-Input Day/Night-Reskin (Produktions-Port)

Plan-Nr.: MC-036

## Preface

Der Landing-Page-Hero (`HeroInput.tsx`) hängt noch am alten „Dark Premium"-Stil:
ein einzelnes `rounded-full`-`div` mit `bg-surface` (#161618) + Border. Er nutzt
das neue Glassmorphism-/EmbossedCard-System gar nicht. Dieser Plan portiert den
im Prototyp (`frontend-prototype.html`) verifizierten neuen Look 1:1 nach
Produktion. Es ist ein **reiner Reskin**: die gesamte Logik (Auto-Submit bei
Paste, Focus-on-Mount, Enter/Escape, `compact`-Modus, `songName`-Anzeige,
Props-Interface) bleibt unverändert.

Design ist im Prototyp gebaut + im Browser (Day + Night, alle Zustände)
verifiziert und vom User freigegeben. Entscheidungen:

- Pill-`EmbossedCard` (Default-Padding) › `RecessedCard`-Well › dekorationsloser
  Input + Clear + **Glas+Akzent**-Submit.
- **Focus-Ring um die RecessedCard** (Akzent-`outline`, nicht EmbossedCard).
- Loading = `CDSpinArtwork` statt Submit (wie heute), Error über
  `LandingPageErrorAlert` (kein Feld-Ring), Success = Check + `songName`.

Bewusst NICHT hier: flächenbezogenes Typografie-Token-System (#1) und Sky-Link
(#2) — eigene Specs. Bekannter Follow-up: der Hero-Text wird nach #1 nochmal
angefasst (Konsum der per-Fläche-Tokens statt der heutigen globalen).

## Ziel

`HeroInput.tsx` rendert die Pill-Glas-Komposition statt des alten
`bg-surface`-Felds, mit identischem Verhalten und identischem Props-Interface.
`LandingPage.tsx` bleibt unverändert. Alle bestehenden Tests bleiben grün.

## Design

### Struktur (ersetzt das alte `rounded-full bg-surface`-`div`)

```
<div>  (HeroInput-Root: relative w-full transition-all duration-500 + responsive max-w-*)
  EmbossedCard  radius="9999px", padding default (0.75rem)
    RecessedCard  className: recessedControlInsetClassName + "hero-field" + flex items-center
      input    transparent, ohne Border/BG, flex-1, px-5/px-6, aria-label unverändert
      [Clear]  plain button, aria-label="Clear search", erscheint bei value/success, !loading
      Submit   EmbossedButton as="button" (Glas+Akzent) | CDSpinArtwork (loading) | Check (success)
</div>
```

- Der **HeroInput-Root** behält Struktur + Klassen (`relative w-full
  transition-all duration-500` + responsive `max-w-*`), damit die FLIP-Messung
  in `LandingPage` (`searchFieldRef.getBoundingClientRect().top`) unverändert
  funktioniert und der `compact`/`success`-Breitenwechsel erhalten bleibt.

### Geometrie (Pill über die echte Kaskade)

- `EmbossedCard radius="9999px"` publiziert `--emb-radius-base/sm` → die innere
  `RecessedCard` leitet ihren Radius via `outerRadius − padding` ab → der
  `EmbossedButton` leitet `recessedRadius − inset` ab. Alles wird Pille/Kreis,
  kein manuelles Rechnen. (Im Prototyp via Pixel-Overrides nachgestellt; hier
  übernimmt die echte cardGeometry-Kaskade.)
- Padding = Default `0.75rem` (= `DEFAULT_PADDING` der EmbossedCard).
- Well-Inset = `recessedControlInsetClassName` (`p-[var(--mc-recessed-control-inset)]`
  = 0.1875rem), wie `ShareButton`.

### Focus-Ring um die RecessedCard

Neue scoped CSS-Klasse in `global.css` (1:1 die im Prototyp verifizierte Lösung):

```css
.hero-field { outline: 2px solid transparent; outline-offset: 3px; transition: outline-color .2s ease; }
.hero-field:focus-within { outline-color: var(--color-accent); }
```

- `outline` statt `box-shadow`, sonst überschriebe der Ring die Recessed-Chamfer-
  `box-shadow` der `.recessed-gradient-border`-Recipe.
- Basis-Ring transparent → fadet transparent→Akzent (kein Weiss-Flash).
- 2px + 3px Offset = 5px, passt in den 0.75rem (12px) EmbossedCard-Padding-Spalt,
  wird also von dessen `overflow-hidden` nicht abgeschnitten (im Prototyp
  verifiziert; in Produktion identische Struktur → nach Umsetzung im Browser
  gegenprüfen).

### Submit-Button (Glas + Akzent)

- `EmbossedButton as="button"`, Kreis (Radius über Kaskade), füllt Well-Höhe.
- Akzent-getönter Glas-Fill, überschreibt den neutralen Button-Glas-Tint. Da die
  `.embossed-gradient-border`-Recipe `background: linear-gradient(...)` setzt,
  wird der Akzent-Fill **inline via `style`-Prop** des EmbossedButton gesetzt
  (Inline schlägt jede Klassen-Specificity) — Vorbedingung: EmbossedButton merged
  die `style`-Prop (verifizieren, siehe Verified facts).
  Fill: `linear-gradient(to bottom, color-mix(in srgb, var(--color-accent) 92%, transparent), color-mix(in srgb, var(--color-accent) 78%, transparent))`, Icon weiss.
- Zustands-Slot:
  - `Loading` → `CDSpinArtwork` (transparent, kein Glas-Fill), wie heute.
  - `Success` → `CheckIcon`.
  - sonst → `ArrowRightIcon`. Disabled wenn `!value.trim()`.
- `compact && state !== Loading` → Submit `hidden` (wie heute).

### Erhalten (reiner Reskin, keine Verhaltensänderung)

- Props-Interface `HeroInputProps` unverändert → `LandingPage.tsx` unverändert.
- Auto-Submit bei Paste, Focus-on-Mount (`mc:focusHero` + `hover:hover`),
  Enter/Escape, `cancelAutoSubmit`, `handleClear`, `displayValue` (songName).
- aria-labels: Input `"Search for music by link or name"`, Clear `"Clear search"`
  (Test-Kontrakt, siehe LandingPage.test.tsx:57,172,174,185).
- Clear erscheint bei `(value || Success) && !Loading` (auch `compact`).

## Implementation

1. **`global.css`** — `.hero-field`-Regeln (Focus-Ring) nach dem
   `@import "./glass.css"` einfügen (damit sie nach den Glas-Regeln stehen).
2. **`HeroInput.tsx`** — den inneren `rounded-full bg-surface`-Block ersetzen durch
   `EmbossedCard radius="9999px"` › `RecessedCard className={cn(recessedControlInsetClassName, "hero-field", "flex items-center")}` › Input + Clear + Submit.
   - Imports: `EmbossedCard`, `RecessedCard`, `EmbossedButton`,
     `recessedControlInsetClassName`. `CDSpinArtwork`, Phosphor-Icons, `InputState`,
     `cn` bleiben.
   - Root-Wrapper (max-w + transition) beibehalten.
   - Submit als `EmbossedButton as="button"` mit Akzent-`style`, Loading/Success/
     Idle-Slot wie oben.
   - Clear als plain button beibehalten (aria-label `"Clear search"`).
3. **Verifikation im Browser** (lokaler Frontend-Server läuft auf :3001):
   Landing-Page laden, Day + Night (via `--g-dayness`), Zustände idle/focus/
   typing/loading/success durchprüfen; Focus-Ring um die RecessedCard sichtbar +
   nicht geclippt; Submit Glas+Akzent; compact-Flow (Beispiel-Submit) ok.
4. **Gates**: Typecheck, `pnpm lint`, `pnpm doctor:diff`, betroffene Vitest-Suite
   (`LandingPage.test.tsx`) grün.

## Verified facts

- [x] `HeroInput.tsx` aktuell: altes `rounded-full bg-surface border`-Feld, kein
  Glas — `apps/frontend/src/components/landing/HeroInput.tsx:124-208`.
- [x] `EmbossedCard` hat `radius`-Prop (string | {base,sm}), Default-Padding
  `0.75rem` — `apps/frontend/src/components/cards/EmbossedCard.tsx:140-161,198`.
- [x] `RecessedCard` leitet Radius/Padding aus der EmbossedCard-Kaskade ab,
  rendert `recessed-gradient-border overflow-hidden` —
  `apps/frontend/src/components/cards/RecessedCardParts.tsx:152-154,256`.
- [x] `recessedControlInsetClassName = "p-[var(--mc-recessed-control-inset)]"`,
  `recessedControlInset = "0.1875rem"` — `apps/frontend/src/components/cards/cardGeometry.ts:7,12`.
- [x] `ShareButton` = Vorlage (RecessedCard `recessedControlInsetClassName` +
  EmbossedButton) — `apps/frontend/src/components/share/ShareButton.tsx:69,84-86`.
- [x] `EmbossedButton as="button"` existiert; Glas via `.mc-glass-button`/
  `.embossed-gradient-border` — `apps/frontend/src/components/ui/EmbossedButton.tsx`.
  OFFEN: bestätigen, dass die `style`-Prop in den finalen `style` gemerged wird
  (Zeile >60 lesen, vor Umsetzung).
- [x] `.embossed-gradient-border, .recessed-gradient-border { background: linear-gradient(...) }`
  — Akzent-Fill muss Inline (style) oder via `.embossed-gradient-border.hero-submit`
  überschreiben — `apps/frontend/src/styles/glass.css:359-368`.
- [x] EmbossedCard `overflow-hidden` (Zeile 265) → Ring muss im Padding-Spalt
  bleiben (2px+3px < 12px). Im Prototyp verifiziert.
- [x] `--color-accent: #28A8D8` — `apps/frontend/src/styles/global.css:9`.
- [x] `global.css` importiert `glass.css` bei Zeile 79 → `.hero-field` danach.
- [x] Test-Kontrakt: Input-aria `"Search for music by link or name"`, Clear-aria
  `"Clear search"`, Clear bei value (auch compact) —
  `apps/frontend/src/components/landing/LandingPage.test.tsx:57,87,172,174,185`.
- [x] `LandingPage` rendert `HeroInput` mit Props + `searchFieldRef`-FLIP-Messung;
  Root-Wrapper muss erhalten bleiben — `apps/frontend/src/components/landing/LandingPage.tsx:419-433,340-380`.

## Checklist

- [x] Alle Code-Referenzen verifiziert (Funktionen, Klassen, Pfade) — inkl.
  EmbossedButton-`style`-Merge (EmbossedButton.tsx:64,69 — gemerged + ans button).
- [x] `.hero-field`-Focus-Ring in `global.css` nach dem glass.css-Import.
- [x] `HeroInput.tsx` reskin: EmbossedCard(Pill) › RecessedCard(Well) › Input +
  Clear + Glas+Akzent-Submit; Root-Wrapper + Props + Verhalten unverändert.
- [x] aria-labels unverändert (`"Search for music by link or name"`,
  `"Clear search"`); Clear bei value/compact.
- [x] Browser-Verifikation Day + Night — Ring computed `2px solid rgb(40,168,216)`
  off:3px an der RecessedCard; Radien Pille/Kreis aus der Kaskade (emb 9999px,
  well 9987px, submit 9984px); Submit Akzent-color-mix-Fill; keine Konsolen-Fehler.
- [x] Gates grün: astro check 0 errors, Biome clean, `doctor:diff` 0 issues,
  `LandingPage.test.tsx` 4 passed.

## Completed

Umgesetzt + verifiziert am 2026-06-15. `global.css` (Focus-Ring `.hero-field`) +
`HeroInput.tsx` (Reskin). Reiner Reskin, Verhalten/Props/`LandingPage.tsx`
unverändert. Noch nicht committet (User entscheidet). Follow-up bleibt: Hero-Text
auf die per-Fläche-Tokens umstellen, sobald #1 (Typografie-System) steht.
