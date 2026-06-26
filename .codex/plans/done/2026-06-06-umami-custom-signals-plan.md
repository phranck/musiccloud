# Plan: Umami Custom Signals

Plan-Nr.: MC-027

Status: Done (partial) — Follow-up: MC-028
Created: 2026-06-06
Owner: Codex  
Primary goal: Die produktnahen Analytics-Signale werden neu und direkt fuer Umami implementiert. Es gibt keine alten Custom-Analytics-Funktionsnamen, keine Legacy-Types, keine Wrapper-Kompatibilitaet und keine Reaktivierung alter Routes.

## Ausgangslage

MC-026 hat die eigene Website-Analytics-Implementierung und GeoDB vollstaendig entfernt. Umami bleibt als generische Basisintegration im Frontend bestehen. Die alten produktnahen Signale sind nicht implementiert, sondern nur als neue Umami-Signale notiert.

## Zielbild

- UI-Interaktionen tracken direkt neue Umami-Events.
- Eventnamen sind neu und Umami-spezifisch, z. B. `music_search_submitted`, `music_service_link_click`, `music_preview_interaction`.
- Keine alten Namen wie `trackResolve`, `trackServiceLinkClick`, `WebsiteAnalytics` oder `website-events`.
- Kein Backend-Batch-Collector und keine eigene Analytics-Persistenz.
- Datenschutz bleibt explizit: keine rohen Suchbegriffe ohne bewusste Freigabe.

## Vorgeschlagene Signals

- `music_source_search_success`
- `music_search_submitted`
- `music_interaction`
- `music_service_link_click`
- `music_preview_interaction`
- `music_share_interaction`

## Umsetzungscheckliste

- [x] Aktuelle Umami-Integration im Frontend verifizieren.
- [x] Datenschutzregeln fuer Properties festlegen.
- [x] UI-Callsites fuer neue Umami-Signale inventarisieren.
- [x] Direkte `window.umami.track(...)` Calls oder kleinen Umami-only Helper implementieren.
- [x] Keine alten Analytics-Namen, Types, Routes oder Wrapper einfuehren.
- [x] Dashboard-/Umami-Auswertung separat pruefen.
- [x] Gates und Residual-Suchen ausfuehren.

## Nachtrag (2026-06-08)

Die Umsetzung erfuellt die im Plan definierten Checkboxen, aber die in Umami sichtbaren Events sind in der Praxis nicht brauchbar:

- Eventnamen wie `music_interaction` und `music_preview_interaction` sind zu generisch. Die eigentliche Bedeutung (z.B. "Spotify clicked", "Preview started") steckt in Properties, ist in der Umami-Events-Uebersicht nicht direkt sichtbar und erzwingt einen Drilldown pro Event.
- Lokales Tracking war nicht zuverlaessig deaktiviert: `TRACKING_ENABLED` gate't nur den Script-Inject und defaulted auf `true`. Dev-Aktionen landen damit in der Prod-Statistik.

Beide Punkte werden in MC-028 (`.claude/plans/open/2026-06-08-natural-language-umami-events-design.md`) adressiert: menschenlesbare Event-Namen im Format `Group: Detail`, pro UI-Aktion ein eigener Name, harte Dev-Suppression.

Plan zurueck nach `open/` verschoben, weil das Zielbild ("produktnahe Analytics-Signale") faktisch nicht erreicht wurde. Endgueltiges `done/`-Marking erfolgt erst nach Abschluss von MC-028.
