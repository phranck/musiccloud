---
name: Spotify Web API Changes February 2026
description: Offizielle Spotify-Doc fuer Feb-2026 API-Restrictions; muss bei jeder Spotify-Beruehrung gegengelesen werden
type: reference
---

URL: https://developer.spotify.com/documentation/web-api/references/changes/february-2026

Status: Spotify ist auf Dauer keine zuverlaessige Quelle mehr. Phase B (`bae32dc7`) hat erste Mitigation gemacht (Resolverkette neu, label/popularity/followers Backfill, SPOTIFY_SEARCH_LIMIT_MAX guardrail), aber das Doc + verlinkte Seiten muessen bei jeder Spotify-Beruehrung VOLLSTAENDIG durchgegangen werden — nicht nur diese Hauptseite.

User-Direktive: Spotify in der kompletten Resolver-Chain konsequent als unzuverlaessig behandeln, nicht als gleichwertige Quelle.

Beim Lesen IMMER auch alle verlinkten Seiten ziehen (Migration Guide, Removed-Endpoints-Liste, Changelog-Entries).
