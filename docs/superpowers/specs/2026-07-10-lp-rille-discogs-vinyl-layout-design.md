# Spec: LP-Rille aus echten Discogs-Vinyl-Daten

**Datum:** 2026-07-10
**Status:** Entwurf, Design freigegeben — Umsetzung ausstehend

## Kontext

Der Plattenteller rendert die LP über [VinylRecord.tsx](../../../apps/frontend/src/components/vinyl/VinylRecord.tsx). Die sichtbare Rille ist heute eine **statische, modul-globale Archimedes-Spirale** (`vinylGrooveSpiralPath`, einmal beim Modul-Load als Data-URL-SVG-Bitmap gebacken, für **jede** Platte identisch). Der Seitenbuchstabe am Label ist hart „SIDE A" (SVG-`tspan` + `sr-only`). Die Label-Props werden im View-Model-Layer befüllt ([MediaCardHead.tsx](../../../apps/frontend/src/components/cards/MediaCardHead.tsx) Z. 38-43, gespeist aus den Resolve-Parsern); `VinylRecord` selbst ist rein präsentational, und die Label-Daten fließen als `RecordLabel = Omit<VinylRecordProps, …>` durch den Turntable-Stack ([RecordSwapStage.tsx](../../../apps/frontend/src/components/turntable/RecordSwapStage.tsx)).

Discogs ist im Backend heute **nur** als Artist-Identifier-Typ präsent (`idType: 'discogs'` in den `*_external_ids`-Aggregaten, [postgres.ts](../../../apps/backend/src/db/schemas/postgres.ts)) — es gibt **keinen** Discogs-Release-Lookup, keinen Adapter, kein Token. Für dieses Feature wird der Discogs-Zugang neu gebaut.

## Ziel

Die LP-Oberfläche soll dem echten Vinyl nahekommen: statt einer homogenen Rille zeigt sie die **Pausenrillen** zwischen den Tracks an den korrekten radialen Positionen, plus eine **Einlaufrille** außen vor Track 1 und eine **Auslaufrille** innen am Seitenende. Der **Seitenbuchstabe** (A/B/C/D) am Label wird dynamisch aus dem gerade spielenden Track abgeleitet.

Physik dahinter: Eine LP-Seite läuft außen→innen mit näherungsweise konstantem Rillenabstand, also entspricht der Radius linear der abgespielten Zeit. Jeder Track belegt ein radiales Band proportional zu seiner Dauer; zwischen zwei Tracks liegt die sichtbare Pausenrille. Mit der geordneten Tracklist + Dauern **einer Seite** lässt sich das exakt abbilden.

## Getroffene Entscheidungen

- **Nur echte Discogs-Daten.** Pausenrillen und echter Seitenbuchstabe entstehen ausschließlich, wenn Discogs eine Vinyl-Pressung mit vollständigen Track-Dauern liefert. Ohne solche Daten bleibt es wie heute: homogene Rille, „Side A". Kein erfundenes Vinyl.
- **Fidelity: Pausenrillen + Einlauf- + Auslaufrille** (drei Detailtypen). Kein variabler Rillenabstand je Lautstärke — dafür fehlt eine verlässliche Loudness-Quelle.
- **Kein Discogs-Cover.** Das Album-Cover bleibt beim bestehenden, rechtssicheren Streaming-Artwork. Grund: Discogs-*Daten* sind CC0, aber Discogs-*Bilder* sind es nicht (siehe „Rechtliche Lage"). Die Authentizität kommt aus der Rille.
- **Layout wird persistiert.** Discogs wird pro Album genau einmal angefragt; das normalisierte Layout liegt in der DB. Kein Discogs-Call pro View.
- **Zwei-Plan-Split.** Backend-Datenbeschaffung/-Persistenz und Frontend-Rendering sind getrennt und einzeln testbar; Daten zuerst (Rendering liefert ohne echte Daten nichts Sichtbares).

## Rechtliche Lage (live recherchiert, 2026-07-10)

- **Discogs-Daten (Tracklist, Dauern, Positionen) = CC0**, frei auch kommerziell nutzbar. Die Groove-Map + Seitenbuchstabe stehen damit rechtlich sicher.
- **Discogs-Bilder ≠ CC0.** Nur gedeckt, wenn der Uploader CC0 gewährt hat, das Bild bereits CC0 ist, oder Fair Use greift — variiert pro Bild. Bilder erfordern laut ToS Auth + signierte URLs, sind „nicht frei hotlinkbar", und kommerzielle Nutzung liegt im alleinigen Ermessen von Discogs. Daher aus dem Scope genommen.

Quellen: [Discogs API Terms of Use](https://support.discogs.com/hc/en-us/articles/360009334593-API-Terms-of-Use), [Discogs API Docs](https://www.discogs.com/developers).

## Verifizierte Discogs-API-Fakten (live gegen `api.discogs.com`, 2026-07-10)

Geprüft an echten Releases 249504 (Never Gonna Give You Up, 7"), 15815903 (The Sermon!, LP) und Master 33100.

- Base `https://api.discogs.com`. Eindeutiger `User-Agent` nötig (generische UAs werden härter gedrosselt). Rate-Limit **60/min mit Token, 25/min ohne**; `429` bei Überschreitung; Header `X-Discogs-Ratelimit-*`. Persönliches Token → Env `DISCOGS_TOKEN`.
- `GET /database/search?type=master&artist=&release_title=&format=Vinyl` — lieferte live auch ohne Token Ergebnisse (Token nur fürs höhere Limit).
- `GET /masters/{id}/versions?format=Vinyl` — ohne Auth; `versions[]` mit `{ id, released: "1959", format: "LP, Album, Stereo", country }` + `pagination.items`.
- `GET /releases/{id}` — `formats: [{ name: "Vinyl", qty, descriptions: ["LP","Album",…] }]`, `identifiers: [{ type: "Barcode", value }]`, `tracklist: [{ position: "B1", type_: "track", title, duration: "11:54" }]`. `duration` ist `"M:SS"`/`"MM:SS"` und kann leer sein.
- **Seitenableitung:** Seitenbuchstabe = führendes Alpha-Präfix der `position` (`"A"` → Seite A; `"B1"`/`"B2"` → Seite B). Nur `type_ === "track"` zählt.

## Subsystem 1 — Datenmodell & Beschaffung (Backend)

### Normalisiertes `VinylLayout` (die persistierte Wahrheit)

```
VinylLayout {
  discogsReleaseId: string   // Provenienz: welche Pressung gematcht wurde
  sides: VinylSide[]
}
VinylSide {
  label: "A" | "B" | "C" | "D" | …
  tracks: { position: string; title: string; durationMs: number }[]
}
```

Bewusst **nur Dauern** gespeichert. Kumulierte Radius-Bruchteile und SVG-Pfad werden daraus deterministisch abgeleitet (DRY: eine Quelle; Optik-Tweaks brauchen kein Discogs-Refetch).

### Persistenz

- Eigene Tabelle **`album_vinyl_layouts`** (FK auf `albums.id`, `layout jsonb`, `fetched_at`). Fügt sich ins Muster der bestehenden `album_*`-Tabellen ein, hält `albums` schlank, erlaubt Refetch/TTL. (Alternative — `jsonb`-Spalte direkt auf `albums` — verworfen: bricht die „alles normalisiert"-Konvention.)
- Die gematchte Discogs-Release-ID wandert zusätzlich als `idType: 'discogs_release'` in die bestehende `album_external_ids`-Tabelle (dauerhafte Provenienz, unabhängig vom Layout-Cache).

### Beschaffung & Matching (best-effort beim Album-Resolve)

1. `type=master` per Artist + Titel suchen → Master-ID. (UPC/Barcode ist **nicht** primär: ein Barcode pinnt oft die CD/eine Sonderpressung, nicht die Vinyl — er dient nur als Identitäts-/Konfidenz-Signal.)
2. `/masters/{id}/versions?format=Vinyl` → **Original-Pressung** wählen: früheste `released`-Jahreszahl, `format`-String ohne „Reissue".
3. Gewählte Release holen → Tracklist.
4. **Seiten-Split** nach Positions-Präfix; nur `type_ === "track"`.
5. **Vollständigkeits-Pflicht:** fehlt bei irgendeinem Track die `duration`, ganze Pressung verwerfen → homogene Rille.

### Cache & Latenz

- Nach jeder Prüfung eine `album_vinyl_layouts`-Zeile: Layout **oder** `layout = null` + `fetched_at` als Negativ-Marker („geprüft, keine Vinyl-Pressung"), damit kein weiterer Resolve dasselbe Album erneut anfragt.
- Fetch läuft best-effort mit kurzem Timeout; kommt er nicht durch, persistiert das Album ohne Layout (homogen) und ein späterer Resolve/Backfill füllt nach. Hot-Path nie blockierend.
- Rate-Limit unkritisch bei aktuellem Volumen; simpler In-Process-Throttle reicht (kein eigenes Queueing — YAGNI).

## Subsystem 2 — Frontend-Rendering & Datenfluss

### Komponenten-Grenzen (SRP)

- `VinylRecord` bekommt eine neue **optionale** Prop `sideLayout` (Seitenbuchstabe + Track-Dauern der *aktuellen* Seite). Ist sie da → dynamische Rille; fehlt sie → exakt die heutige homogene Spirale. `VinylRecord` bleibt dumm: es rendert nur, was ihm gegeben wird.
- Die **Track→Seite-Zuordnung** passiert *außerhalb* von `VinylRecord`, im View-Model-Layer ([MediaCardHead.tsx](../../../apps/frontend/src/components/cards/MediaCardHead.tsx) / Parser): der gerade spielende Track wird gegen die persistierte `VinylLayout` des Albums gematcht (normalisierter Titel; Fallback: Track-Reihenfolge/Index), die getroffene Seite wandert als `sideLayout` runter.

### Rille dynamisch

`vinylGrooveSpiralPath` wird zur Funktion der Seite: kumulierte Dauer-Bruchteile → Radien zwischen Außen und Innen; an jeder Track-Grenze eine Pausenrille (kurzer, glatter, weiterer Abschnitt), außen die Einlaufrille vor Track 1, innen die Auslaufrille. Weiterhin als Data-URL-SVG-Bitmap gebacken (jetzt **pro Platte, per Layout memoisiert**) → der Rotor bleibt **eine gecachte GPU-Layer**; die bestehende Firefox/Safari-Spin-Performance-Logik bleibt unangetastet.

### Seitenbuchstabe dynamisch

Das harte „SIDE A" (SVG-`tspan` + `sr-only`) wird durch `sideLayout.label` ersetzt; ohne Layout Default „A".

### Datenfluss end-to-end

Resolve → Discogs-Enrich → `VinylLayout` am Album persistiert → Resolve-Payload trägt `album.vinylLayout` → View-Model → `MediaCardHead` bestimmt aktuelle Seite → `VinylRecord` rendert Rillen-Map + Buchstabe. Fällt irgendein Schritt aus → homogen + „A".

## Fehlerbehandlung & Edge-Cases

Jeder Ausfall → homogene Rille + „A", nie falsche Rillen:

- Kein Discogs-Master / keine Vinyl-Version → **Negativ-Cache** (nur bei *definitivem* „keine Vinyl-Pressung", langlebig).
- Transienter Fehler (Timeout, `429`, Netz) → **kein** Negativ-Marker schreiben, damit ein späterer Resolve erneut versucht (sonst friert ein Netzhänger ein Album dauerhaft als „kein Vinyl" ein).
- Pressung gefunden, aber unvollständige Dauern → verwerfen.
- `type_ !== "track"` (Index-/Mehrteiler-Einträge) → ignorieren; hat eine Seite dadurch Tracks ohne Top-Level-Dauer → Pressung verwerfen.
- Track→Seite-Match scheitert (Titel weicht ab) → für diese View homogen, statt eine geratene Seite zu zeigen.
- Mehrfach-LP (Seiten C/D…) → Seitenableitung übers Alpha-Präfix trägt das automatisch.

## Tests (TDD)

- **Backend:** Discogs-JSON → `VinylLayout`-Normalisierung: Seiten-Gruppierung nach Positions-Präfix (`A`/`B1`/`B2` → A, B), Dauer-Parsing (`"11:54"` → ms), Unvollständigkeits-Verwerfen, Original-Pressung-Wahl (schließt „Reissue" aus). Positiv/Negativ-Cache-Schreiben und Nicht-Schreiben bei transientem Fehler. HTTP gemockt mit Fixtures der real geprüften Releases (The Sermon!, Never Gonna Give You Up).
- **Frontend:** Spiral-Builder (kumulierte Fractions, Pausenrillen-Anzahl = Tracks − 1, Einlauf-/Auslaufrille vorhanden), Track→Seite-Matching (normalisierter Titel, Fallback Reihenfolge), `VinylRecord` rendert dynamischen Seitenbuchstaben und fällt ohne `sideLayout` auf homogen zurück. Bestehender `VinylRecord.test.tsx`-„SIDE A"-Test wird auf den dynamischen Buchstaben umgestellt.

## Plan-Aufteilung

- **Plan 1 (Backend, zuerst):** Discogs-Client (Env-Token, UA, Throttle), Matching (Master → Original-Vinyl-Version), Normalisierung nach `VinylLayout`, `album_vinyl_layouts`-Tabelle + Migration, `discogs_release`-ID in `album_external_ids`, Enrichment im Resolve-Pfad (best-effort, Positiv/Negativ-Cache), Ausspielen des Layouts in der Resolve-/Album-Payload. Tests wie oben.
- **Plan 2 (Frontend):** `VinylRecordProps.sideLayout`, dynamischer Spiral-Builder (Pausenrillen + Einlauf-/Auslaufrille, per-Layout memoisierter Bitmap-Bake), Track→Seite-Matching im View-Model, dynamischer Seitenbuchstabe. Tests wie oben.

## Verifizierte Fakten

- **Discogs-API** (live gegen `api.discogs.com`, 2026-07-10): Endpunkte `/database/search`, `/masters/{id}/versions`, `/releases/{id}`; Feld-Struktur `formats`/`identifiers`/`tracklist` (`position`, `type_`, `title`, `duration`); Rate-Limits 60/25; Env-Token. Beispiel-Releases 249504, 15815903, Master 33100.
- **Rechtslage** (live, 2026-07-10): Daten CC0, Bilder nicht CC0 (Discogs API Terms of Use).
- **Code (gelesen):** [VinylRecord.tsx](../../../apps/frontend/src/components/vinyl/VinylRecord.tsx) (homogene Spirale, hartes „SIDE A"), [MediaCardHead.tsx](../../../apps/frontend/src/components/cards/MediaCardHead.tsx) Z. 38-43 (Label-Prop-Mapping), [RecordSwapStage.tsx](../../../apps/frontend/src/components/turntable/RecordSwapStage.tsx) (`RecordLabel`), [postgres.ts](../../../apps/backend/src/db/schemas/postgres.ts) (`albums`, `album_external_ids`; keine jsonb-Spalte auf `albums`; Discogs nur als Artist-ID).
- **Offen (zur Plan-Write-Zeit zu verifizieren):** exakte Erweiterung von `NormalizedAlbum` und des Resolve-Persist-Pfads, exakte Stelle im Resolve-Flow für das Enrichment, `.env.local`/Zerops-Env-Verdrahtung für `DISCOGS_TOKEN`.
