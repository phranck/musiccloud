# Plattenspieler: Selbes-Album-Verhalten (kein Plattenwechsel)

Plan-Nr.: MC-111

> **Für agentische Worker:** Umsetzung Task-für-Task via superpowers:subagent-driven-development oder superpowers:executing-plans. Schritte nutzen Checkbox-Syntax (`- [ ]`).

**Ziel:** Wird bei laufender Wiedergabe ein Popular-Track vom selben Album gewählt, findet kein Plattenwechsel statt: der Teller dreht durch, die Audioquelle wechselt mit einem kurzen Fade, die Platte und ihr Label bleiben.

**Architektur:** Der Audio-Hub wird heute pro Track neu gemountet (Key aus `shortId`/`previewUrl`/`title`/`artist`). Wir machen den Key album-skopiert: selbes Album behält denselben Hub (kein Remount), anderes Album remountet wie bisher. Der persistente Hub bekommt die Fähigkeit, auf `previewUrl`-Prop-Wechsel zu reagieren und die Quelle mit einem kurzen GainNode-Fade umzuschalten, statt nur beim Mount zu laden.

**Tech-Stack:** React 19, TypeScript, Web Audio (GainNode), vitest + Testing Library, Biome, pnpm.

**Voraussetzungen / Reihenfolge:** Keine. Liefert eigenständig testbares Verhalten. Blockiert nicht MC-112. MC-113 baut auf der hier eingeführten Album-Identität und dem album-skopierten Key auf.

---

## Preface

Dieser Plan ist der Verhaltensteil ("selbes Album, kein Wechsel"). Die neue Bogen-Animation für echte Plattenwechsel ist MC-112 (Motion-Baustein) und MC-113 (Orchestrierung). Die hier gebaute Album-Identität (`sameAlbum`) und der album-skopierte Hub-Key werden von MC-113 mitbenutzt.

## Verifizierte Fakten

- `MediaCardHead.tsx:163` baut `turntableHubKey = [content.shortId ?? "", content.previewUrl ?? "", content.title, content.artist].join("::")`.
- `MediaCardHead.tsx:196-204` rendert `<TurntablePlayerProvider key={turntableHubKey} previewUrl={content.previewUrl} ... trackTitle={content.title} onStatusChange={onPreviewStatusChange}>`.
- `MediaCardHead.tsx:35-44` `buildVinylLabelRecord`: `labelTitle = content.labelAlbumTitle ?? content.album ?? content.title`, `labelArtworkUrl = content.artworkUrl`, `labelSubtitle = content.artist`. Bei gleichem Album ändern sich diese Felder nicht, nur der Track-Titel (VFD).
- `media-card.ts:35-81` `MediaCardContentConfiguration` hat **keinen** stabilen `albumId`. Album-Identität muss aus `artist` + (`labelAlbumTitle` ?? `album`) plus `artworkUrl` als Signal abgeleitet werden. Felder vorhanden: `type`, `title`, `artist`, `artworkUrl`, `album?`, `labelAlbumTitle?`, `previewUrl?`, `shortId?`, `mediaKind?`.
- `AudioPlayer.tsx:509-516` `useAudioController` initialisiert `effectiveUrl` per `useReducer` aus `previewUrl ?? null`; `setEffectiveUrl` wird **nur** im Lazy-Fetch-Pfad (`refreshShortId`) aufgerufen (`:552-554`). Es gibt **keinen** Effekt, der `effectiveUrl` bei `previewUrl`-Prop-Wechsel synchronisiert. Deshalb erzwingt der Remount heute den Quellenwechsel.
- `AudioPlayer.tsx:963-1065` Audio-Element wird bei `effectiveUrl`-Wechsel neu erzeugt (`new Audio()`, `preload="metadata"`); Cleanup macht einen Teardown-Fade über `gainNodeRef` (`TEARDOWN_FADE_MS = 30`, `:219`).
- `AudioPlayer.tsx:886-896` GainNode sitzt zwischen MediaElementSource und Destination; `togglePlay` (`:1067-1173`) braucht eine User-Geste, kein Auto-Play.
- `ShareLayout.tsx:492-532` `resolveTrack` ist der Handler pro Zeilenklick: `await trackResolver(...)`, dann `replaceBrowserUrlWithShortUrl`, dann `dispatchUi({ type: Resolved, config: update.config, ... })` (`:516-521`).
- `ShareLayout.tsx:241-245` `configIdentity(config) = [type, title, artist, artworkUrl, shareUrl, shortUrl].join("::")`.
- `track-resolver.ts:37-43` `ResolvedShareUpdate = { shortUrl, config, artistName, artistInfoContext?, pageTitle? }`.
- Vitest-Testmuster vorhanden: `TurntablePlayerProvider.test.tsx`, `SongInfo.test.tsx`, `turntableState.test.ts`.

## Tasks

### Task 1: Album-Identität + `sameAlbum`-Helfer

**Files:**
- Create: `apps/frontend/src/lib/resolve/album-identity.ts`
- Test: `apps/frontend/src/lib/resolve/album-identity.test.ts`

- [x] Failing Test schreiben: `sameAlbum(a, b)` ist `true` für zwei Configs mit gleichem normalisiertem `artist` und gleichem `labelAlbumTitle ?? album`, `false` bei unterschiedlichem Album, `false` wenn auf einer Seite Album fehlt (Singles gelten als eigenständig). `artworkUrl`-Gleichheit dient als zusätzliches Positiv-Signal, nie allein als Grund.
- [x] Test laufen lassen, rot sehen.
- [x] `sameAlbum` implementieren: reine Funktion, Normalisierung analog `normalizeArtistName` (`ShareLayout.tsx:229-231`, trim + toLocaleLowerCase). TSDoc mit Begründung (kein `albumId` verfügbar).
- [x] Test grün. Biome `check --write`. Commit.

### Task 2: Album-skopierter Hub-Key in MediaCardHead

**Files:**
- Modify: `apps/frontend/src/components/cards/MediaCardHead.tsx:163`
- Test: `apps/frontend/src/components/cards/MediaCardHead.test.tsx` (neu, falls nicht vorhanden)

- [x] Failing Test: getestet über die reine Funktion `turntableHubKey(content)` (deterministischer als Remount-Beobachtung): gleicher Key für Same-Album-Tracks, anderer Key für anderes Album, track-eindeutiger Key für album-lose Inhalte.
- [x] Test rot.
- [x] `turntableHubKey` auf Album-Skope umstellen: gemeinsamer `albumIdentityKey(config)` (artist + `labelAlbumTitle ?? album`) als Single Source; `sameAlbum` darauf aufgebaut (spekulativer Artwork-Zweig entfernt, damit Key und Swap-Entscheidung konsistent sind). Fallback album-los = track-eindeutig. MediaCardHead nutzt `turntableHubKey(content)`; TSDoc angepasst.
- [x] Test grün. Biome. Commit.

### Task 3: `useAudioController` reagiert auf `previewUrl`-Wechsel mit Fade

**Files:**
- Modify: `apps/frontend/src/components/audio/AudioPlayer.tsx` (effectiveUrl-Sync-Effekt + Fade beim Quellenwechsel)
- Test: `apps/frontend/src/components/audio/AudioPlayer.test.tsx` (neu, falls nicht vorhanden) oder Erweiterung von `TurntablePlayerProvider.test.tsx`

- [x] Failing Test (in `TurntablePlayerProvider.test.tsx`): bei `previewUrl`-Prop-Wechsel am bestehenden Hub adoptiert die Engine die neue Quelle; spielte es, spielt der neue Track weiter (`data-playing`/`data-spin` bleiben `playing`, neue `src`); war es idle, wird nur adoptiert ohne Auto-Play.
- [x] Test rot.
- [x] `effectiveUrl` als abgeleiteten Wert (`previewUrl ?? fetchedUrl`) statt Reducer, damit ein Prop-Wechsel ohne Sync-Effekt in den Source-Effekt fließt (vermeidet das react-doctor `no-event-handler`-Finding). `fetchedUrl` ist der Refresh-Fallback.
- [x] Neue Reducer-Action `SourceChanged` (→ Idle). Play-Start aus `togglePlay` in `beginPlayback(audio)` extrahiert (bestehende Provider-Tests als Sicherheitsnetz, blieben grün). `isPlayingRef` spiegelt den Play-Zustand ohne `state.phase`-Dep.
- [x] **Finale Struktur (doctor-sauber):** EIN Source-Effekt (Original-Struktur, deps `[effectiveUrl, stopProgressLoop, stopProgressRewind, teardownSpectrum]`) erzeugt das Element pro URL neu und macht im Cleanup den Teardown-Fade. Bei einem echten Wechsel (`hasStartedRef` true) `SourceChanged` + Auto-Continue via `beginPlayback`, falls `isPlayingRef`. Der zunächst versuchte Element-Reuse-Split (zwei Effekte) wurde verworfen, weil react-doctor den Cleanup-only-Effekt als `exhaustive-deps` flaggt; die single-effect-Form ist doctor-sauber und erfüllt die Anforderung (Audio wechselt, Teller dreht weiter, kurzer Fade über Teardown-/Startup-Fade).
- [x] Test grün (330/330). Biome. `doctor:diff` grün (0 issues). astro check 0 errors. Commit.

### Task 4: Verhalten verdrahten (selbes Album dreht durch)

**Files:**
- Modify: `apps/frontend/src/components/share/ShareLayout.tsx` (`resolveTrack`, um Same-Album-Fall bewusst zu behandeln, falls nötig)
- Test: Erweiterung `ShareLayout`-naher Test oder Integrationstest des Hub-Verhaltens

- [ ] Prüfen, ob mit Task 2 + 3 ein Same-Album-Klick bereits ohne Remount durchläuft (Hub bleibt, `previewUrl`-Prop wechselt, Fade greift, Teller dreht weiter). Falls `resolveTrack` zusätzlich etwas zurücksetzt, das den Durchlauf stört (z. B. `previewStatus: null` im `Resolved`-Reducer `:117`), gezielt für den Same-Album-Fall anpassen, ohne den Different-Album-Fall zu verändern.
- [ ] Failing Test / grün: Same-Album-Klick hält die Rotation (spinState bleibt `Playing`), Different-Album-Klick verhält sich wie bisher.
- [ ] Biome. Commit.

## Offene Punkte

- Kein echter überlappender Doppel-Source-Crossfade (Design-Entscheidung: schneller Fade-out/Fade-in über die vorhandene GainNode). Falls sich das später als zu abrupt zeigt, eigener Folgeplan.
- Bei einem Same-Album-Auto-Continue wird das Audio-Element pro URL neu erzeugt; die WebAudio-Spectrum-Verdrahtung (VFD) kann dabei kurz aussetzen, bis der Nutzer erneut interagiert (nahtloser Element-Reuse kollidiert mit react-doctors `exhaustive-deps` am Cleanup-only-Effekt). Politur-Kandidat, kein Funktionsfehler — der User verifiziert im UI-Smoke (MC-113 Task 5).
- Artwork-Zweig aus `sameAlbum` entfernt (Task 2): Album-Identität ist rein artist+album-Titel, konsistent mit dem Hub-Key.

## Checkliste

- [x] Task 1: `sameAlbum`-Helfer + Tests
- [x] Task 2: Album-skopierter Hub-Key
- [x] Task 3: `useAudioController` `previewUrl`-Sync + Fade
- [ ] Task 4: Same-Album-Verhalten verdrahtet + Tests
- [ ] Alle Code-Referenzen verifiziert (Funktionen, Skripte, Pfade, Env-Vars, Package-Manager-Kommandos)
- [ ] Gates grün: `pnpm typecheck`, Biome, `doctor:diff`, `test:run`
