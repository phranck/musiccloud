# Artist Bio Cache und manuelle Refresh-Flows

Plan-Nr.: MC-029

> musiccloud · Artist-Daten · Folgeplan.

Stand: 2026-05-22. Dieser Plan beschreibt spätere Schritte nach dem aktuellen Fix für kontextbasierte Artist-Info-Auflösung, längere Profile-TTLs und Last.fm-Disambiguation-Filter.

**Eckdaten:** Profile-TTL `Math.round(365 / 2)` Tage, Top Tracks 7 Tage, Events 24 Stunden. Expliziter Profil-Refresh via `refresh=profile`. Track-Button löst den Artist-Identity-Resolve aus.

## Ausgangslage

Das Artist-Info-API cached bereits drei getrennte Sektionen in `artist_cache`: `profile`, `top_tracks` und `events`. Der normale Share-Page-Flow soll diese Daten nicht ständig neu von externen Quellen holen. Manuelle Aktualisierung soll gezielt möglich sein, ohne dynamischere Daten wie Events oder Top Tracks unbeabsichtigt zu verändern.

### Bleibt stabil

Profil-Daten werden lange gecached und nur bei Ablauf oder explizitem Refresh neu geladen.

### Bleibt dynamisch

Top Tracks und Events behalten kürzere TTLs, weil diese Daten sich real häufiger ändern.

### Bleibt nachvollziehbar

Spätere Arbeit sollte Quelle, Aktualisierungszeit und Refresh-Auslöser sichtbar machen.

## Nächste sinnvolle Schritte

| Schritt | Ziel | Betroffene Bereiche | Risiken / Hinweise |
|----|----|----|----|
| Dashboard-Refresh für Artist Profile | Admin kann ein einzelnes Artist-Profil bewusst neu laden. | `apps/dashboard`, `apps/backend/src/routes/artist-info.ts` | Nur `refresh=profile` verwenden, nicht pauschal alle Cache-Sektionen löschen. |
| Refresh-Audit persistieren | Festhalten, wer wann welches Profil refreshed hat und ob der Upstream erfolgreich war. | Neue Drizzle-Migration, Repository, Dashboard-Detailseite | Migration ausschließlich via Drizzle erzeugen und anwenden. |
| Source-Provenance im Profil speichern | Pro Feld sichtbar machen, ob Bild, Bio, Genres oder Similar Artists von Deezer, Last.fm oder Spotify kamen. | `artist_cache.profile`, `artist_profiles`, `artist_entity_texts`, `artist_sources` | Bestehendes API nicht brechen. Neue Felder optional hinzufügen und vorhandene normalisierte Tabellen bevorzugen. |
| Normalisierte Artist-Profile nutzen | Langfristig weg von reinem JSON-Cache hin zur bereits vorhandenen Entity-basierten Profilpersistenz. | `artist_entities`, `artist_profiles`, `artist_service_links`, `artist_entity_identifiers`, `artist_external_ids` | Keine neue Basismigration planen. Bestehendes Modell erweitern oder bewusst per ADR ergänzen. |
| Ambiguitätsregeln erweitern | Nicht nur Last.fm-Standardtexte filtern, sondern auch kurze Alias-Namen und falsch gematchte Profile markieren. | Artist-Composition-Sources, Tests, eventuell Dashboard-Warnings | Filter dürfen legitime kurze Künstlernamen wie `KK` nicht grundsätzlich blockieren. |
| Cache-Metriken anzeigen | Dashboard zeigt Cache-Alter, nächste automatische Aktualisierung und letzte Quelle. | Admin API, Dashboard UI | Nur lesen, keine impliziten Refreshes durch bloßes Anzeigen auslösen. |
| Track-basierter Artist-Identity-Resolve | Admin kann pro Track die Artist-, Member- und Entity-Daten bewusst auflösen und persistieren. | `apps/backend/src/routes/admin*`, `TracksPage.tsx`, Artist-Identity-Repository | Nur idempotente Upserts. Bestehende Track-Anzeige darf sich nach dem Resolve nicht verschlechtern. |

## Artist-Identity-Resolve pro Track

Zusätzlich zum Bio-Cache braucht es einen separaten, expliziten Resolve-Flow für die neuen normalisierten Artist-Daten. Dieser Flow soll aus einem vorhandenen Track-Kontext die korrekten Artist-Entities, Band-/Member-Beziehungen, Service-IDs und spätere Bio-Fakten ermitteln und in die bestehenden Tabellen schreiben. Auslöser ist ein Button in der Dashboard-Trackliste.

### Backend-Funktionen

| Funktion | Aufgabe | Persistenz |
|----|----|----|
| `resolveArtistIdentityForTrack(trackId)` | Lädt Track, Artist-Credits, Service-Links, Album-Kontext und bestehende Artist-Entities. | Keine direkten Writes, nur Orchestrierung und Ergebnisbericht. |
| `resolveArtistEntityCandidates(credit, context)` | Sucht Wikidata, MusicBrainz und vorhandene Service-IDs nach passenden Person-, Group- oder Persona-Entities ab. | Schreibt Identity-Provenance nach `artist_sources`, `artist_source_payloads`, `artist_entity_identifiers` und Namen nach `artist_entity_names`; legacy/service-nahe IDs bleiben in `artist_external_ids` oder `artist_service_links`. |
| `resolveBandMemberships(groupEntityId)` | Ermittelt Bandmitglieder, Rollen, aktive Zeiträume und Quellen. | Schreibt nach `artist_group_memberships`; Personen werden als eigene Entities angelegt. |
| `resolveArtistIdentityEvents(entityId)` | Ermittelt Geburtsdatum, Sterbedatum, Gründungsdatum oder Auflösungsdatum mit Date-Precision. | Schreibt nach `artist_entity_events` inklusive Quelle, Confidence und Ortsdaten. |
| `persistArtistProfileFacts(entityId)` | Übernimmt stabile Bio-/Bild-/Genre-Fakten in die spätere Entity-basierte Profilstruktur. | Aktualisiert zuerst die bestehenden Tabellen `artist_profiles` und `artist_entity_texts`; eine neue Facts-Tabelle braucht eine eigene ADR. |

### Admin API

```http
POST /api/admin/tracks/:trackId/artist-identity/resolve
  body:
    {
      "refresh": false,
      "sources": ["wikidata", "musicbrainz"],
      "includeMembers": true,
      "includeIdentityEvents": true
    }

GET /api/admin/tracks/:trackId/artist-identity/status
```

Der POST-Endpoint sollte synchron nur kleine Jobs abarbeiten oder einen Job anlegen. Bei längeren Upstream-Requests ist ein Job-Modell besser, damit die Trackliste nicht blockiert. Statusänderungen können später über das vorhandene SSE-Muster der Admin-Listen aktualisiert werden. Vor der Backend-Implementierung müssen `ENDPOINTS.admin.tracks...` und passende `ROUTE_TEMPLATES.admin.tracks...` in `packages/shared/src/endpoints.ts` ergänzt werden; aktuell existieren nur Liste, Detail und Cache-Invalidierung.

### Statusmodell

| Status | Bedeutung | Phosphor Icon | UI-Verhalten |
|----|----|----|----|
| `missing` | Für den Track wurden noch keine Artist-Identity-Daten aufgelöst. | `Question` oder `CircleDashed` | Button aktiv: Resolve starten. |
| `partial` | Artist-Entities existieren, aber Member oder Bio-/Event-Fakten fehlen noch. | `WarningCircle` | Button aktiv: vervollständigen oder refreshen. |
| `resolved` | Artist-Entities, externe IDs und relevante Identity-Fakten sind vorhanden. | `CheckCircle` | Button optional als Re-Resolve mit sekundärer Optik. |
| `ambiguous` | Mehrere plausible Entities gefunden, manuelle Auswahl nötig. | `GitBranch` oder `Intersect` | Button öffnet Review-Dialog mit Kandidaten. |
| `running` | Resolve läuft gerade. | `SpinnerGap` | Button disabled, Icon rotiert. |
| `failed` | Letzter Resolve ist fehlgeschlagen. | `XCircle` | Button aktiv: Retry. Tooltip zeigt Fehlerkurztext. |

### Dashboard Track-Liste

Konkreter UI-Ort ist `apps/dashboard/src/features/music/TracksPage.tsx`. Dort gibt es bereits eine `invalidate-cache`-Spalte und eine Action-Spalte mit Edit-Button. Der aktuelle `TrackListItem` enthält noch keinen `artistIdentityStatus`; Backend-List-DTO, Dashboard-Typ und Table-Column müssen vor dem Start-Button erweitert werden:

- Neuer Spalten-Key: `artistIdentity` mit kompakter Icon-Anzeige und Tooltip.
- Button neben dem Edit-Button in der bestehenden `actions`-Spalte oder eigene schmale Spalte zwischen `invalidate-cache` und `actions`.
- Button-Label: Deutsch `Artist-Daten auflösen`, Englisch `Resolve artist data`.
- Während `running`: `SpinnerGap` mit `animate-spin`, Button disabled.
- Nach Erfolg: Tabelle per bestehendem Admin-Table-Refresh oder SSE aktualisieren.
- Bei `ambiguous`: Review-Dialog mit Kandidaten, Quelle, Confidence, Entity-Typ und vorhandenen Membern.

### Persistenz und Drizzle

Falls für Jobstatus oder Audit noch Tabellen fehlen, braucht es eine neue Drizzle-Migration. Keine manuellen SQL-Migrationen. Schema zuerst in `apps/backend/src/db/schemas/postgres.ts` eintragen, dann `pnpm db:generate` und erst mit isolierten Daten `pnpm db:migrate`. Ein mögliches Zusatzmodell:

```text
artist_identity_resolve_jobs
  id                   text primary key
  track_id             text not null references tracks(id)
  status               text not null
  requested_by_user_id text null references admin_users(id)
  started_at           timestamptz null
  finished_at          timestamptz null
  error_message        text null
  result_summary       jsonb not null default '{}'
  created_at           timestamptz not null
  updated_at           timestamptz not null
```

## Empfohlenes Datenmodell später

Der aktuelle `artist_cache` ist als operativer API-Cache ausreichend. Für stabile Artist-Bio-Daten existieren inzwischen normalisierte Entity-Tabellen im aktuellen Code: `artist_profiles` für Share-Profil-Metadaten, `artist_entity_texts` für Bio-Texte, `artist_entity_events` für Lifecycle-Events und `artist_group_memberships` für Band-/Member-Beziehungen.

```text
artist_profiles
  artist_entity_id text primary key references artist_entities(id)
  image_url text null
  genres text null
  source_service text null
  source_url text null
  created_at timestamptz not null
  updated_at timestamptz not null

artist_entity_texts
  id text primary key
  artist_entity_id text not null references artist_entities(id)
  locale text not null
  text_type text not null -- description, short_bio
  content text not null
  source_id text null references artist_sources(id)
  created_at timestamptz not null
  updated_at timestamptz not null
```

Wichtig: Eine zusätzliche `artist_profile_facts`-Tabelle sollte nicht als erster nächster Schritt kommen. Zuerst muss die bestehende Artist-Entity-Verknüpfung in Tracks, Albums und Artist-Views stabil genutzt werden.

## Implementation Checklist

Jeder Punkt ist als stabiler Zwischenstand geschnitten. Nach jedem Code-Scope bleiben Typecheck, relevante Tests und Drizzle-Regeln sauber, bevor der nächste Scope beginnt.

- [ ] Offene Produktentscheidungen festhalten: Dashboard-only oder interne Admin-API, synchroner Resolve oder Jobmodell, Status auf Track- oder Artist-Credit-Ebene, Quellen-Priorität bei Konflikten.
- [ ] Aktuelle Artist-Info-, Cache-, Dashboard-Tracklisten-, Admin-API- und Drizzle-Strukturen gegen den Code inventarisieren, ohne Verhalten zu ändern.
- [ ] Refresh-Verhalten direkt am Backend und am Astro-Proxy absichern: Backend lehnt ungültige Refresh-Werte mit `400` ab, der Proxy darf ungültige Werte nicht still zu `undefined` machen, und `refresh=profile` bleibt strikt auf die `profile`-Sektion begrenzt.
- [ ] Route-/Cache-Repository-Tests für Cache-Sektionstrennung ergänzen: gültige Profile-TTL nutzt Cache, `refresh=profile` aktualisiert nur Profile, `top_tracks` und `events` bleiben unverändert.
- [ ] Backend-/Frontend-Gate nach Refresh-Absicherung ausführen: `pnpm --filter @musiccloud/backend typecheck`, relevante Artist-Info-Route-/Repository-Tests und bei Proxy-Änderungen `pnpm --filter @musiccloud/frontend build`.
- [ ] Dashboard-API um read-only Cache-Metriken erweitern: Cache-Alter, Stale-Status, letzte Quelle und letzter manueller Refresh, ohne implizite Refreshes.
- [ ] Dashboard-UI für Artist-Profile-Cache-Status ergänzen und bestehende Layout-/Button-Patterns wiederverwenden; danach Dashboard-Typecheck ausführen.
- [ ] Manuellen Profile-Refresh im Dashboard verdrahten: explizite Aktion, Loading/Error/Success-State, danach bestehende Datenaktualisierung nutzen; Dashboard-Tests ergänzen.
- [ ] Refresh-Audit-Datenmodell entscheiden und, falls nötig, ausschließlich per Drizzle generieren, anwenden und Repository-Zugriff typisiert anbinden.
- [ ] Refresh-Audit schreiben: User, Artist/Profile-Kontext, Zeitpunkt, Auslöser, Upstream-Erfolg und Fehlerkurztext persistieren; danach Backend-Typecheck und Tests ausführen.
- [ ] Shared Endpoints und Route-Templates für Artist-Identity-Status und Resolve-Start in `packages/shared/src/endpoints.ts` ergänzen; danach `pnpm --filter @musiccloud/shared typecheck` ausführen.
- [ ] Artist-Identity-Resolve-Status backendseitig read-only bereitstellen: `missing`, `partial`, `resolved`, `ambiguous`, `running`, `failed`; dazu `listTracks`/DTO um `artistIdentityStatus` erweitern, aber keine Writes in diesem Schritt.
- [ ] Trackliste um Artist-Identity-Statusanzeige mit Phosphor-Icon und Tooltip erweitern, ohne bestehende Invalidate-/Edit-Actions zu verändern; danach Dashboard-Typecheck und relevante Tests ausführen.
- [ ] Resolve-Start-Endpoint ergänzen: pro Track startbar, idempotent, klare Fehlerantworten, und vorab festlegen, ob Track-Credits nur ergänzt/annotiert oder bestehende Main-Credits ersetzt werden; Backend-Tests ergänzen.
- [ ] Resolve-Orchestrierung in kleine compilierbare Services schneiden: Track-Kontext laden, Kandidaten ermitteln, Identity-Provenance nach `artist_sources`/`artist_entity_identifiers` upserten, Memberships optional nach `artist_group_memberships` upserten, Lifecycle-Events optional nach `artist_entity_events` upserten.
- [ ] Ambiguous-Flow absichern: bei mehreren plausiblen Kandidaten keine falsche Bio übernehmen, sondern Status `ambiguous` und Kandidaten für Review liefern.
- [ ] Finale Gates ausführen und dokumentieren: relevante Backend-/Dashboard-Tests, Typechecks, `pnpm lint` und Drizzle-Migration gegen isolierte lokale Testdatenbank oder Dump.

## Akzeptanzkriterien

- Normale Share-Seiten lesen Artist-Profile aus dem Cache und lösen keinen Upstream-Request aus, solange die TTL gültig ist.
- `refresh=profile` aktualisiert nur die Profil-Sektion und lässt `top_tracks` sowie `events` unverändert.
- Ungültige Refresh-Werte werden mit `400` abgelehnt.
- Das Dashboard zeigt klar an, ob ein Profil gecached, stale oder manuell refreshed wurde.
- Die Track-Liste zeigt pro Track einen Artist-Identity-Status mit Phosphor-Icon.
- Ein Button pro Track kann den Artist-Identity-Resolve starten, ohne andere Trackdaten zu verändern.
- Der Resolve befüllt Artist-Entities, Namen, externe IDs, Memberships und Identity-Events idempotent.
- Bei ambigen Artist-Namen wird keine offensichtlich falsche Disambiguation-Bio angezeigt.
- Alle Schemaänderungen laufen über Drizzle-Migrationen, inklusive lokaler Testmigration gegen einen Dump.

## Offene Entscheidungen

- Soll der manuelle Refresh nur im Dashboard verfügbar sein oder auch über eine interne Admin-API mit API-Key?
- Wollen wir Profile langfristig als redaktionell überschreibbare Daten behandeln?
- Soll eine abgelehnte Bio dauerhaft blockiert werden, bis ein Admin sie freigibt oder ersetzt?
- Sollen Profile pro Sprache gespeichert werden, sobald deutsch/englische Bio-Texte aus Wikidata oder anderen Quellen kommen?
- Soll der Track-Resolve sofort synchron laufen oder immer als Job mit Status-Tracking?
- Soll der Status auf Track-Ebene aggregiert werden oder separat pro Artist-Credit im Track sichtbar sein?
- Welche Quelle gewinnt bei Konflikten zwischen Wikidata, MusicBrainz und Service-spezifischen Artist-IDs?
