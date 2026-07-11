# Orange Vinyl-Layout-LED am Plattenspieler

Plan-Nr.: MC-118

> **Für agentische Worker:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development. Schritte nutzen Checkbox-Syntax (`- [ ]`).

**Goal:** Eine orange LED links der grünen Power-LED zeigt dauerhaft an, ob das eingelegte Album ein Discogs-`VinylLayout` besitzt.

**Architecture:** `RecordLabel.vinylLayout` bleibt die Album-Wahrheit. Eine neue hub-verbundene Compound-Part liest das Record-Layout am `TurntablePlayerRoot` und rendert eine rein dekorative orange LED. `TurntablePlayer.LayoutLED` wird am Namespace exportiert und neben der vorhandenen `LED` platziert.

**Tech Stack:** React, TypeScript, Vitest, React Doctor, Tailwind, bestehende Turntable-Compound-Parts.

## Global Constraints

- Bestehende grüne Power-LED bleibt unverändert.
- Orange LED ist links der grünen LED, dekorativ (`aria-hidden`) und trägt `data-turntable-layout-led`.
- `vinylLayout` vorhanden bedeutet an, `undefined` oder `null` bedeutet aus, unabhängig von Wiedergabestatus oder aktueller Seite.
- Kein neuer Backend-Call, keine neue Interaktion, keine neue Deck- oder Card-Struktur.
- Bestehende Compound-API erweitern, nicht durch lokale Sonderlogik im Root umgehen.
- TDD, TSDoc, `.js`-Produktionsimports, Biome und React Doctor einhalten.

---

## Task 1: Compound-Part und Root-Verdrahtung

**Files:** Modify `apps/frontend/src/components/turntable/TurntablePlayerParts.tsx`, `apps/frontend/src/components/turntable/TurntablePlayer.ts`, `apps/frontend/src/components/turntable/TurntablePlayer.test.tsx`.

- [ ] Failing Test: Root mit `record.vinylLayout` rendert `data-turntable-layout-led="true"` mit lit state; ohne Layout rendert er dieselbe LED im off state; die orange LED steht im DOM vor der grünen `data-turntable-led`.
- [ ] Rot ausführen: `pnpm --filter @musiccloud/frontend test:run src/components/turntable/TurntablePlayer.test.tsx`.
- [ ] `TurntablePlayerLayoutLed` mit orangefarbenem Verlauf und Glow ergänzen; Prop `vinylLayout?: VinylLayout`; An/Aus ausschließlich aus `Boolean(vinylLayout)` ableiten; TSDoc ergänzen.
- [ ] `HubLayoutLed` führt das `record.vinylLayout` aus dem Root in die Part; `TurntablePlayerRoot` rendert sie direkt vor `HubLed`; Namespace exportiert `LayoutLED: HubLayoutLed`.
- [ ] Grün ausführen: fokussierter Test, `pnpm exec biome check --write <changed files>`, `pnpm doctor:diff`.
- [ ] Commit: `Feat: add Discogs vinyl layout LED (MC-118)`.

## Task 2: Gates

- [ ] `pnpm --filter @musiccloud/frontend test:run` grün.
- [ ] `pnpm --filter @musiccloud/frontend exec astro check` ohne Errors.
- [ ] `pnpm doctor:diff` ohne Issues und `pnpm lint` sauber.
- [ ] Commit: `Chore: finalize vinyl layout LED (MC-118)` falls Gate-Fixes nötig sind.

## Checkliste

- [ ] Task 1 — Compound-Part und Root-Verdrahtung
- [ ] Task 2 — Gates
