# Spec: Orange Vinyl-Layout-LED am Plattenspieler

## Ziel

Der Plattenspieler zeigt zusätzlich zur bestehenden grünen Power-LED eine orange
Status-LED. Sie leuchtet, wenn das aktuell eingelegte Album ein persistiertes
Discogs-`VinylLayout` besitzt, unabhängig von Wiedergabestatus oder aktuell
gematchter Seite.

## Komponentenentwurf

- Die bestehende grüne `TurntablePlayerLed` bleibt unverändert.
- Eine neue Compound-Part `TurntablePlayerLayoutLed` kapselt Farbe, Glühen,
  Status und Test-Hooks der orangefarbenen LED.
- Der umgebende Turntable-Layout-Part platziert sie direkt links der grünen
  Power-LED.
- Die Part erhält das Albumlayout über den bestehenden `RecordLabel`-Datenfluss
  und entscheidet ausschließlich über `Boolean(record.vinylLayout)`.

## Verhalten

- `vinylLayout` vorhanden: orange LED mit voller Optik und Glow.
- `vinylLayout` fehlt oder ist `undefined`: orange LED aus.
- Der Status bleibt bei Pause, Stopp und während eines Trackwechsels unverändert,
  solange dasselbe Albumlayout eingelegt ist.
- Die LED ist dekorativ (`aria-hidden`) und erhält `data-turntable-layout-led`
  für gezielte Tests.

## Tests

- Layout vorhanden: LED ist an und liegt links der grünen LED.
- Layout fehlt: LED ist aus.
- Der vorhandene Power-LED-Test und ihr Verhalten bleiben unverändert.

## Scope

Keine neue Backend-Abfrage, keine Änderung am Rillen-Matcher, keine Interaktion
und keine neue globale UI-Struktur. Die Erweiterung nutzt ausschließlich den
bereits geplanten MC-117-Datenfluss.
