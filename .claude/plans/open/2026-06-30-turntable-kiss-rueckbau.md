# Turntable KISS-Rückbau: nur 33, Knob = Anzeige

Plan-Nr.: MC-072

**Goal:** Die in MC-071 (Einheit 4) gebaute interaktive Speed-Steuerung und der 45-RPM-Tonhöhen-Shift werden vollständig zurückgebaut. Der Plattenspieler läuft nur noch mit einer Drehzahl (33⅓ RPM) und ist reine Anzeige; bedient wird ausschliesslich über Playbutton/Spacebar. Knob-Animation (Indikator gleitet STANDBY↔33) und LED-Leuchteffekte bleiben.

**Hintergrund:** Der 45-RPM-`playbackRate`-Shift (MC-071 Einheit 4) verursachte drei Audio-Glitches — verschluckte Samples bei 45, Latenz beim Zurückschalten auf 33, Sample-Loop bei Pause. Statt die Glitches zu fixen, wird die Ursache (die gesamte Geschwindigkeits-Mechanik) entfernt — KISS. Empirisch bestätigt: dieselbe Stream-URL (iTunes-AAC-Preview) spielt in einer Minimal-Repro sauber durch (Play→45→33→Pause), nur die musiccloud-`playbackRate`-Verdrahtung glitchte. Der separat gefundene Hydration-Mismatch (Cover-Stage in `ShareLayout`) ist ein eigener Bug und bereits gefixt — nicht Teil dieses Rückbaus.

## Spec / Verhalten

- **Eine Drehzahl:** Nur 33⅓ RPM. Kein 45, kein `audio.playbackRate ≠ 1`, kein Tonhöhen-Shift.
- **Keine Knob-Bedienung:** Der Knob ist reine Anzeige — kein Drag, keine Pfeiltasten, kein `role="slider"`, `aria-hidden`.
- **Steuerung = Playbutton/Spacebar:** `togglePlay` (play/pause). Pause hält die Position (kein Rewind/STOP-Semantik mehr, die hing am entfernten Knob-STANDBY).
- **Anzeige bleibt:** Knob-Indikator gleitet animiert zwischen STANDBY (gestoppt) und 33 (spielend); LED leuchtet bei Wiedergabe; Vinyl-Rotor dreht/coastet unverändert.
- **`speed` ist abgeleitet:** `Playing → Rpm33`, sonst `Standby` — reine Projektion des Play-Status, kein eigener Setter.

## Änderungen (umgesetzt)

- `turntableState.ts`: `LP_ROTATION_DURATION_45_MS`, `LP_PLAYBACK_RATE_45`, `playbackRateForSpeed`, `rotationDurationForSpeed`, `SPEED_CYCLE`, `nextSpeedInCycle`, `speedAtOffset`, `stepSpeed` entfernt; `SPEED_KNOB_ANGLE_DEG`/`speedKnobAngle` auf Standby/Rpm33 reduziert; `derivePower`/`deriveSpinState` bleiben.
- `TurntablePlayerContext.ts`: `TurntableSpeed.Rpm45` entfernt (nur Standby/Rpm33); `setSpeed` aus dem Hub-Interface entfernt.
- `TurntablePlayerProvider.tsx`: `playbackRate`-Prop an `useAudioController` entfernt; `setSpeed`-Callback + `SpeedSet`-Action entfernt; `speedForEngineStatus` zur reinen Status-Projektion vereinfacht.
- `AudioPlayer.tsx`: `playbackRate`-Prop + zugehöriger `useEffect` entfernt.
- `KnobDial.tsx` (neu): presentational Dial aus dem gelöschten `TurntableKnob.tsx` herausgelöst; `gpuLayer`/`animated`-Props.
- `TurntableKnob.tsx`: gelöscht (interaktiver Knob entfällt komplett).
- `TurntablePlayerParts.tsx`: `HubControl` rendert den animierten Anzeige-`KnobDial` statt des interaktiven Knobs; `Platter`/`HubPlatter` ohne `speed`. Die "45"-Caption **bleibt** als dauerhaft unbeleuchteter Deck-Print erhalten (Teil der abgenommenen Optik), wird aber nie mehr beleuchtet. Alle vier Captions am echten DOM auf ein gleichmäßiges Uhrzeit-Raster (vom Knob-Zentrum) ausgerichtet: STANDBY 150°/8 Uhr (`left-[23.7%] top-[91.8%]`, vorher 154°), ON 180°/9 Uhr (unverändert), 33 210°/10 Uhr (`left-[13.6%] top-[41%]`, vorher 216°), 45 240°/11 Uhr (`left-[34.5%] top-[24.3%]`, vorher 246°). Der Knob-Zeiger zeigt verifiziert radial-korrekt auf seine Stellungen (Standby 150°, Rpm33 210°) und trifft damit die STANDBY- bzw. 33-Caption.
- `VinylRecord.tsx`/`.types.ts`: `speed`-Prop entfernt; feste `LP_ROTATION_DURATION_MS = 1800`, konstantes `LP_PLAYING_TIMING`.
- `Turntable.tsx`: statischer 33-Print-Zustand (kein `record.speed` mehr).
- Tests (`turntableState`/`TurntablePlayer`/`TurntablePlayerProvider`/`VinylRecord`/`Turntable`): 45-/Drag-/`playbackRate`-/`setSpeed`-Fälle entfernt, Anzeige- + Playbutton-Verhalten getestet.

## Checkliste

- [x] 45 RPM + `playbackRate` vollständig aus dem Code entfernt
- [x] Knob ist reine Anzeige (kein Drag/Keyboard/`role=slider`, `aria-hidden`)
- [x] Knob-Indikator-Animation (STANDBY↔33) + LED-Leuchteffekte bleiben
- [x] Caption-Positionen (33/45/ON/STANDBY) auf gleichmäßiges Uhrzeit-Raster ausgerichtet, am DOM verifiziert
- [x] Steuerung nur über Playbutton/Spacebar
- [x] "45"-Caption bleibt als unbeleuchteter Deck-Print stehen (Optik), nur nie mehr beleuchtet
- [x] Tests angepasst (kein 45/Drag/playbackRate/setSpeed)
- [x] Gates grün: Biome, tsc (0 Fehler), React-Doctor (0 Issues), Vitest (53 Files / 312 Tests)
- [ ] Visuelle Abnahme durch User (Knob-Animation, LED, Deck-Optik)
- [ ] Commit + Push (nur auf ausdrückliche User-Ansage)

## Verified facts

- `~/.local/bin/plans next` → `MC-072` (2026-06-30).
- Gates am 2026-06-30: `pnpm exec biome check` clean; `pnpm exec astro check` 0 errors; `pnpm run doctor:diff` 0 issues (10 Files); `pnpm exec vitest run` 53 Files / 312 Tests grün.
- `TurntableKnob.tsx` via `git rm` entfernt; `KnobDial.tsx` neu unter `apps/frontend/src/components/turntable/`.
