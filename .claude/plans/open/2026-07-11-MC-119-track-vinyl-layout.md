# Track-Resolve Vinyl-Layout

Plan-Nr.: MC-119

**Goal:** Track-Resolves liefern das best-effort Discogs-Layout ihres Albums und teilen dessen Cache unabhängig vom aufgerufenen Track.

## Task 1

- [x] Eine stabile Albumidentität aus normalisiertem Hauptartist plus Albumtitel definieren und per TDD testen.
- [x] Persistenten Lookup von dieser Identität auf den bestehenden Album-Vinyl-Layout-Cache ergänzen, ohne falsche Pressungen zu raten.
- [x] Track-Resolve best-effort damit anreichern und `track.vinylLayout` im Shared/OpenAPI-Vertrag ausliefern.
- [x] Backend-Gates und Review.

## Task 2

- [ ] MC-117 Task 5/6 um `vinylLayout` für Track- und Album-Responses ergänzen.
- [ ] Turntable- und LED-End-to-End-Tests ausführen.
