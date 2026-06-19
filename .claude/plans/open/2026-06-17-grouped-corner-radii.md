# Grouped-Corner-Radii (Disambiguation + Genre-Search)

## Preface

Regel jetzt kanonisch in `AGENTS.md`. Aktuell verletzen die Listen sie: Row-Buttons
haben überall den vollen control-radius (gemessen 13px), Cover sind hardcoded
(`rounded-md` / `4px`/`6px` in `SlideArtwork`/`CandidateRowContent`). Soll: gruppierte
Rows defaulten auf ≤5px, nur die Ecken an den runden Container-Ecken werden auf den
vollen control-radius promotet; das links-anliegende Cover folgt (linke Ecken − Inset,
rechte inner).

## Design

- **Radius-Werte aus der nicht-resetteten Root-Var ableiten** (`--mc-card-radius`),
  damit Button UND Cover dieselbe Basis sehen (verschachtelte `--neu-radius`/
  `--mc-recessed-*` werden je RecessedCard resettet):
  - `CONTROL = calc(var(--mc-card-radius) - 0.9375rem)` (= card − content-inset 12px −
    control-inset 3px = raisedControlRadius).
  - `INNER = min(5px, CONTROL)`.
  - `COVER_FULL = max(0px, calc(CONTROL - 4px))` (Artwork-Inset = `pl-1` = 4px).
- **Helper** `apps/frontend/src/components/cards/groupedCorners.ts`:
  - `groupedRowCornerStyle({ isFirst, isLast, promoteTop })` → per-Ecken `border-*-radius`.
  - `groupedArtworkCornerStyle({ isFirst, isLast, promoteTop })` → linke Ecken folgen
    (COVER_FULL bei promote, sonst INNER), rechte Ecken immer INNER.
- **promoteTop**: Disambiguation `true` (kein Header im Well → erste Row oben + letzte
  unten). Genre `false` (Header über den Rows → nur letzte Row unten).
- **Round-Artwork (Artists)** bleibt `rounded-full` (keine Per-Ecken-Radii).

## Implementation

1. `groupedCorners.ts` — Helper + Radius-Expressions.
2. `CandidateRowContent.tsx` — Prop `groupPosition?: {isFirst,isLast,promoteTop}`;
   bei square-Artwork `groupedArtworkCornerStyle` an SlideArtwork (style) bzw. den
   plain-`<img>`-Wrapper (style, statt `rounded-md`) durchreichen.
3. `SlideArtwork.tsx` — `cornerStyle?: CSSProperties` an die RecessedCard mergen
   (überschreibt den Single-`radius`); Tile bleibt `overflow-hidden` (clippt Disc).
4. `DisambiguationPanel.tsx` — pro Row `groupedRowCornerStyle({isFirst:i===0,
   isLast:i===visible.length-1, promoteTop:true})` als `style` an den EmbossedButton
   (statt `rounded-lg`); `groupPosition` an CandidateRowContent.
5. `GenreRowButton.tsx` / `GenreSearchResults.tsx` — `index`+`total` → `isFirst/isLast`,
   `promoteTop:false`; Row-style + groupPosition an CandidateRowContent.
6. **Settings-Audit** (AGENTS.md-Dauerregel): Paddings/Gaps token-verdrahtet prüfen
   (`gap-0.5`, `py-1 pl-1 pr-2`, GenreColumn `px-2 py-2`), Hardcodes melden/fixen.
7. Browser-Verifikation (Chrome): erste/letzte/mittlere Row-Ecken + Cover korrekt;
   beide Screens. Gates: astro check, lint, doctor:diff, vitest.

## Verified facts

- [x] EmbossedButton merged `style` (Longhand-Per-Ecke schlägt Shorthand `borderRadius`)
  — `EmbossedButton.tsx:45`. control-radius = `card − 0.9375rem` (gemessen 13px @ card 28).
- [x] Disambiguation-Well ohne Header (Rows füllen Well) — `DisambiguationPanel.tsx:206-208`;
  Row = EmbossedButton `rounded-lg` — `:215-224`; Rows-`gap-0.5` — `:208`.
- [x] Genre-Spalte = RecessedCard mit Header + scrollbarem Body (`gap-0.5`, `rounded-b-…`)
  — `GenreColumn.tsx:13-22`; Row = GenreRowButton→EmbossedButton `px-2 py-2` — `GenreRowButton.tsx:58`.
- [x] Cover: selektiert = SlideArtwork (RecessedCard `radius` single) — `SlideArtwork.tsx:46-50`;
  sonst plain `rounded-md` div — `CandidateRowContent.tsx:65,88`.
- [x] `--mc-card-radius` ist Root-Token (nicht resettet) — `cardGeometry.ts:4`, gemessen 28px.

## Checklist

- [ ] Alle Code-Referenzen verifiziert — s.o.
- [ ] `groupedCorners.ts` Helper.
- [ ] CandidateRowContent + SlideArtwork: per-Ecken Cover-Radii.
- [ ] DisambiguationPanel: Row-Ecken (promoteTop true).
- [ ] GenreSearch/GenreRowButton: Row-Ecken (promoteTop false, nur last unten).
- [ ] Settings-Audit (Paddings/Gaps token-verdrahtet).
- [ ] Browser beide Screens + Gates grün.
