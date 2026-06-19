# Plan: Hard Removal der Custom Website Analytics und GeoDB-Abbau

Plan-Nr.: MC-026

Status: Complete  
Created: 2026-06-06  
Owner: Codex  
Primary goal: Die eigene Website-Analytics-Implementierung wird vollstaendig und rueckstandslos entfernt. Umami-Signale werden nur dokumentiert und spaeter separat nachgezogen. Es gibt keine Legacy-Calls, keine Kompatibilitaets-Wrapper, keine No-op-Fassade und keine Parallelphase.

## Ausgangslage

Aktuell existieren zwei Analytics-Pfade nebeneinander:

1. Umami laeuft bereits ueber das Frontend-Layout.
   - `apps/frontend/src/layouts/BaseLayout.astro:57` laedt `/api/mc/script.js`.
   - `apps/frontend/src/pages/api/mc/script.js.ts:5-13` proxyt hart auf `https://umami.layered.work`.
   - `apps/frontend/src/pages/api/mc/api/send.ts:5-20` proxyt Umami-Events ebenfalls hart auf `https://umami.layered.work`.
2. Die eigene Website Analytics erfasst Produktinteraktionen, Suchbegriffe, Sessions, Geo-Daten, Retention, Export und Realtime-Karten.
   - Frontend-Client: `apps/frontend/src/lib/analytics.ts`.
   - Frontend-BFF: `apps/frontend/src/pages/api/analytics/website-events.ts`.
   - Backend-Route: `apps/backend/src/routes/website-analytics.ts`.
   - Backend-Service: `apps/backend/src/services/website-analytics.ts`.
   - Postgres-Adapter und Repository-API: `apps/backend/src/db/adapters/postgres-analytics.ts`, `apps/backend/src/db/repository.ts`.
   - Schema-Tabellen: `analytics_sessions`, `analytics_events`, `analytics_cluster_daily_summaries` in `apps/backend/src/db/schemas/postgres.ts:1187-1356`.
   - Dashboard-Seiten: `/website-analytics`, `/website-analytics/realtime`.
   - Zerops GeoDB Mount/Env: `zerops.yml:33-39`.

Der Nutzer hat explizit priorisiert:

- Umami darf fuer eine laengere Zeit komplett ausfallen.
- Datenluecken sind akzeptabel.
- Wichtig ist die komplette Entfernung der Custom Analytics.
- Es duerfen keine Legacy Calls, keine Kompatibilitaets-Wrapper und keine leeren Track-Funktionen bleiben.

## Zielbild

Nach Umsetzung der Removal-Phasen gilt:

- Im Frontend existiert kein eigener Analytics-Client mehr.
- Es gibt keine `track...`-Funktionen fuer die alte Website Analytics.
- Es gibt keine `data-analytics-*` Attribute fuer den alten Click-Collector.
- Es gibt keinen eigenen Batch-Collector, keine Queue, keine Flush-Logik und keinen eigenen `/api/analytics/website-events` Pfad.
- Im Backend existieren keine eigenen Website-Analytics-Routen, Services, Repository-Methoden, Tests, GeoIP-Status- oder Export-Endpunkte.
- Das Dashboard enthaelt keine eigenen Website-Analytics-Seiten, keine Realtime-Geo-Karte und keine DB-IP Update-Steuerung.
- Zerops enthaelt keine `geodb`-Mount-/Env-Konfiguration mehr.
- Umami bleibt nur als generische Basisintegration erhalten, soweit sie bereits im Layout eingebunden ist.
- Umami Custom Events werden erst in einem separaten Folgeplan implementiert, nachdem die alte Implementierung weg ist.

Nicht Ziel dieses Plans:

- Kein gleiches internes Dashboard in Umami nachbauen.
- Keine Zwischenfassade, die alte Track-Funktionen intern auf Umami routet.
- Keine No-op-Implementierung alter Track-Funktionen.
- Keine manuelle Datenbankmigration.
- Kein manuelles Editieren bestehender Migrationen oder Migrationstabellen.

## Notierte Future Signals fuer Umami

Diese Signale werden nur fuer die spaetere Umami-Anbindung festgehalten. Sie werden im Hard-Removal-Schritt nicht implementiert.

| Bisherige eigene Kategorie | Spaeteres Umami Signal | Properties | Datenschutz |
| --- | --- | --- | --- |
| Erfolgreiche Suchen nach Musikquelle | `music_source_search_success` | `source`, `result_count`, optional `query_class` | Keine rohen Suchbegriffe noetig |
| Suchbegriffe | `music_search_submitted` | `query_class`, `query_length_bucket`, optional `source` | Rohbegriffe nur falls bewusst freigegeben, sonst klassifizieren/bucketisieren |
| Interaktionen | `music_interaction` | `interaction_type`, `surface`, optional `service` | Keine PII |
| Service Link Clicks | `music_service_link_click` | `service`, `surface` | Keine PII |
| Preview Controls | `music_preview_interaction` | `action`, `surface` | Keine PII |
| Share Actions | `music_share_interaction` | `action`, `channel` | Keine PII |

Die spaetere Umsetzung sollte direkt `window.umami.track(...)` an den relevanten UI-Stellen verwenden oder einen sehr kleinen neuen Umami-spezifischen Helper einfuehren. Dieser Helper darf keine alten Namen, alten Typen oder alte API-Kompatibilitaet tragen.

## Verifizierte Code-Stellen

### Frontend

- `apps/frontend/src/lib/analytics.ts`
  - Alter Event-Katalog: `WebsiteAnalyticsEventName`.
  - Alte `window.umami.track` Deklaration.
  - Eigene Queue, `sendWebsiteAnalyticsBatch`, Retry/Flush, Session/User-ID.
  - Legacy-Umami-Events `track-resolve` und `service-link-click`.
- `apps/frontend/src/layouts/BaseLayout.astro`
  - Umami Script an `:57`.
  - Alter `initWebsiteAnalytics` Import/Call an `:58-64`.
- `apps/frontend/src/pages/api/analytics/website-events.ts`
  - Eigener Astro BFF fuer Batch-Events.
- `apps/frontend/src/api/client.ts`
  - `sendWebsiteAnalyticsBatch`.
  - `isTrackingEnabled`.
- Call-sites mit alten Track-Funktionen:
  - `apps/frontend/src/hooks/useAppState.ts`
  - `apps/frontend/src/components/share/ShareLayout.tsx`
  - `apps/frontend/src/components/platform/PlatformButton.tsx`
  - `apps/frontend/src/components/audio/AudioPreviewPlayer.tsx`
  - `apps/frontend/src/components/landing/LandingPage.tsx`
  - `apps/frontend/src/components/artist/PopularTracksSection.tsx`
  - `apps/frontend/src/components/artist/SimilarArtistsSection.tsx`
  - `apps/frontend/src/components/artist/UpcomingEventsSection.tsx`
  - `apps/frontend/src/components/layout/AppFooter.tsx`
  - `apps/frontend/src/components/layout/PageHeader.tsx`
  - `apps/frontend/src/components/layout/PageOverlayContent.tsx`
  - `apps/frontend/src/components/share/SharePageShell.tsx`
  - `apps/frontend/src/pages/[shortId].astro`

### Backend

- `apps/backend/src/routes/website-analytics.ts`
  - `POST /api/v1/analytics/website-events`.
- `apps/backend/src/services/website-analytics.ts`
  - HMAC/IP Hashing, Bot-Erkennung, GeoIP Lookup, Realtime Broadcast.
- `apps/backend/src/server.ts`
  - Registrierung der Website-Analytics-Routes.
  - Rate-Limit-Ausnahme fuer Website-Analytics-Realtime Admin-Pfad.
- `apps/backend/src/services/admin-umami.ts`
  - Derzeit hart auf alte Umami Eventnamen `track-resolve` und `service-link-click` zugeschnitten.
- `apps/backend/src/routes/admin-analytics.ts`
  - Umami-Admin-Endpunkte.
  - Eigene Website-Analytics-Endpunkte inklusive Geo, Retention, Export, GeoIP Status und Update.
- `apps/backend/src/db/schemas/postgres.ts`
  - `analyticsSessions`, `analyticsEvents`, `analyticsClusterDailySummaries`.
- `apps/backend/src/db/adapters/postgres-analytics.ts`
  - Eigene Query- und Write-Implementierung fuer Website Analytics.
- `apps/backend/src/db/repository.ts`
  - Repository-Interface, Types und Methoden fuer Website Analytics.
- `apps/backend/src/__tests__/website-analytics.test.ts`
  - Tests fuer alte eigene Implementierung.

### Dashboard

- `apps/dashboard/src/routes.tsx`
  - Lazy Routes und Pfade `/website-analytics`, `/website-analytics/realtime`.
- `apps/dashboard/src/components/layout/Sidebar.tsx`
  - Navigationseintraege fuer alte Analytics.
- `apps/dashboard/src/features/analytics/WebsiteAnalyticsPage.tsx`
  - Eigene Analytics-Uebersicht.
- `apps/dashboard/src/features/analytics/WebsiteAnalyticsSection.tsx`
  - Eigene KPIs, Top Searches, Interactions.
- `apps/dashboard/src/features/analytics/WebsiteAnalyticsRealtimePage.tsx`
  - Realtime-Karte, GeoIP Status, DB-IP Update UI, D3/TopoJSON.
- `apps/dashboard/src/features/analytics/hooks/useUmamiStats.ts`
  - Umami-Hooks und alte musiccloud-spezifische Eventnamen.
- `packages/shared/src/endpoints.ts`
  - Public und Admin Endpoints fuer alte Website Analytics.

### Zerops und Dependencies

- `zerops.yml`
  - `DBIP_DB_DIR: /mnt/geodb`
  - `DBIP_UPDATE_ON_START`
  - `DBIP_REQUIRE_READY`
  - `DBIP_MAX_AGE_DAYS`
- `apps/backend/package.json`
  - Geo/Kompressions-Dependencies fuer alte GeoDB-Flows pruefen und entfernen, wenn danach unbenutzt.
- `apps/dashboard/package.json`
  - `d3-geo`, `topojson-client` und Kartendaten nur behalten, falls ausserhalb der Realtime-Analytics-Karte weiter genutzt.

## Umsetzungsphasen

### Phase 1: Removal-Inventar finalisieren

- Vollstaendige Suche nach alten Analytics-Begriffen:
  - `WebsiteAnalytics`
  - `websiteAnalytics`
  - `website-events`
  - `analytics_events`
  - `analytics_sessions`
  - `analytics_cluster_daily_summaries`
  - `initWebsiteAnalytics`
  - `trackSearchSubmitted`
  - `trackResolve`
  - `trackServiceLinkClick`
  - `data-analytics`
  - `DBIP`
  - `geodb`
  - `GeoIp`
- Treffer in Produktcode, Tests, Config, Docs und Plan-Artefakten trennen.
- Die spaeteren Umami Signals aus diesem Plan als Dokumentationsbasis beibehalten.

### Phase 2: Frontend Custom Analytics hart entfernen

- `apps/frontend/src/lib/analytics.ts` loeschen.
- In allen Frontend-Callsites alte Analytics-Imports und Calls entfernen.
- `data-analytics-*` Attribute entfernen, sofern sie nur vom alten Click-Collector benutzt wurden.
- `initWebsiteAnalytics` Import und Aufruf aus `BaseLayout.astro` entfernen.
- `apps/frontend/src/pages/api/analytics/website-events.ts` loeschen.
- `sendWebsiteAnalyticsBatch` und `isTrackingEnabled` aus `apps/frontend/src/api/client.ts` entfernen, sofern danach unbenutzt.
- Frontend-Routen/Types/Exports bereinigen.
- Keine Ersatzfunktionen mit alten Namen anlegen.

### Phase 3: Backend Custom Analytics hart entfernen

- `apps/backend/src/routes/website-analytics.ts` loeschen.
- `apps/backend/src/services/website-analytics.ts` loeschen.
- Registrierung in `apps/backend/src/server.ts` entfernen.
- Realtime-Rate-Limit-Ausnahme fuer alte Website Analytics entfernen.
- Eigene Website-Analytics-Endpunkte aus `apps/backend/src/routes/admin-analytics.ts` entfernen.
- Alte Website-Analytics-spezifische Methoden und Types aus `apps/backend/src/db/repository.ts` entfernen.
- Alte Website-Analytics-spezifische Implementierung aus `apps/backend/src/db/adapters/postgres-analytics.ts` entfernen oder Datei danach entsprechend umbenennen/auf verbleibende Admin-Umami-Funktion reduzieren.
- Alte Tests in `apps/backend/src/__tests__/website-analytics.test.ts` loeschen.
- Alte Shared Endpoints in `packages/shared/src/endpoints.ts` entfernen.
- Pruefen, ob GeoIP-Servicecode danach vollstaendig unbenutzt ist und ebenfalls entfernen.
- Keine Kompatibilitaetsrouten fuer alte Public- oder Admin-Endpunkte belassen.

### Phase 4: Dashboard Custom Analytics hart entfernen

- `/website-analytics` und `/website-analytics/realtime` aus `apps/dashboard/src/routes.tsx` entfernen.
- Sidebar-Eintraege fuer die alten Seiten entfernen.
- Alte Dashboard-Seiten und Komponenten loeschen:
  - `WebsiteAnalyticsPage.tsx`
  - `WebsiteAnalyticsSection.tsx`
  - `WebsiteAnalyticsRealtimePage.tsx`
- Alte Hooks/Types in `useUmamiStats.ts` entfernen oder auf generische Umami-Statistik reduzieren.
- Realtime-Karten-Abhaengigkeiten und Kartendaten entfernen, wenn danach unbenutzt.
- Texte, Labels und Navigation bereinigen, die auf die alte Website Analytics zeigen.

### Phase 5: Zerops und Package Cleanup

- `DBIP_*` Env-Konfiguration aus `zerops.yml` entfernen.
- `/mnt/geodb` Bezug aus Zerops-Dokumentation entfernen oder als retired markieren.
- Backend-Dependencies entfernen, die nur fuer GeoDB/alte Analytics gebraucht wurden.
- Dashboard-Dependencies entfernen, die nur fuer die Realtime-Analytics-Karte gebraucht wurden.
- Lockfiles mit dem Projekt-Paketmanager aktualisieren.

### Phase 6: Datenbankschema sauber entfernen

Diese Phase ist Teil des vollstaendigen Removals, braucht aber eine explizite Freigabe, weil sie destruktiv fuer bestehende Analytics-Daten ist und laut Projektregel nur ueber Drizzle erfolgen darf.

- Nach Entfernung aller Writes/Reads Schema-Felder fuer alte Analytics aus `apps/backend/src/db/schemas/postgres.ts` entfernen.
- Drizzle-Migration mit dem im Projekt konfigurierten Tool generieren.
- Migration nicht manuell editieren.
- Bei Snapshot-Drift, Prompts oder Schema-Konflikten sofort stoppen und Befund melden.
- Tabellen entfernen:
  - `analytics_events`
  - `analytics_sessions`
  - `analytics_cluster_daily_summaries`
- Danach Repository- und Adapterreste erneut suchen und entfernen.

### Phase 7: Spaetere Umami Custom Signals

Diese Phase ist bewusst nachgelagert und nicht Voraussetzung fuer den Hard Removal.

- Direktes Umami-Tracking oder einen neuen, kleinen Umami-only Helper einfuehren.
- Keine alten Funktionsnamen wiederverwenden.
- Keine alte Event-Typstruktur importieren oder emulieren.
- Umami Eventnamen aus "Notierte Future Signals fuer Umami" verwenden.
- Dashboard-Auswertung nur ueber Umami API oder Umami UI loesen.

## Akzeptanzkriterien

- `rg "initWebsiteAnalytics|sendWebsiteAnalyticsBatch|WebsiteAnalytics|websiteAnalytics|website-events|trackSearchSubmitted|trackResolve|trackServiceLinkClick|data-analytics"` findet keine Treffer in Produktcode.
- `rg "analytics_events|analytics_sessions|analytics_cluster_daily_summaries"` findet nach Phase 6 keine Treffer in Produktcode oder Schema.
- `rg "DBIP|geodb|GeoIp|GeoIP"` findet keine aktiven Zerops-, Backend- oder Dashboard-Treffer fuer die alte Website Analytics.
- Es gibt keine alten Public-Endpunkte fuer Custom Analytics.
- Es gibt keine alten Admin-Endpunkte fuer Custom Analytics.
- Es gibt keine No-op-Wrapper oder Kompatibilitaetsfunktionen mit alten Track-Namen.
- Das Frontend baut ohne `apps/frontend/src/lib/analytics.ts`.
- Backend-Tests/Typecheck laufen ohne Website-Analytics-Service.
- Dashboard baut ohne Website-Analytics-Seiten und ohne Realtime-Geo-Karte.
- Zerops-Konfiguration referenziert keinen GeoDB Mount und keine DB-IP Env mehr.
- Drizzle-Migration fuer Tabellenentfernung ist mit dem Projekttool erzeugt und nicht manuell geschrieben.

## Risiken und Entscheidungen

- Die Entfernung betrifft Frontend, Backend, Dashboard, Shared Package, Tests, Config, Dependencies und DB-Schema. Die Build-Kette muss nach jeder groesseren Phase gegen geprueft werden.
- Die spaetere Umami-Auswertung verliert ohne sofortige Custom Signals zunaechst produktnahe Details. Das ist akzeptiert.
- Roh-Suchbegriffe sollten spaeter nicht automatisch in Umami landen. Wenn Suchbegriffe benoetigt werden, braucht das eine bewusste Datenschutzentscheidung.
- Die Datenbank-Tabellenentfernung ist destruktiv. Sie gehoert in den Plan, darf aber erst nach expliziter Freigabe und nur via Drizzle ausgefuehrt werden.

## Umsetzungscheckliste

- [x] Phase 1: Removal-Inventar finalisieren und Trefferliste pruefen.
- [x] Phase 2: Frontend Custom Analytics loeschen.
- [x] Phase 3: Backend Custom Analytics loeschen.
- [x] Phase 4: Dashboard Custom Analytics loeschen.
- [x] Phase 5: Zerops und Package Cleanup durchfuehren.
- [x] Phase 6: DB-Schema via Drizzle nach expliziter Freigabe entfernen.
- [x] Phase 7: Umami Custom Signals nach MC-027 ausgelagert.
- [x] Gates ausfuehren und Ergebnisse dokumentieren.

## Abschlussnotiz 2026-06-06

- Custom Website Analytics wurde aus Frontend, Backend, Dashboard, Shared Endpoints, Zerops-Konfiguration, Packages und Dokumentation entfernt.
- Der verbleibende Apple-App-Telemetry-Adapter wurde von `postgres-analytics.ts` auf `postgres-telemetry.ts` umbenannt, damit kein alter Analytics-Dateiname als Leftover bleibt.
- Die alten Public- und Admin-Routes zur eigenen Analytics-Implementierung wurden entfernt, inklusive Dashboard-Nginx-Proxy-Leftovers.
- GeoDB/DB-IP-Servicecode, Env-Konfiguration, Kartendaten und Dashboard-Map-Dependencies wurden entfernt.
- Drizzle-Migration `apps/backend/src/db/migrations/postgres/0042_worthless_sue_storm.sql` wurde mit `pnpm db:generate` erzeugt und lokal mit `pnpm db:migrate` angewendet.
- Finale Residual-Suchen in aktiven Source-/Config-/Doc-Pfaden sind leer fuer alte Website-Analytics-, GeoDB-, Route-, Event- und Dependency-Begriffe. Historische Migrationen bleiben unveraendert.
- Gates:
  - `pnpm lint`
  - `pnpm --filter @musiccloud/shared build`
  - `pnpm --filter @musiccloud/backend typecheck`
  - `pnpm --filter @musiccloud/dashboard typecheck`
  - `pnpm --filter @musiccloud/frontend build`
  - `pnpm --filter @musiccloud/backend build`
  - `pnpm --filter @musiccloud/dashboard build`
  - `env -u DATABASE_URL pnpm --filter @musiccloud/backend test:run`
  - `pnpm --filter @musiccloud/frontend test:run`
  - `pnpm --filter @musiccloud/dashboard test:run`
  - `pnpm --filter @musiccloud/shared test:run`
- Backend-Tests wurden bewusst ohne `DATABASE_URL` ausgefuehrt, damit Live-Postgres-Integrationstests keine lokalen Daten veraendern.
- Folgearbeit fuer Umami Custom Signals ist in MC-027 ausgelagert, damit MC-026 nur den freigegebenen Hard-Removal-Scope misst.
