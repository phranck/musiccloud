# Tier `recommended`-Flag — Pricing-Seite (Tiefeneffekt)

Plan-Nr.: MC-108

## Preface

Teil 3 von 3 des Features „recommended-Tier". Baut auf MC-106 (Backend) auf: `GET /api/v1/tiers`
liefert dann `recommended`. Schwesterplan MC-107 bringt das Flag in den Dashboard-Editor. Dieser
Plan setzt die visuelle Hervorhebung auf der öffentlichen Pricing-Seite um.

**Abhängigkeit:** MC-106 (öffentliche API liefert `recommended`).

## Ziel

Ist genau ein Tier `recommended`, wird dessen Card auf der Pricing-Seite hervorgehoben: sie steht
am weitesten vorne (volle Größe, hellster, höchster z-index) und trägt ein „Recommended"-Badge. Je
weiter eine Card (nach `sortOrder`) von der recommended-Card entfernt ist, desto weiter rückt sie in
die Tiefe (kleiner, transparenter, leicht abgesenkt, weicherer Schatten). Ist **kein** Tier
recommended, bleibt die Darstellung exakt wie jetzt (flach, kein Badge).

## Design

- **DTO** (`apps/developer/src/pages/pricing.astro`): `recommended: boolean` in `TierDto` (@21).
- **Index-Berechnung**: nach dem bestehenden Sort (`sortOrder`, @87)
  `recommendedIndex = tiers.findIndex((t) => t.recommended)` (`-1`, wenn keines).
- **Pro Card** (map/render @148):
  - Nur wenn `recommendedIndex >= 0`: inline CSS-Var `--depth: {Math.abs(i - recommendedIndex)}` setzen
    und auf der recommended-Card ein `data-recommended`-Attribut. Bei `recommendedIndex === -1` kein
    `--depth`/`data-recommended` (→ flach, unverändert).
  - `--tier` bleibt wie gehabt inline (@149).
- **Recommended-Badge**: kleine Pill „Recommended" (englisch) oben an der `data-recommended`-Card;
  Farbe aus `--tier`. Neues Markup + CSS-Klasse (z. B. `.tier-badge`).
- **CSS** (`apps/developer/src/styles/global.css`, `.tier-card`-Familie @166):
  - Tiefen-Staffelung **nur ab `lg`** (die Cards bilden erst ab `lg` die horizontale Reihe;
    `sm`/Base stapeln). Aus `--depth` berechnet: `scale` (−~6 %/Schritt), `translateY` (+~10px/Schritt),
    `opacity` (−~0.12/Schritt, min ~0.6), `z-index` fällt nach außen, Schatten weicher/kleiner.
    `--depth: 0` = volle Größe/vorne.
  - **Nur `transform`/`opacity`** (GPU; Memory „Animationen immer GPU"). `--depth` als Basis, Hover
    (@213 `translateY(-6px) scale(1.02)`) so integrieren, dass Depth + Hover sich nicht gegenseitig
    überschreiben (Hover holt die Card nach vorn, z-index rauf).
  - **Mobile/`sm`** (kein `lg`): kein Tiefen-Transform; recommended-Card nur Highlight über stärkeren
    `--tier`-Glow + Badge.
  - Radius-/Geometrie-Regeln aus `AGENTS.md` und das bestehende `--tier-card-*`-System beachten.
- **Flach-Fallback**: `recommendedIndex === -1` → keine Depth-Vars, kein Badge → identisch zur
  aktuellen Seite (Regressionscheck).

## Task-Checkliste

- [ ] `TierDto.recommended` (pricing.astro)
- [ ] `recommendedIndex` nach Sort berechnen; pro Card `--depth` + `data-recommended` nur wenn eines recommended
- [ ] Recommended-Badge-Markup an der recommended-Card
- [ ] CSS: Tiefen-Staffelung ab `lg` aus `--depth` (scale/translateY/opacity/z-index/shadow), GPU-only
- [ ] CSS: Hover in die Basis-Transform integrieren (kein Konflikt mit Depth)
- [ ] CSS: Mobile/`sm`-Highlight (Glow) statt Tiefe; Badge-Styling (`--tier`)
- [ ] Flach-Fallback (kein recommended) verifizieren — unverändert zur aktuellen Darstellung
- [ ] Gates grün: developer `astro check` (0 Fehler), `pnpm lint`, `pnpm run doctor:diff`
- [ ] Visuelle Prüfung durch User (Dev-Server via `./app`) — 0/1 recommended, Desktop + Mobile
- [ ] All code references verified (functions, scripts, paths, env vars, package-manager commands)

## Verifizierte Fakten

- `pricing.astro`: `TierDto`:21, `sortOrder`:39, `fetch("/api/v1/tiers")`:84, `tiers.sort(...sortOrder)`:87, Grid `grid-cols-1 sm:grid-cols-2 lg:grid-flow-col lg:auto-cols-fr`:145, Card-Div `tier-card relative flex flex-col ... pt-16` (+`opacity-60` wenn disabled):148, `--tier` inline:149 (grep)
- `global.css`: `.tier-card`:166, `.tier-card::before`:195, `.tier-card:hover`:213, `.tier-card:hover::before`:218 (grep); `--tier-card-*`-System + `--tier` inline pro Card
- Depth nur `lg`: Grid wird erst ab `lg` (`lg:grid-flow-col lg:auto-cols-fr`) zur horizontalen Reihe; darunter gestapelt (grep @145)
- Design-Token-/Geometrie-Regeln kanonisch in `AGENTS.md`; GPU-Animationsregel (Memory)
