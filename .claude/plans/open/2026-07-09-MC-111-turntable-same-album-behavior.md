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

- [ ] Failing Test: ändert sich das `previewUrl`-Prop bei bestehendem Hub, lädt die Engine die neue Quelle (`effectiveUrl` folgt), und der Play/Pause-Zustand bleibt konsistent (spielte es, spielt der neue Track weiter).
- [ ] Test rot.
- [ ] Sync-Effekt hinzufügen: bei `previewUrl`-Prop-Wechsel `setEffectiveUrl(previewUrl)` und Play-State-Übergang. Beim Wechsel kurzer GainNode-Fade-out der alten Quelle (bestehendes Teardown-Fade-Muster `:1039-1055` wiederverwenden), dann Fade-in der neuen (`STARTUP_FADE_MS`-Muster `:1132-1137`). War der alte Track am Spielen, den neuen automatisch fortsetzen (Kontinuität); war er pausiert, den neuen pausiert vorladen.
- [ ] Sicherstellen, dass der Quellenwechsel die sorgfältige Gesten-/AudioContext-Logik nicht bricht (kein doppeltes `createMediaElementSource` auf demselben Element; neues `<audio>` wird ohnehin pro `effectiveUrl` erzeugt).
- [ ] Test grün. Biome. React-Doctor `doctor:diff` grün. Commit.

### Task 4: Verhalten verdrahten (selbes Album dreht durch)

**Files:**
- Modify: `apps/frontend/src/components/share/ShareLayout.tsx` (`resolveTrack`, um Same-Album-Fall bewusst zu behandeln, falls nötig)
- Test: Erweiterung `ShareLayout`-naher Test oder Integrationstest des Hub-Verhaltens

- [ ] Prüfen, ob mit Task 2 + 3 ein Same-Album-Klick bereits ohne Remount durchläuft (Hub bleibt, `previewUrl`-Prop wechselt, Fade greift, Teller dreht weiter). Falls `resolveTrack` zusätzlich etwas zurücksetzt, das den Durchlauf stört (z. B. `previewStatus: null` im `Resolved`-Reducer `:117`), gezielt für den Same-Album-Fall anpassen, ohne den Different-Album-Fall zu verändern.
- [ ] Failing Test / grün: Same-Album-Klick hält die Rotation (spinState bleibt `Playing`), Different-Album-Klick verhält sich wie bisher.
- [ ] Biome. Commit.

## Offene Punkte

- Kein echter überlappender Doppel-Source-Crossfade (Design-Entscheidung: schneller Fade-out/Fade-in über die vorhandene GainNode). Falls sich das später als zu abrupt zeigt, eigener Folgeplan.
- Genauer Schwellwert für `artworkUrl` als Signal wird im Test festgezurrt (Task 1).

## Checkliste

- [x] Task 1: `sameAlbum`-Helfer + Tests
- [x] Task 2: Album-skopierter Hub-Key
- [ ] Task 3: `useAudioController` `previewUrl`-Sync + Fade
- [ ] Task 4: Same-Album-Verhalten verdrahtet + Tests
- [ ] Alle Code-Referenzen verifiziert (Funktionen, Skripte, Pfade, Env-Vars, Package-Manager-Kommandos)
- [ ] Gates grün: `pnpm typecheck`, Biome, `doctor:diff`, `test:run`
