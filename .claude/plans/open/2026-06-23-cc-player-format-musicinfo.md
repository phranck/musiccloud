# CC-Player: Format-Selector, Download-Dropdown & musicinfo/stats-Karte

## Preface

Erweiterung des CC-Modus um drei zusammenhängende Bausteine, abgeleitet aus den
Jamendo-`include`-Daten und den Audio-Format-Optionen. Quelle der Architektur:
Research-Workflow `wf_27ad76b0-500` (Player-Struktur, Format-Proxy, Daten-Flow)
plus echter Jamendo-API-Call (exakte `musicinfo`/`stats`/`licenses`-Felder).

Dieser Plan ist als **selbst-ausführbares Goal** geschrieben: alle Produkt-
Entscheidungen sind gepinnt, die neuen Typen ausgeschrieben, die Einbaupunkte
benannt. Eine frische Session soll ihn ohne Rückfrage abarbeiten können.

## Goal

1. **Daten:** CC-Track-Resolve zieht zusätzlich `include=musicinfo+stats+licenses`
   und reicht die Felder bis in die Frontend-Config durch.
2. **Details-Karte:** neue eigene Karte zeigt Klassifikation (Genres, Instrumente,
   Mood, Vocal/Instrumental, Tempo, Sprache, Gesangs-Gender) und Stats (Listens,
   Downloads, Favoriten, Ø-Note) strukturiert.
3. **Player-Format-Selector:** unter dem Analyzer-Display ein neues, schmales
   `RadioButtonControl` mit gleich breiten Buttons, je ein Mini-VFD mit Format-
   Kürzel (gedimmt = aus, voll hell = aktiv). Auswahl lädt die `<audio>`-Quelle im
   gewählten Format neu. **Nur CC-Modus.**
4. **Download-Dropdown:** quadratischer `EmbossedButton` (Download-Icon) rechts
   neben dem bestehenden Download-Button; Klick öffnet ein Format-Menü.
5. **Bandcamp-Support-Button:** Prüfung, ob der Track auch auf Bandcamp ist; falls ja
   ein Button „Buy on Bandcamp" **über** dem Download-Button, der in neuem Fenster zur
   passenden Bandcamp-Track-Seite führt.

## Entscheidungen (alle vom User bestätigt — nicht erneut fragen)

- **Format-Set:** `mp31` (MP3 96k), `mp32` (MP3 256k), `ogg`, `flac`.
- **Default-Streaming-Format:** `mp32` (256k). Proxy ohne `format`-Param liefert mp32;
  Frontend lädt initial mit `?format=mp32`.
- **FLAC/OGG-Streaming:** per `HTMLMediaElement.canPlayType` (`audio/flac`,
  `audio/ogg`). Nur abspielbare Formate erscheinen als Streaming-Button (MP3 immer).
  **Download bietet immer alle vier** (Download spielt nichts ab).
- **Details-Karte Platzierung:** neue Karte **in der LINKEN Spalte, ZWISCHEN der
  Player-/Cover-Karte (`MediaSummaryCard`) und der CC-Lizenz-Karte (`CcInfoCard`,
  Titel „CREATIVE COMMONS")**. Resultierende Reihenfolge: MediaSummaryCard →
  Details-Karte → CcInfoCard. Gilt für `DesktopShareLayout` (left-`<div>`) UND
  `MobileShareLayout`. NICHT die rechte Artist-Spalte.
- **licenses-Anzeige:** Nur **Pro-Hinweis**. Wenn `prolicensing === "true"`: dezente
  Zeile unter dem Lizenz-Badge in der `CcInfoCard` „Auch über Jamendo Pro
  lizenzierbar" mit Link auf `prourl`. CC-Klausel-Flags (NC/ND/SA) werden NICHT
  separat angezeigt — das Badge deckt das ab.
- **Lyrics:** vorerst weglassen (nicht fetchen, nicht durchreichen).
- **Bandcamp-Erkennung:** über die bestehende Bandcamp-Such-Adapter-Logik
  (`bandcampAdapter.searchTrack`, Confidence ≥ 0.6 — schützt vor Remix-/Fremdartist-
  Treffern). **Async nach Render + gecacht** (Scrape dauert Sekunden, darf den Resolve
  nicht bremsen). Kein Artist-Website-Signal (0/94 CC-Artists haben eine). Button-Label
  „Buy on Bandcamp" (vom User final festgelegt).
- **C/CC-Divergenz:** KEIN Player-Fork. Selector als optionaler Prop am geteilten
  Player; rendert nur wenn befüllt (CC). Commercial unverändert.

## Format-Modell (shared)

Neues Modul `packages/shared/src/audio-format.ts`, re-exportiert über `index.ts`:

```ts
export const JamendoAudioFormat = {
  Mp3Low: "mp31",   // MP3 96 kbps CBR
  Mp3High: "mp32",  // MP3 ~256 kbps VBR
  Ogg: "ogg",
  Flac: "flac",
} as const;
export type JamendoAudioFormat = (typeof JamendoAudioFormat)[keyof typeof JamendoAudioFormat];

// Plain Record (kein as-const-Namespace → kein domain-literals-prefer-pascal-Flag),
// analog zu PLATFORM_CONFIG.
export const JAMENDO_FORMAT_META: Record<JamendoAudioFormat, {
  label: string;   // Mini-VFD-Label
  mime: string;    // Content-Type (Proxy) + canPlayType
  lossless: boolean;
}> = {
  mp31: { label: "96k", mime: "audio/mpeg", lossless: false },
  mp32: { label: "256k", mime: "audio/mpeg", lossless: false },
  ogg: { label: "OGG", mime: "audio/ogg", lossless: false },
  flac: { label: "FLAC", mime: "audio/flac", lossless: true },
};
export const JAMENDO_FORMAT_ORDER: readonly JamendoAudioFormat[] = ["mp31", "mp32", "ogg", "flac"];
export const DEFAULT_STREAM_FORMAT: JamendoAudioFormat = "mp32";
```

- **localStorage-Key** für die Format-Präferenz: `mc.ccAudioFormat`.

## Design — Format-URL-Bau

- **Streaming-URL:** Jamendos `audio` = `https://prod-N.storage.jamendo.com/?trackid=X&format=mp31`.
  Wechsel = `format`-Query-Param swappen (URL-API). Kein Extra-Jamendo-Call.
- **Download-URL:** Jamendos `audiodownload` = `…/download/track/<id>/<format>/`.
  Wechsel = letztes Pfad-Segment swappen. **Vor Bau gegen echte URL verifizieren**
  (Token am Format?); falls doch → Fallback per-Format-API-Request (`audiodlformat`).
- **Proxy:** `cc-audio.ts` bekommt optionalen `?format=` (validiert gegen
  `JamendoAudioFormat`; ungültig/fehlend → `DEFAULT_STREAM_FORMAT`),
  `resolveStreamUrl(jamendoId, format)` swappt den Query-Param, Content-Type aus
  `JAMENDO_FORMAT_META[format].mime`. Cache-Key inkl. Format.

## Exakte neue Typen (Slice 1)

**`JamendoTrackRaw` (types.ts:25) — bestehende schmale `musicinfo` AUFWEITEN:**
> Aktuell: `musicinfo?: { tags?: { genres?: string[] } }` (types.ts:43). `getSimilarCcTracks`
> liest nur `tags.genres` → bleibt kompatibel.

```ts
musicinfo?: {
  vocalinstrumental?: string;
  gender?: string;
  speed?: string;
  acousticelectric?: string;
  lang?: string;
  tags?: { genres?: string[]; instruments?: string[]; vartags?: string[] };
};
stats?: {
  rate_listened_total?: number;
  rate_downloads_total?: number;
  playlisted?: number;
  favorited?: number;
  likes?: number;
  dislikes?: number;
  avgnote?: number;
  notes?: number;
};
licenses?: { cc?: string; ccnc?: string; ccnd?: string; ccsa?: string; prolicensing?: string; probackground?: string };
prourl?: string;
```

**Domain `CcTrack` (types.ts:96) = Wire `ApiCcTrack` (api.ts:201) = App `CcTrackResult` (app.ts:168) — identische camelCase-Shape, alle optional:**

```ts
export interface CcMusicInfo {
  genres: string[];
  instruments: string[];
  vartags: string[];          // Mood/Theme-Tags (UI-Label "Mood")
  vocalInstrumental?: string; // "vocal" | "instrumental"
  gender?: string;            // "male" | "female" (Gesang)
  speed?: string;             // verylow…veryhigh
  acousticElectric?: string;  // "acoustic" | "electric"
  lang?: string;
}
export interface CcTrackStats {
  listens: number;    // rate_listened_total
  downloads: number;  // rate_downloads_total
  playlisted: number;
  favorited: number;
  likes: number;
  dislikes: number;
  avgNote: number;    // avgnote
  notes: number;
}
// auf CcTrack / ApiCcTrack / CcTrackResult ergänzen:
musicInfo?: CcMusicInfo;
stats?: CcTrackStats;
proLicensing?: boolean;  // licenses.prolicensing === "true"
proUrl?: string;         // raw.prourl
```

`CcMusicInfo`/`CcTrackStats` in shared definieren (neben `ApiCcTrack`), Backend-Domain
re-exportiert/spiegelt sie. `mapJamendoTrack` (client.ts:124) extrahiert: leere
musicinfo (keine tags + keine Klassifikation) → `musicInfo` weglassen; `stats` nur wenn
vorhanden; `proLicensing = raw.licenses?.prolicensing === "true"`; `proUrl = raw.prourl || undefined`.

**Config `CcTrackContentConfiguration` (media-card.ts:127):** `musicInfo?`, `stats?`,
`proLicensing?: boolean`, `proUrl?: string` ergänzen; `buildCcShareConfig` (parsers.ts:531)
reicht sie durch (Stats roh als Zahlen — Formatierung macht die Karte).

## Slices

### Slice 1 — Daten-Layer (additiv, kein UI)
- `getCcTrack` (client.ts:174): `include: "musicinfo+stats+licenses"`.
- Typen wie oben durch alle 6 Schichten: JamendoTrackRaw → CcTrack → mapJamendoTrack →
  ApiCcTrack → toApiCcTrack (cc-share-response.ts:25) → CcTrackResult →
  parseCcResolveResponse (parsers.ts:166) → CcTrackContentConfiguration → buildCcShareConfig.
- Gate: backend `tsc`, `pnpm --filter @musiccloud/frontend check`, `pnpm run doctor`.

### Slice 2 — Details-Karte + Pro-Hinweis
- Shared `formatCount` extrahieren: neue Datei `apps/frontend/src/lib/format/count.ts`
  (aus ArtistProfileSection.tsx:96 verschieben), beide Konsumenten umstellen.
- Neue Komponente `CcTrackDetailsCard` (`components/cards/`): `SectionCardShell` +
  RecessedCard-Zeilen. Rendert nur wenn `musicInfo` ODER `stats` da. Zeilen mit leerem
  Wert ausblenden. Klassifikation: Genres/Instrumente/Mood (Tag-Listen, rohe EN-Werte),
  Vocal/Instrumental, Gesang (gender), Tempo (speed), Sprache (lang), acoustic/electric.
  Stats: Listens/Downloads/Favoriten/Playlisted (via `formatCount`), Ø-Note (`avgNote`
  + `notes`).
- Einbau **vor der CcInfoCard** (zwischen MediaSummaryCard und CcInfoCard) in
  `DesktopShareLayout` (left-`<div>`) UND `MobileShareLayout` (direkt vor dem
  `config.ccInfoContent`-CcInfoCard-Block, :44-46).
- Pro-Hinweis in `CcInfoCard`: wenn `proLicensing && proUrl` eine Zeile unter dem Badge,
  Link (mc-cardlink, target/rel) auf `proUrl`, Text `t("cc.proLicensing")`.
- i18n-Keys ergänzen (DE/EN, an bestehende `cc.*` anlehnen): `cc.details.title`,
  `cc.details.genres`, `.instruments`, `.mood`, `.vocals`, `.voice`, `.tempo`,
  `.language`, `.character` (acoustic/electric); `cc.stats.listens`, `.downloads`,
  `.favorited`, `.playlisted`, `.rating`; `cc.proLicensing`.
- Gate + Browser-Verify (CC-Seite zeigt Karte; echter Track mit musicinfo/stats).

### Slice 3 — Format-Plumbing (Backend + shared)
- `audio-format.ts` in shared anlegen + exportieren.
- `cc-audio.ts`: `?format=`-Query (Schema bei :63), `resolveStreamUrl(jamendoId, format)`
  swappt Query-Param, Content-Type aus Meta (statt :114 hardcodiert), Default = mp32.
- `ccAudio`-Builder: v1 (endpoints.ts:74) UND Astro-Forward (:138) + Route-Template (:312)
  um optionalen `format`-Param erweitern (Query `?format=`).
- Per-Format-Download-URL-Helper (Pfad-Swap, gegen echte Jamendo-URL verifiziert).
- Gate.

### Slice 4 — RadioButtonControl + Player-Einbau
- Neues `RadioButtonControl<T>` (`components/ui/`, Geometrie-Vorlage
  `EmbossedSegmentedControl`): gleich breite, schmale Buttons, dezent runde Ecken
  (Token-verdrahtet), je ein `VfdDisplay` (1 Zeile, wenige Zellen, `brightness:
  dim` inaktiv / `bright` aktiv) als Mini-VFD mit `JAMENDO_FORMAT_META[f].label`.
- Einbau: in `PlayerProgress` (PlayerParts.tsx:535) **als Geschwister NEBEN/unter dem
  Analyzer-`<button>`, NICHT darin** (der Button togglet sonst bei jedem Format-Klick
  den Analyzer-Modus). Nur rendern wenn neuer optionaler Prop gesetzt (CC).
- `AudioPreviewPlayer` (AudioPreviewPlayer.tsx:1206): optionaler Format-State.
  Streambare Formate = `JAMENDO_FORMAT_ORDER.filter(f => media.canPlayType(meta.mime))`
  (MP3 immer; ogg/flac per Detection). Initial = `DEFAULT_STREAM_FORMAT` bzw.
  localStorage `mc.ccAudioFormat`. Bei Wechsel: `previewUrl` mit `?format=` neu setzen,
  **`currentTime` und Play/Pause-Zustand erhalten** (vor Reload merken, nach `loadeddata`
  wiederherstellen + ggf. weiterspielen). Minimal-invasiv — kein Refactor des Players.
- Gate + Browser-Verify (Format-Wechsel spielt korrekt, Position bleibt; FLAC-Button nur
  wenn Browser kann). **Kein unbeaufsichtigtes Playback** — muted/sofort-pause.

### Slice 5 — Download-Dropdown
- Quadratischer `EmbossedButton` (Download-Icon) neben dem Download-Button in der
  CcInfoCard; öffnet kleines Format-Menü (neues Dropdown-Primitive, da keins existiert —
  Klick-außerhalb-schließt, ESC-schließt, a11y-Rollen). Auswahl setzt Download-URL im
  gewählten Format (alle 4). Gate + Browser-Verify.

### Slice 6 — Bandcamp-Support-Button
- **Erkennung:** bestehenden `bandcampAdapter.searchTrack({ artist, title })`
  (`services/plugins/bandcamp/adapter.ts:451`) wiederverwenden — Fuzzysearch +
  Confidence-Scoring (`MATCH_MIN_CONFIDENCE=0.6`, adapter.ts:59). Bei `found` →
  `result.track.webUrl` = Bandcamp-Track-URL. `SearchQuery`-Shape `{ artist, title, … }`
  aus `services/types.ts` (vor Bau Export-Pfad von `bandcampAdapter` verifizieren —
  registry importiert `bandcampPlugin` aus `./bandcamp/index.js`).
- **Titel NICHT bereinigen:** vollen Jamendo-Titel suchen (inkl. „(… remix)" / „feat. …").
  Verifiziert: Remix-Tracks (VUfGx „sad robot (…remix)", 3nZE2 „i want to be a machine
  (procacci remix)") liefern voll korrekt **keinen** Treffer; eine bereinigte Suche
  fände das **Original** und würde den Remix fälschlich darauf verlinken (falscher Track).
  qsFkn (Lollita) ist gar nicht auf Bandcamp → kein Treffer. **Edge-Guard:** enthält der
  Jamendo-Titel `remix|version|edit|feat`, das der Bandcamp-Treffer-Titel NICHT trägt
  (Adapter-Normalisierung könnte sonst aufs Original matchen) → Treffer verwerfen.
- **Async + Cache:** dedizierter Endpoint `GET /api/v1/cc/bandcamp/:jamendoId`
  (+ Astro-Forward, analog zu `ccAudio`): löst artist+title aus dem CC-Track auf
  (`getCcTrack`/DB), ruft `searchTrack`, liefert `{ bandcampUrl?: string }`.
  In-Process-Cache mit TTL **inkl. Negativ-Treffer** (Tracks ohne Bandcamp nicht erneut
  scrapen). Läuft NICHT im Resolve. Frontend lädt progressiv nach Render (wie artist-info).
  Optional später: `bandcamp_url` auf `cc_tracks` persistieren (Drizzle-Migration).
- **Frontend:** Button in `CcInfoCard` **ÜBER** dem Download-Button, nur wenn `bandcampUrl`
  da. `EmbossedButton` mit `PlatformIcon platform="bandcamp"` + Label
  `t("cc.buyBandcamp")` (= „Buy on Bandcamp"), `target="_blank" rel="noopener noreferrer"`.
- Gate + Browser-Verify an ywdl7 (pornophonique „sad robot" →
  `pornophonique.bandcamp.com/track/sad-robot`). **Outgoing-Scrape**: Timeout +
  Cache, keine Endlos-Retries.

## Verified facts

- `getCcTrack` ohne `include`, `jamendoFetch("/tracks", { id, limit: 1 })` — `client.ts:174` (grep).
- `getSimilarCcTracks` nutzt `include: "musicinfo"` — `client.ts:197` (grep); liest nur `tags.genres`.
- Bestehende schmale `JamendoTrackRaw.musicinfo = { tags?: { genres?: string[] } }` — `types.ts:43` (read).
- Exakte Jamendo-Felder aus echtem Call (`include=musicinfo+stats+licenses`), alle Strings `"true"/"false"` bei licenses:
  musicinfo{vocalinstrumental,gender,speed,acousticelectric?,lang?,tags{genres,instruments,vartags}},
  stats{rate_listened_total,rate_downloads_total,playlisted,favorited,likes,dislikes,avgnote,notes},
  licenses{cc,ccnc,ccnd,ccsa,prolicensing,probackground}; Top-Level zusätzlich prourl, shorturl, lyrics, position, content_id_free.
- Geteilter Player `AudioPreviewPlayer`→`PlayerProgress`(VfdDisplay) für C+CC — `PlayerParts.tsx:535` (research+read). Analyzer-`<button>` togglet Analyzer-Modus bei Klick → Selector muss Geschwister sein.
- Proxy ohne Format-Param, Content-Type hardcodiert `audio/mpeg` — `cc-audio.ts:114` (grep).
- Jamendo-URL-Muster: Stream `?trackid=X&format=mp31`, Download `/download/track/X/mp32/` — `client.test.ts:27-28` (research).
- `ccAudio`-Builder doppelt: v1 `endpoints.ts:74`, Astro-Forward `:138`, Route-Template `:312` (grep).
- `ApiCcTrack` `api.ts:201`, `CcTrackResult` `app.ts:168`, `CcTrackContentConfiguration` `media-card.ts:127`, `toApiCcTrack` `cc-share-response.ts:25`, `parseCcResolveResponse` `parsers.ts:166`, `buildCcShareConfig` `parsers.ts:531`, `mapJamendoTrack` `client.ts:124` (grep).
- `CcInfoCard` in der LINKEN Spalte (unter MediaSummaryCard) — `DesktopShareLayout.tsx:61-86` (read); Mobile rendert CcInfoCard bei `MobileShareLayout.tsx:44-46` (grep).
- `formatCount` nur lokal in `ArtistProfileSection.tsx:96` (grep) → nach `lib/format/count.ts` extrahieren, beide Konsumenten umstellen.
- i18n über `t("cc.*")`; bestehende Keys: cc.download, cc.sectionTitle, cc.openOnJamendo, cc.licenseUnknown, cc.opensInNewWindow (grep).
- `VfdDisplay` `brightness: bright|normal|dim|ghost` (VfdBrightness) — research; `EmbossedSegmentedControl` = gleich breite Segmente, Geometrie-Vorlage — research.
- Bestehender `bandcampAdapter.searchTrack(query)` mit Fuzzysearch + Confidence (`MATCH_MIN_CONFIDENCE=0.6`) — `bandcamp/adapter.ts:451,59` (read). Liefert `MatchResult{found,track{webUrl},confidence}`.
- **Live verifiziert**: Bandcamp-Fuzzysearch findet pornophonique „sad robot" → `pornophonique.bandcamp.com/track/sad-robot` (echter Call gegen `bandcamp.com/api/fuzzysearch/2/app_autocomplete`). Remix-Fremdtreffer fällt per Confidence raus. `normalizeBandcampResultUrl` (adapter.ts:210) glättet den doppelten URL-Präfix der Search-Response.
- `PlatformIcon platform="bandcamp"` rendert SiBandcamp — frühere Research.
- Artist-Website-Signal nutzlos: 0/94 CC-Artists mit Bandcamp-Website (DB-Query) → Suche ist der einzige Weg.
- Live verifiziert (3 Tracks, echte Fuzzysearch): ywdl7 „sad robot" → Treffer (Button); VUfGx/3nZE2 (Remixe) + qsFkn (Lollita) → korrekt **kein** Treffer mit Voll-Titel. Bereinigte Suche fände bei den Remixen nur das Original → darf NICHT verlinkt werden.

## Checklist

- [ ] Slice 1: Daten-Layer durch alle 6 Schichten, Gates grün
- [ ] Slice 2: Details-Karte (Desktop+Mobile) + Pro-Hinweis, formatCount extrahiert, Browser-verifiziert
- [ ] Slice 3: Format-Plumbing, Download-URL-Pfad-Swap gegen echte Jamendo-URL verifiziert
- [ ] Slice 4: RadioButtonControl + Player-Einbau (CC-only, Selector als Geschwister), FLAC via canPlayType, Position erhalten
- [ ] Slice 5: Download-Dropdown (alle 4 Formate)
- [ ] Slice 6: Bandcamp-Support-Button (Suche via bandcampAdapter, async+gecacht, Button über Download), an ywdl7 verifiziert
- [ ] All code references verified (functions, scripts, paths, env vars, package-manager commands)
- [ ] Pre-push-Gates pro Slice (check, lint, doctor:diff) grün
- [ ] Memory `project_player_c_cc_divergence` beachtet: Player nur additiv per Prop, kein Fork/Refactor
