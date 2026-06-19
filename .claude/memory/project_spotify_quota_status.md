---
name: Spotify Account-Status fuer musiccloud
description: Spotify Premium ja, aber Dev Client ID ist Developer Mode (kein Extended Quota) — alle Feb-2026-Restrictions treffen voll
type: project
---

Stand 2026-04-29:

- Spotify-Account des Owners: **Premium ✓** (erfuellt Premium-Requirement aus Feb-2026 Dev-Mode-Regeln).
- musiccloud Spotify Client-ID: **Developer Mode** (NICHT Extended Quota).

Konsequenz: Alle Feb-2026 Restrictions treffen voll. Insbesondere:
- Endpoint-Removals gelten (kein artist-top-tracks, kein bulk-tracks/albums/artists, kein browse, kein markets)
- Field-Removals gelten (popularity, label, followers, available_markets, linked_from, etc. — siehe `reference_spotify_feb2026_changes.md`)
- 5-User-Cap fuer authorisierte User pro Client-ID
- 1 Client-ID pro Developer Cap

User-Direktive: KEINE Frontend-Information weglassen. Alles was angezeigt wird muss weiter angezeigt werden. Loesung = Daten aus anderen Services (Deezer, Apple Music, Last.fm, MusicBrainz, Tidal). Resolver-Chain wird adaptiert, nicht UI.

**How to apply:**
- Bei jeder Spotify-Beruehrung: Phase-B-Mitigation als Baseline. Plus alle weiteren removed-fields/-endpoints abdecken.
- Bei Frontend-Anzeige: kein Feld darf "deleted" werden, weil Spotify es nicht mehr liefert. Stattdessen: Replacement-Quelle finden.
- Migration zu Extended Quota nicht moeglich ohne Spotify-seitiges Approval — als Plan-Annahme: Dev Mode dauerhaft.
