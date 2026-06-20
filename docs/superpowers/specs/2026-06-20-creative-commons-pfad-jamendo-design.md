# Creative-Commons-Pfad (Jamendo) — Design-Spec

Status: Entwurf zur Review · Datum: 2026-06-20

## Überblick

musiccloud bekommt einen zweiten, vollständig getrennten Resolve-Pfad für **Creative-Commons- und gemeinfreie Musik**, gespeist aus der **Jamendo-API**. Ein Umschalter im Hero wählt zwischen dem heutigen **kommerziellen** Pfad (Cross-Service-Spiegelung) und dem neuen **CC-Pfad**. Beide Pfade sind in UI, Resolve-Pipeline und Persistenz strikt voneinander getrennt.

## Motivation

- **Aufwertung:** CC-Werke darf man meist vollständig streamen und (je Lizenz) herunterladen — der CC-Pfad kann technisch *mehr* als der kommerzielle (voller Track statt 30-Sek-Preview, echte „Ähnliche Musik", Waveform, Lyrics, Künstler-Bio).
- **Abgrenzung zu Odesli:** Odesli spiegelt ausschließlich kommerzielle Links. Eine kuratierte, lizenz-transparente CC-Welt ist ein Alleinstellungsmerkmal.

## Markt-Differenzierung

Eine Recherche der CC-/Jamendo-Player-Landschaft zeigt: Das Bündel aus CC-Link-Resolve + Cross-CC-Discovery + Voll-Player + server-losen Token-Playlists existiert in keinem Produkt. Jede Säule existiert nur einzeln und verstreut:

- **Odesli/Songlink** — dieselbe Resolver-Mechanik, aber ausschließlich kommerzielle DSPs, NULL CC (Jamendo/FMA/Audius in keiner Plattform-Liste); löst CC nur via ISRC auf, falls dieselbe Aufnahme kommerziell vorliegt. Bestätigt die Lücke, statt sie zu füllen.
- **Openverse** — einziges Cross-CC-Aggregat (Jamendo + Freesound + Wikimedia), aber reine Reuse-Suche für Creator: kein Voll-Player, keine Playlists, kein Resolver.
- **Jamendo / FMA / ccMixter / CCTrax** — je ein Katalog-Silo mit Player, aber kein Cross-Resolve; Playlists account-gebunden oder fehlend.
- **crate** (GitHub, nächster Verwandter) — trifft CC-Link-Resolve + login-frei, aber Mobile-App statt Web, Multi-Source statt Jamendo-fokussiert, On-Device-SQLite statt server-loser Token-Playlists, keine Discovery, keine kanonische Web-Share-Landing-Page.
- **Server-lose Token-Playlists** — bei Musik-Playern faktisch ungenutzt; die wenigen Beispiele scheitern je an einem Kriterium (kein CC-Bezug, Server-State, oder eingestellt).

Die unbesetzte Nische ist die **Bündelung** dieser Säulen in einem Web-Produkt — plus ein Odesli-artiger Resolver speziell für den CC-Katalog mit kanonischer Share-Landing-Page.

## Nicht-Ziele (V1)

- Kein Cross-Linking zwischen CC- und kommerziellen Tracks (Jamendo liefert keine ISRC; eine Verknüpfung wäre fragil und würde die Trennung aufweichen).
- Kein URL-Paste im CC-Modus (es gibt keine sinnvoll einfügbaren Jamendo-URLs; eine kommerzielle URL hat kein CC-Äquivalent).
- Keine Migration des kommerziellen Altbestands (CC bekommt eigene Tabellen).
- Spätere Phasen (nicht V1): Lyrics-Ansicht, Trending-/Charts-Feeds, Autocomplete, Radios/Stationen, Download-Verwaltung.

## Architektur: zwei getrennte Pfade, ein Umschalter

Der Hero-Umschalter setzt einen Modus `commercial | cc`, der durch den Resolve-Aufruf läuft.

- **Kommerzieller Pfad:** unverändert.
- **CC-Pfad:** Eingaben gehen ausschließlich an einen neuen, schlanken Jamendo-Resolve (kein Cross-Service, keine ISRC-Logik).

**Modus-Persistenz:** Der gewählte Modus wird **dauerhaft** im `localStorage` gespeichert (`mc:resolveMode`), überlebt also Browser-Neustarts. Zusätzlich wird der Modus im Share-Link kodiert, damit ein geteiltes CC-Ergebnis wieder im CC-Modus aufgeht (eigener Routen-/Pfad-Marker für CC-Share-Seiten).

## Query-Formen im CC-Modus

Der CC-Modus unterstützt **alle** Query-Formen außer URL-Paste. Die bestehenden Query-Parser werden wiederverwendet (DRY); nur das Resolve-Backend ist anders.

| Form | Eingabe | Jamendo-Mapping |
|---|---|---|
| Freitext | `enjoy the silence` | `/tracks?search=<query>` |
| Structured Search | `title: …, artist: …, album: …` | `/tracks?name=<title>&artist_name=<artist>&album_name=<album>` (`count` → `limit`) |
| Genre-Discovery | `genre: jazz` | `/tracks?tags=<genre>` / `fuzzytags`, plus `/albums` und `/artists` für die drei Spalten |

`parseStructuredSearchQuery` (`apps/backend/src/services/structured-search/parser.ts`, `VALID_KEYS = title/artist/album/count`) wird unverändert genutzt; der CC-Adapter mappt die geparsten Felder auf Jamendos getrennte Suchfelder.

## CC-Ergebnis-UX

**Visuelle Leitlinie:** Die CC-Seiten teilen Ästhetik und Grundgerüst der kommerziellen Share-Seite (Glas-Karte, Cover, Player-Position, Künstler-Block) — wiedererkennbar als musiccloud, nicht „zwei Apps". Der zentrale **„Anhören auf"-Service-Grid-Block entfällt** im CC-Modus vollständig (nichts zu spiegeln) und wird durch die CC-spezifischen Blöcke ersetzt (voller Player + Waveform, Lizenz-Badge, Attribution/Download, „Ähnliche Musik"). Die CC-Seite erzählt damit *„höre & nutze dieses freie Werk"* statt *„finde diesen Song auf deinem Dienst"*.

- **Freitext / Structured Search** → Jamendo liefert eine **Trefferliste** (kein ISRC-Einzeltreffer). Auswahl eines Treffers → CC-Track-Seite.
- **Genre-Discovery** → drei Spalten (Tracks / Alben / Künstler), symmetrisch zum kommerziellen Genre-Discovery.
- **CC-Track-Seite:**
  - voller Player mit **Waveform-Scrubber** (Jamendos `waveform`-Peaks),
  - **Lizenz-Badge** (exakte CC-Lizenz aus `license_ccurl`),
  - **Attribution** (Künstler + Lizenz-Link), **Download**-Button wo `audiodownload_allowed`,
  - **„Ähnliche Musik"-Leiste** (`/tracks/similar`, nach `score` sortiert),
  - „Auf Jamendo öffnen" (`shareurl`).
- **CC-Künstler-Seite:** Jamendo-Bio (mehrsprachig, inkl. DE, aus `/artists/musicinfo`) + Tracks/Alben des Künstlers.
- **CC-Album-Seite:** Cover + Tracklist (`/albums/tracks`).

## Datenmodell

Eigene `cc_*`-Tabellen-Familie, analog zum bestehenden Muster (jede Entität hat ihre eigene Familie). **Kein** Discriminator auf den bestehenden Tabellen, **keine** Migration des Altbestands. Die Sidebar-Trennung im Dashboard zeigt damit ohne Filter-Logik direkt auf die jeweilige Familie.

- `cc_tracks`: `id` (musiccloud-intern), `jamendo_id`, `title`, `artist_name`, `cc_artist_id` (FK), `album_name`, `cc_album_id` (FK, nullable), `artwork_url`, `duration_ms`, `release_date`, `license_ccurl`, `stream_url`, `download_url` (nullable), `download_allowed`, `waveform` (peaks-JSON), `share_url`, `created_at`, `updated_at`.
- `cc_albums`: `id`, `jamendo_id`, `name`, `cc_artist_id`, `artwork_url`, `release_date`, `zip_url` (nullable), `share_url`, timestamps.
- `cc_artists`: `id`, `jamendo_id`, `name`, `image_url`, `website`, `bio` (lokalisiert, z. B. JSON `{en, de, …}`), `share_url`, timestamps.
- `cc_short_urls`: `id` (= Share-Code/Token, PK), `cc_track_id` (FK, **unique** → ein kanonischer Code je Track), `created_at` — spiegelt das kommerzielle `short_urls`-Muster (`apps/backend/src/db/schemas/postgres.ts:158`, `id` ist der Code). Anders als kommerziell wird der Code **eager bei der `cc_track`-Persistierung** erzeugt (nicht erst beim ersten Teilen), damit jeder CC-Track sofort einen stabilen Share-/Playlist-Token besitzt (vgl. „Spätere Phasen").

Keine `service_links`, keine `track_external_ids`/ISRC, keine Expiry-Previews (Jamendo-Streams sind permanent). Jamendo-IDs sind der externe Identifier.

## Backend

- **Neuer Jamendo-Adapter** (`apps/backend/src/services/plugins/jamendo/…` oder eigenes CC-Modul) — kapselt `client_id`, `/tracks`, `/tracks/similar`, `/albums`, `/artists`, `/artists/musicinfo`. Keine Cross-Service-Fähigkeiten.
- **Eigenes CC-Resolve-Modul**, getrennt von `resolver.ts` (SRP): nimmt die geparste Query (Freitext / structured / genre) + Modus `cc`, ruft Jamendo, mappt auf das `cc_*`-Modell, persistiert.
- **Auth/Limits:** Jamendo `client_id` als Query-Param (kein Secret), 35.000 Requests/Monat (non-commercial — für musiccloud unkritisch). `/tracks/similar`-Ergebnisse sind pro Seed deterministisch → cachebar, schont das Limit.
- **Medien-URLs:** `audio`/`audiodownload` sind direkt hotlinkbar (Kontext ist in der URL eingebacken); der Client spielt sie unverändert.

## Frontend

- **Hero-Umschalter:** Segmented Control `commercial | cc`. Farbliche Trennung — kommerziell = aktuelle blaue Identität, CC = **leuchtendes Grün**. Lizenz-Icon links im Eingabefeld: `CopyrightIcon` (©, Phosphor) bzw. das Creative-Commons-Logo als `/icons/creative-commons.svg` (Brand-Asset, analog zu den Service-Logos — Phosphor hat kein CC-Icon). Die Glas-Tokens/Day-Night-Töne werden am Code im Browser feinjustiert.
- **CC-Seiten:** neue Komponenten für Trefferliste, CC-Track-Seite (Player + Waveform + Lizenz + Attribution + Similar-Leiste), CC-Künstler- und CC-Album-Seite, CC-Genre-Discovery (3 Spalten).
- **Player:** voller Stream (`<audio src=stream_url>`) mit Waveform-Scrubber statt 30-Sek-Preview.

## Dashboard

Sidebar-Sektion „Musik" wird zweistufig:

```
Musik
├── Commercial        → tracks / albums / artists
│   ├── Tracks
│   ├── Alben
│   └── Künstler
└── Creative Commons  → cc_tracks / cc_albums / cc_artists
    ├── Tracks
    ├── Alben
    └── Künstler
```

Jeder Ast zeigt auf seine eigene Tabellen-Familie; keine `source`-Filter im Dashboard.

## Lizenz & Attribution

CC-„BY" verpflichtet zur Namensnennung — jede CC-Track-/Künstler-Seite zeigt Künstler + exakte Lizenz (`license_ccurl`) sichtbar an. Viele Jamendo-Tracks sind NC (nicht-kommerziell) und/oder SA (Share-Alike); die exakte Lizenz wird pro Track gespeichert und angezeigt, nicht pauschalisiert.

## Jamendo-API-Referenz

- `GET /v3.0/tracks` — `search`, `name`, `artist_name`, `album_name`, `tags`, `fuzzytags`, `ccsa/ccnd/ccnc`, `order`/`boost`, `imagesize`, `include=musicinfo+licenses+lyrics+stats`, `limit`/`offset`. Felder u. a. `audio` (voller Stream), `audiodownload`, `audiodownload_allowed`, `waveform`, `license_ccurl`, `shareurl`.
- `GET /v3.0/tracks/similar?id=<seed>` — echte „Ähnliche Musik" mit `score` (0–1).
- `GET /v3.0/albums`, `GET /v3.0/albums/tracks` — Alben + Tracklist + Cover + `zip`.
- `GET /v3.0/artists`, `GET /v3.0/artists/musicinfo` — Künstler + Foto + mehrsprachige Bio.
- Auth: freier `client_id` (Query-Param). Limit: 35k/Monat, non-commercial.

## Offene Punkte / spätere Phasen

- Jamendo-API-Felder und -Endpoints sind web-recherchiert (Jamendo API v3.0 Doku) — am Implementierungs-Plan-Time gegen die aktuelle Doku re-verifizieren.
- Genaue Routen-/URL-Form für CC-Share-Seiten (eigener Pfad-Prefix vs. Query-Marker) — im Implementierungs-Plan festlegen.
- Lokalisierungs-Form der Künstler-Bio (`{lang: html}` vs. eine Spalte je Sprache).
- Waveform-Rendering: Jamendos `waveform` ist ein escaped JSON-String `{"peaks":[…]}` — Parsing im Adapter.
- Spätere Features: Lyrics, Trending/Charts, Autocomplete, Radios.

## Spätere Phasen — token-basierte Sammlungen & Playlists (Vision)

Nicht Teil von V1; hier festgehalten, damit V1 die Zukunft nicht verbaut. Ziel: Favoriten, Playlists, Sync und Teilen **ohne Login und ohne personenbezogene Inhalts-Daten** (genaue Datenschutz-Einordnung unten) — nach dem bewährten Muster aus dem lmaa-Projekt (`apps/frontend/src/lib/liked-shops.ts`: `localStorage` + URL-Encoding). Die Account-Phase entfällt damit komplett.

**Token-Modell:**
- **Track-Token:** jeder `cc_track` bekommt **eager bei der Persistierung** einen stabilen Token (deckt `cc_short_urls` ab) → sofort playlist-fähig.
- **Playlist-Token:** clientseitig erzeugt, **ändert sich niemals** — Identitäts-Anker für Sync, Re-Share und Diff (verschwundene/neue Tracks).
- **Write-Secret:** separates Geheimnis, das **nur das Ersteller-Gerät** hält (`localStorage`). Read-Token = teilbar, Write = nur mit Secret.

**Zwei Transfer-Wege, strikt getrennt:**
- **Sync (eigene Geräte):** überträgt Read-Token **+ Write-Secret** (das neue Gerät ist Voll-Besitzer). Bevorzugt per QR (Gerät-zu-Gerät). UI mit Sicherheitshinweis.
- **Share (andere):** überträgt **nur** den Read-Token. Empfänger liest; bei eigenen Änderungen entsteht ein **Fork** (neue eigene Playlist mit neuem Token), die Original bleibt unberührt.

**Speicher-Varianten (nicht exklusiv):**
- *Rein clientseitig:* Liste komplett in `localStorage`; QR/URL trägt Token + geordnete Track-Tokens. Maximal datensparsam (server-los), QR-Kapazität limitiert.
- *Server-Ablage:* Playlist (Token → Liste) serverseitig; QR/URL trägt **nur** den Playlist-Token, der Rest wird gepullt. Winziger QR, keine Größengrenze, automatische Updates. Trade-off: ein Server-Record (Token → Token-Liste), aber **ohne Personenbezug** — kein Account, keine Nutzer-ID, keine PII, „unlisted-Link"-Capability.

**Datenschutz (präzise):** Die gespeicherten Daten (Playlist-Token → Track-Tokens) sind **nicht personenbezogen** — kein Account, keine Nutzer-Zuordnung, niemand daraus identifizierbar. Das ist **nicht** dasselbe wie „außerhalb der DSGVO": Schon das Ausliefern verarbeitet zwangsläufig die **IP-Adresse** des Anfragenden, die nach EuGH-Rechtsprechung (Breyer, C-582/14) für den Betreiber ein personenbezogenes Datum ist — das gilt für jede Website, auch die rein-clientseitige Variante. Präzise Aussage: **keine personenbezogenen Inhalts-Daten, dadurch trivial DSGVO-konform zu betreiben**, sofern (a) die IP **nicht persistiert** wird (sonst entsteht über IP + Token + Zeit doch ein schwacher Bezug), (b) eine schlanke Datenschutzerklärung besteht, (c) Rechtsgrundlage (Art. 6, berechtigtes Interesse) und Hosting-AVV vorhanden sind. Kein Rechtsrat.

**Sicherheits-Härtungen:**
- Write-Secret nur im **URL-Fragment (`#…`)**, nie im Query — der Server sieht es nur beim expliziten Schreib-Request, nicht in Logs.
- Sync per QR statt kopierbarem Link (kein Leak über History/Messenger/Clipboard).
- Strikte UI-Trennung Sync ↔ Share; Sicherheitshinweis beim Sync.
- Restrisiko bewusst: Capability-/Bearer-Modell („wer das Secret hält, darf schreiben"), kein Account-System — angemessen für unkritische, nicht-kommerzielle Daten.

**Offener Punkt:** kompaktes Encoding der Track-Liste (stabile ShortCode-Tokens vs. numerische Jamendo-IDs + Delta/Base36 à la lmaa) — beeinflusst die QR-Kapazität der rein-clientseitigen Variante.

**Roadmap:** V1 (Resolve-Pfad) → token-basierte Sammlungen/Favoriten → Playlists (erstellen, Sync, Share/Fork). Ein sauberer Player auf dieser API ist zugleich die Grundlage für eine spätere native App (vgl. zurückgestellte Tauri-Überlegung).
